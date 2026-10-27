import { query, withTransaction } from "./db";
import { DEFAULT_PREFERENCES, preferencesSchema, type Job, type JobInput, type JobStatus, type Preferences } from "./types";
import { dedupeKey } from "./text";

// ---------- Jobs ----------

interface JobRow {
  id: string;
  source: string;
  external_id: string;
  company: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  salary_min: number | null;
  salary_max: number | null;
  posted_at: Date | null;
  first_seen_at: Date;
  status: JobStatus;
  status_at: Date | null;
}

const toJob = (r: JobRow): Job => ({
  id: Number(r.id),
  source: r.source,
  externalId: r.external_id,
  company: r.company,
  title: r.title,
  location: r.location,
  remote: r.remote,
  url: r.url,
  description: r.description,
  tags: r.tags,
  salaryMin: r.salary_min,
  salaryMax: r.salary_max,
  postedAt: r.posted_at,
  firstSeenAt: r.first_seen_at,
  status: r.status,
  statusAt: r.status_at,
});

export async function upsertJobs(jobs: JobInput[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  await withTransaction(async (client) => {
    for (const j of jobs) {
      const res = await client.query<{ inserted: boolean }>(
        `INSERT INTO jobs (source, external_id, dedupe_key, company, title, location, remote, url, description,
                           tags, salary_min, salary_max, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (source, external_id) DO UPDATE SET
           dedupe_key = EXCLUDED.dedupe_key, company = EXCLUDED.company, title = EXCLUDED.title,
           location = EXCLUDED.location, remote = EXCLUDED.remote, url = EXCLUDED.url,
           description = EXCLUDED.description, tags = EXCLUDED.tags, salary_min = EXCLUDED.salary_min,
           salary_max = EXCLUDED.salary_max, posted_at = COALESCE(EXCLUDED.posted_at, jobs.posted_at),
           last_seen_at = now()
         RETURNING (xmax = 0) AS inserted`,
        [
          j.source,
          j.externalId,
          dedupeKey(j.company, j.title),
          j.company,
          j.title,
          j.location,
          j.remote,
          j.url,
          j.description,
          j.tags,
          j.salaryMin,
          j.salaryMax,
          j.postedAt,
        ],
      );
      if (res.rows[0]?.inserted) inserted++;
      else updated++;
    }
  });
  return { inserted, updated };
}

/**
 * Jobs seen within the window, collapsed across sources by company+title
 * (keeping the copy with the most user state, then the newest).
 */
export async function listRecentJobs(maxAgeDays: number): Promise<Job[]> {
  const rows = await query<JobRow>(
    `SELECT DISTINCT ON (dedupe_key) *
       FROM jobs
      WHERE COALESCE(posted_at, first_seen_at) > now() - make_interval(days => $1)
         OR status IN ('saved', 'applied')
      ORDER BY dedupe_key,
               CASE status WHEN 'applied' THEN 0 WHEN 'saved' THEN 1 WHEN 'hidden' THEN 2 ELSE 3 END,
               COALESCE(posted_at, first_seen_at) DESC`,
    [maxAgeDays],
  );
  return rows.map(toJob);
}

export async function getJob(id: number): Promise<Job | null> {
  const rows = await query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function setJobStatus(id: number, status: JobStatus): Promise<void> {
  await query("UPDATE jobs SET status = $2, status_at = now() WHERE id = $1", [id, status]);
}

// ---------- Preferences ----------

export async function getPreferences(): Promise<Preferences> {
  const rows = await query<{ data: unknown }>("SELECT data FROM preferences WHERE id = 1");
  if (!rows[0]) return DEFAULT_PREFERENCES;
  const parsed = preferencesSchema.safeParse(rows[0].data);
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await query(
    `INSERT INTO preferences (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(prefs)],
  );
}

// ---------- Resumes ----------

export async function getMasterResume(): Promise<{ markdown: string; updatedAt: Date } | null> {
  const rows = await query<{ markdown: string; updated_at: Date }>(
    "SELECT markdown, updated_at FROM master_resume WHERE id = 1",
  );
  return rows[0] ? { markdown: rows[0].markdown, updatedAt: rows[0].updated_at } : null;
}

export async function saveMasterResume(markdown: string): Promise<void> {
  await query(
    `INSERT INTO master_resume (id, markdown, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET markdown = EXCLUDED.markdown, updated_at = now()`,
    [markdown],
  );
}

export interface TailoredResume {
  id: number;
  jobId: number;
  markdown: string;
  changes: string[];
  gaps: string[];
  guidance: string | null;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TailoredRow {
  id: string;
  job_id: string;
  markdown: string;
  changes: string[];
  gaps: string[];
  guidance: string | null;
  model: string;
  created_at: Date;
  updated_at: Date;
}

const toTailored = (r: TailoredRow): TailoredResume => ({
  id: Number(r.id),
  jobId: Number(r.job_id),
  markdown: r.markdown,
  changes: r.changes,
  gaps: r.gaps,
  guidance: r.guidance,
  model: r.model,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function createTailoredResume(input: {
  jobId: number;
  markdown: string;
  changes: string[];
  gaps: string[];
  guidance: string | null;
  model: string;
}): Promise<number> {
  const rows = await query<{ id: string }>(
    `INSERT INTO tailored_resumes (job_id, markdown, changes, gaps, guidance, model)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.jobId, input.markdown, JSON.stringify(input.changes), JSON.stringify(input.gaps), input.guidance, input.model],
  );
  return Number(rows[0].id);
}

export async function getTailoredResume(id: number): Promise<TailoredResume | null> {
  const rows = await query<TailoredRow>("SELECT * FROM tailored_resumes WHERE id = $1", [id]);
  return rows[0] ? toTailored(rows[0]) : null;
}

export async function listTailoredForJob(jobId: number): Promise<TailoredResume[]> {
  const rows = await query<TailoredRow>(
    "SELECT * FROM tailored_resumes WHERE job_id = $1 ORDER BY created_at DESC",
    [jobId],
  );
  return rows.map(toTailored);
}

/** Job id -> newest tailored resume id. */
export async function latestTailoredByJob(): Promise<Map<number, number>> {
  const rows = await query<{ job_id: string; id: string }>(
    "SELECT DISTINCT ON (job_id) job_id, id FROM tailored_resumes ORDER BY job_id, created_at DESC",
  );
  return new Map(rows.map((r) => [Number(r.job_id), Number(r.id)]));
}

/** Jobs that already have a resume or were already tried by auto-tailor. */
export async function listJobIdsAlreadyTailored(): Promise<Set<number>> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM jobs j
      WHERE auto_tailor_at IS NOT NULL
         OR EXISTS (SELECT 1 FROM tailored_resumes t WHERE t.job_id = j.id)`,
  );
  return new Set(rows.map((r) => Number(r.id)));
}

/** Atomically claim a job for auto-tailoring. Returns false if another run already claimed it. */
export async function claimAutoTailor(jobId: number): Promise<boolean> {
  const rows = await query<{ id: string }>(
    "UPDATE jobs SET auto_tailor_at = now() WHERE id = $1 AND auto_tailor_at IS NULL RETURNING id",
    [jobId],
  );
  return rows.length > 0;
}

export async function updateTailoredMarkdown(id: number, markdown: string): Promise<void> {
  await query("UPDATE tailored_resumes SET markdown = $2, updated_at = now() WHERE id = $1", [id, markdown]);
}

// ---------- Ingest runs ----------

export interface SourceResult {
  source: string;
  fetched: number;
  kept: number;
  inserted: number;
  error?: string;
}

export async function startIngestRun(): Promise<number> {
  const rows = await query<{ id: string }>("INSERT INTO ingest_runs DEFAULT VALUES RETURNING id");
  return Number(rows[0].id);
}

export async function finishIngestRun(id: number, results: SourceResult[]): Promise<void> {
  await query("UPDATE ingest_runs SET finished_at = now(), results = $2 WHERE id = $1", [id, JSON.stringify(results)]);
}

export interface AutoTailorResult {
  candidates: number;
  created: number;
  errors: string[];
  skipped?: string;
}

export async function saveAutoTailorResult(runId: number, result: AutoTailorResult): Promise<void> {
  await query("UPDATE ingest_runs SET auto_tailor = $2 WHERE id = $1", [runId, JSON.stringify(result)]);
}

export async function getLastIngestRun(): Promise<{
  finishedAt: Date | null;
  results: SourceResult[];
  autoTailor: AutoTailorResult | null;
} | null> {
  const rows = await query<{ finished_at: Date | null; results: SourceResult[]; auto_tailor: AutoTailorResult | null }>(
    "SELECT finished_at, results, auto_tailor FROM ingest_runs ORDER BY started_at DESC LIMIT 1",
  );
  return rows[0]
    ? { finishedAt: rows[0].finished_at, results: rows[0].results, autoTailor: rows[0].auto_tailor }
    : null;
}
