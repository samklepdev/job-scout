import {
  claimAutoTailor,
  createTailoredResume,
  getMasterResume,
  getPreferences,
  listJobIdsAlreadyTailored,
  listRecentJobs,
  saveAutoTailorResult,
  type AutoTailorResult,
} from "./repo";
import { rankJobs, type ScoredJob } from "./scoring";
import { tailorResume, TAILOR_MODEL } from "./tailor";
import type { Job, Preferences } from "./types";

/** Best-scoring active jobs at or above the threshold that don't have a resume yet. */
export function pickAutoTailorCandidates(ranked: ScoredJob[], prefs: Preferences, alreadyDone: Set<number>): Job[] {
  return ranked
    .filter(
      ({ job, score }) =>
        (job.status === "new" || job.status === "saved") &&
        !score.excluded &&
        score.score >= prefs.autoTailor.minScore &&
        !alreadyDone.has(job.id),
    )
    .slice(0, prefs.autoTailor.maxPerRun)
    .map((r) => r.job);
}

let running = false;

/**
 * Tailor the master resume for each top match that doesn't have one yet.
 * Each job is tried once (claimed atomically), so failures don't retry on every refresh;
 * you can always tailor it by hand from the job page.
 */
export async function runAutoTailor(runId?: number, concurrency = 2): Promise<AutoTailorResult> {
  const finish = async (result: AutoTailorResult) => {
    if (runId) await saveAutoTailorResult(runId, result);
    return result;
  };
  if (running) return { candidates: 0, created: 0, errors: [], skipped: "Already running" };
  running = true;
  try {
    const prefs = await getPreferences();
    if (!prefs.autoTailor.enabled) return finish({ candidates: 0, created: 0, errors: [], skipped: "Auto-tailor is off" });
    if (!process.env.ANTHROPIC_API_KEY)
      return finish({ candidates: 0, created: 0, errors: [], skipped: "ANTHROPIC_API_KEY is not set" });
    const master = await getMasterResume();
    if (!master) return finish({ candidates: 0, created: 0, errors: [], skipped: "Add your master resume first" });

    const [jobs, done] = await Promise.all([listRecentJobs(prefs.maxAgeDays), listJobIdsAlreadyTailored()]);
    const candidates = pickAutoTailorCandidates(rankJobs(jobs, prefs), prefs, done);

    let created = 0;
    const errors: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < candidates.length) {
        const job = candidates[next++];
        if (!(await claimAutoTailor(job.id))) continue;
        try {
          const r = await tailorResume({ masterResume: master.markdown, job });
          await createTailoredResume({
            jobId: job.id,
            markdown: r.resume_markdown,
            changes: r.changes,
            gaps: r.gaps,
            guidance: null,
            model: TAILOR_MODEL,
          });
          created++;
        } catch (err) {
          errors.push(`${job.company} – ${job.title}: ${(err as Error).message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
    return finish({ candidates: candidates.length, created, errors });
  } finally {
    running = false;
  }
}
