import { fetchAshby, fetchGreenhouse, fetchLever } from "./sources/ats";
import { fetchHnWhoIsHiring, fetchRemoteOk, fetchRemotive } from "./sources/aggregators";
import { finishIngestRun, getPreferences, startIngestRun, upsertJobs, type SourceResult } from "./repo";
import { isEngineeringRole } from "./text";
import type { JobInput, Preferences } from "./types";

interface Task {
  source: string;
  run: () => Promise<JobInput[]>;
}

export function buildTasks(prefs: Preferences): Task[] {
  const tasks: Task[] = [
    ...prefs.boards.greenhouse.map((s) => ({ source: `greenhouse:${s}`, run: () => fetchGreenhouse(s) })),
    ...prefs.boards.lever.map((s) => ({ source: `lever:${s}`, run: () => fetchLever(s) })),
    ...prefs.boards.ashby.map((s) => ({ source: `ashby:${s}`, run: () => fetchAshby(s) })),
  ];
  if (prefs.sources.remotive) tasks.push({ source: "remotive", run: fetchRemotive });
  if (prefs.sources.remoteok) tasks.push({ source: "remoteok", run: fetchRemoteOk });
  if (prefs.sources.hn) tasks.push({ source: "hn", run: fetchHnWhoIsHiring });
  return tasks;
}

async function runTask(task: Task): Promise<SourceResult> {
  try {
    const fetched = await task.run();
    const kept = fetched.filter((j) => j.url && isEngineeringRole(j.title));
    const { inserted } = kept.length ? await upsertJobs(kept) : { inserted: 0 };
    return { source: task.source, fetched: fetched.length, kept: kept.length, inserted };
  } catch (err) {
    return { source: task.source, fetched: 0, kept: 0, inserted: 0, error: (err as Error).message };
  }
}

/** Fetch every configured source (a few at a time) and upsert the engineering roles. */
export async function runIngest(concurrency = 4): Promise<{ runId: number; results: SourceResult[] }> {
  const prefs = await getPreferences();
  const tasks = buildTasks(prefs);
  const runId = await startIngestRun();
  const results: SourceResult[] = [];

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      results.push(await runTask(task));
    }
  });
  await Promise.all(workers);

  results.sort((a, b) => a.source.localeCompare(b.source));
  await finishIngestRun(runId, results);
  return { runId, results };
}
