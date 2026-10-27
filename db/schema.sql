-- Job Scout schema. Safe to re-run (npm run db:migrate).

CREATE TABLE IF NOT EXISTS jobs (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,              -- greenhouse | lever | ashby | remotive | remoteok | hn
  external_id   TEXT NOT NULL,              -- id within the source
  dedupe_key    TEXT NOT NULL,              -- company|title, used to collapse cross-source duplicates
  company       TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT,
  remote        BOOLEAN NOT NULL DEFAULT FALSE,
  url           TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',   -- plain text
  tags          TEXT[] NOT NULL DEFAULT '{}',
  salary_min    INTEGER,
  salary_max    INTEGER,
  posted_at     TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'applied', 'hidden')),
  status_at     TIMESTAMPTZ,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS jobs_posted_idx ON jobs (COALESCE(posted_at, first_seen_at) DESC);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_dedupe_idx ON jobs (dedupe_key);

-- Single-row settings tables (id is always 1)
CREATE TABLE IF NOT EXISTS preferences (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_resume (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  markdown   TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tailored_resumes (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  markdown   TEXT NOT NULL,
  changes    JSONB NOT NULL DEFAULT '[]',
  gaps       JSONB NOT NULL DEFAULT '[]',
  guidance   TEXT,
  model      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tailored_job_idx ON tailored_resumes (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id          BIGSERIAL PRIMARY KEY,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  results     JSONB NOT NULL DEFAULT '[]'
);

-- Auto-tailoring: when a job was claimed for automatic tailoring (success or failure), so it's tried once.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS auto_tailor_at TIMESTAMPTZ;
ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS auto_tailor JSONB;
