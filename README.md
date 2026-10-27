# Job Scout

Personal job search tool: pulls the latest software engineering postings, ranks them against preferences you can tune, and automatically writes a resume tailored to each top match with Claude, ready for you to review and apply.

**Stack:** Next.js 16 (App Router, server actions) · TypeScript · CSS Modules · Postgres (`pg`, plain SQL) · Anthropic SDK

## Setup

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and ANTHROPIC_API_KEY
createdb job_scout                # or any Postgres 14+ database
npm run db:migrate                # idempotent, safe to re-run
npm run ingest                    # first pull of jobs (or use "Refresh jobs" in the UI)
npm run dev
```

Then:
1. **Resume** tab: paste your full master resume in Markdown.
2. **Preferences** tab: adjust titles, skills, weights, location, salary floor and job sources.
3. **Refresh jobs**: matches scoring 70+ get a tailored resume automatically, in the background.
4. **Resume ready** tab → open the tailored resume → review the changes and gaps → **Save as PDF** → apply.

Use **Tailor matches now** on the feed to catch up jobs already in your feed (e.g. right after adding your master resume). Any job can also be tailored by hand from its page, with optional guidance.

## Where jobs come from

Only public, no-auth JSON APIs. No scraping, so nothing breaks when a page layout changes.

| Source | What it covers |
| --- | --- |
| Greenhouse / Lever / Ashby boards | Direct from company career pages. Add companies by slug in Preferences (`boards.greenhouse.io/<slug>` etc.). |
| Remotive | Remote software dev roles |
| RemoteOK | Remote tech roles |
| HN "Who is hiring?" | Latest monthly thread, parsed from the `Company \| Role \| Location \| …` header line |

Non-engineering roles are dropped at ingest. The same company + title from multiple sources is collapsed into one job. Re-ingesting never resets your saved / applied / hidden status. If a board slug is wrong, the feed shows which source failed and why.

LinkedIn and Indeed aren't included: they have no public jobs API and block scraping. Many of the same roles appear on the company's own Greenhouse/Lever/Ashby board, so adding the companies you care about there is the reliable route.

## How ranking works (`src/lib/scoring.ts`)

Each job gets five 0–1 factor scores, combined into 0–100 using your slider weights:

- **Title**: matches one of your target titles (+ bonus for seniority terms)
- **Skills**: weighted skill matches in the title, tags and description. Aliases via `|` (`C#|.NET|dotnet: 4`). Matching about half your total skill weight counts as full marks, since postings rarely list a whole stack.
- **Location**: remote, or one of your cities
- **Salary**: meets your floor; unlisted pay is neutral, never penalized
- **Recency**: linear decay over your max-age window

**Hard filters** remove a job regardless of score: excluded title words, companies or keywords (e.g. "security clearance"), remote mode, a listed max salary below your floor, and age. Filtered jobs stay visible under **Filtered out** with the reason, so you can tell whether a filter is too aggressive. Each job page shows the full score breakdown.

## Auto-tailoring (`src/lib/autotailor.ts`)

After every refresh (UI button, `npm run ingest`, or the cron endpoint), each active job that:

- scores at or above your auto-tailor threshold (default 70),
- isn't filtered out, applied or hidden, and
- doesn't already have a tailored resume

gets one, highest scores first, up to a per-refresh cap (default 10) so API spend stays predictable. Anything over the cap is picked up on the next refresh. Two run at a time.

Each job is claimed atomically and tried **once**. A failed call is listed on the feed but isn't retried on every refresh. Retry it from the job page. Changing your master resume doesn't redo existing versions. Re-tailor the ones you care about from their job pages.

Threshold, cap and on/off are in **Preferences → Auto-tailor resumes**. In the UI the tailoring runs after the response (Next's `after()`), so refresh isn't blocked. The CLI waits and prints results (`npm run ingest -- --no-tailor` to skip).

## Resume tailoring (`src/lib/tailor.ts`)

Sends your master resume plus the posting to Claude (default `claude-sonnet-5-5`; override with `ANTHROPIC_MODEL`) and uses forced tool use to get structured output:

- the tailored resume in Markdown
- **what changed**, so you can review quickly
- **gaps**: requirements the posting asks for that your resume doesn't show

The prompt forbids inventing employers, dates, metrics or skills. It can only reorder, reword and trim what's in your master resume. Gaps are reported to you rather than papered over.

You can add per-job guidance (e.g. "lead with the payments work"), edit any version in place, keep multiple versions per job, print to PDF (a print stylesheet hides the UI), or download the `.md`.

## Scheduling refreshes

Either:

```bash
# crontab: every 6 hours
0 */6 * * * cd /path/to/job-scout && npm run ingest
```

or set `CRON_SECRET` and call the API (works with Vercel Cron, GitHub Actions, etc.):

```bash
curl -X POST https://your-host/api/ingest -H "Authorization: Bearer $CRON_SECRET"
```

The endpoint runs ingest and then auto-tailoring (append `?tailor=0` to skip). On serverless hosts, keep the per-refresh cap low enough to finish inside the function's time limit (`maxDuration` is 300s; budget ~30s per resume, two at a time).

## Project layout

```
db/schema.sql                 tables: jobs, preferences, master_resume, tailored_resumes, ingest_runs
scripts/                      migrate + ingest CLIs
src/lib/sources/              one parser per source (pure functions, unit tested) + fetchers
src/lib/ingest.ts             runs sources with limited concurrency, filters, upserts
src/lib/scoring.ts            ranking + explanations
src/lib/tailor.ts             Claude call
src/lib/autotailor.ts         picks top matches after each refresh and tailors them
src/lib/repo.ts               all SQL
src/app/                      feed, job detail, preferences, resume, tailored resume pages + server actions
tests/                        parsers, scoring, and a DB round-trip test (runs when DATABASE_URL is set)
```

`npm test` runs the suite; `npm run typecheck` runs tsc. DB tests delete rows, so they only run when `TEST_DATABASE_URL` points at a separate throwaway database; otherwise they're skipped. The auto-tailor test runs against a local mock of the Anthropic API, so it costs nothing.
