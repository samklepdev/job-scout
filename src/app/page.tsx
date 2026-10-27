import Link from "next/link";
import { autoTailorNowAction, refreshJobsAction } from "./actions";
import { ActionForm } from "@/components/ActionForm";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusButtons } from "@/components/StatusButtons";
import { formatSalary, SOURCE_LABELS, timeAgo } from "@/components/format";
import { getLastIngestRun, getPreferences, latestTailoredByJob, listRecentJobs } from "@/lib/repo";
import { rankJobs, type ScoredJob } from "@/lib/scoring";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "foryou", label: "For you" },
  { key: "ready", label: "Resume ready" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "below", label: "Low match" },
  { key: "filtered", label: "Filtered out" },
  { key: "hidden", label: "Hidden" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 50;

function inTab(item: ScoredJob, tab: TabKey, minScore: number, tailored: Map<number, number>): boolean {
  const { job, score } = item;
  switch (tab) {
    case "ready":
      return (job.status === "new" || job.status === "saved") && tailored.has(job.id);
    case "saved":
      return job.status === "saved";
    case "applied":
      return job.status === "applied";
    case "hidden":
      return job.status === "hidden";
    case "filtered":
      return job.status === "new" && !!score.excluded;
    case "below":
      return job.status === "new" && !score.excluded && score.score < minScore;
    case "foryou":
      return (job.status === "new" || job.status === "saved") && !score.excluded && score.score >= minScore;
  }
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === params.tab) ? (params.tab as TabKey) : "foryou";
  const q = params.q?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const [prefs, jobs, lastRun, tailored] = await Promise.all([
    getPreferences(),
    listRecentJobs(120),
    getLastIngestRun(),
    latestTailoredByJob(),
  ]);
  const ranked = rankJobs(jobs, prefs);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, ranked.filter((r) => inTab(r, t.key, prefs.minScore, tailored)).length]));

  const visible = ranked
    .filter((r) => inTab(r, tab, prefs.minScore, tailored))
    .filter((r) => !q || `${r.job.title} ${r.job.company} ${r.job.location ?? ""}`.toLowerCase().includes(q));
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.ceil(visible.length / PAGE_SIZE);

  const href = (next: Partial<{ tab: string; q: string; page: number }>) => {
    const sp = new URLSearchParams();
    const t = next.tab ?? tab;
    const query = next.q ?? params.q ?? "";
    if (t !== "foryou") sp.set("tab", t);
    if (query) sp.set("q", query);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const s = sp.toString();
    return s ? `/?${s}` : "/";
  };

  const failed = lastRun?.results.filter((r) => r.error) ?? [];

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Your feed</h1>
          <p className={styles.sub}>
            {jobs.length === 0
              ? "No jobs yet. Pull the latest postings to get started."
              : `${counts.foryou} matches at or above ${prefs.minScore} · ${jobs.length} jobs tracked`}
            {lastRun?.finishedAt && <> · refreshed {timeAgo(lastRun.finishedAt)}</>}
            {lastRun?.finishedAt && prefs.autoTailor.enabled && (
              <>
                {" · "}
                {!lastRun.autoTailor
                  ? "tailoring resumes…"
                  : lastRun.autoTailor.skipped
                    ? `auto-tailor skipped: ${lastRun.autoTailor.skipped}`
                    : `${lastRun.autoTailor.created} resume${lastRun.autoTailor.created === 1 ? "" : "s"} auto-tailored${
                        lastRun.autoTailor.errors.length ? ` (${lastRun.autoTailor.errors.length} failed)` : ""
                      }`}
              </>
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          {prefs.autoTailor.enabled && jobs.length > 0 && (
            <ActionForm
              action={autoTailorNowAction}
              submitLabel="Tailor matches now"
              pendingLabel="Starting…"
              variant="secondary"
              className={styles.refresh}
              inline
            />
          )}
          <ActionForm
            action={refreshJobsAction}
            submitLabel="Refresh jobs"
            pendingLabel="Fetching…"
            variant="secondary"
            className={styles.refresh}
            inline
          />
        </div>
      </div>

      {failed.length > 0 && (
        <details className={styles.failures}>
          <summary>
            {failed.length} source{failed.length === 1 ? "" : "s"} failed on the last refresh
          </summary>
          <ul>
            {failed.map((f) => (
              <li key={f.source}>
                <code>{f.source}</code> — {f.error}
              </li>
            ))}
          </ul>
          <p>Board slugs can be fixed in Preferences.</p>
        </details>
      )}

      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Job lists">
          {TABS.map((t) => (
            <Link key={t.key} href={href({ tab: t.key, page: 1 })} className={t.key === tab ? styles.activeTab : styles.tab}>
              {t.label} <span className={styles.count}>{counts[t.key]}</span>
            </Link>
          ))}
        </nav>
        <form className={styles.search} action="/">
          {tab !== "foryou" && <input type="hidden" name="tab" value={tab} />}
          <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Filter by title, company, location" />
        </form>
      </div>

      {pageItems.length === 0 ? (
        <div className={styles.empty}>
          {tab === "ready" ? (
            prefs.autoTailor.enabled ? (
              <>
                No tailored resumes yet. Jobs scoring {prefs.autoTailor.minScore}+ get one automatically after each
                refresh (needs your <Link href="/resume">master resume</Link>).
              </>
            ) : (
              <>
                Auto-tailor is off. Turn it on in <Link href="/preferences">Preferences</Link>, or tailor from any job page.
              </>
            )
          ) : tab === "foryou" && jobs.length > 0 ? (
            <>
              Nothing clears your bar right now. Check <Link href={href({ tab: "below" })}>Low match</Link> or{" "}
              <Link href="/preferences">loosen your preferences</Link>.
            </>
          ) : (
            "Nothing here."
          )}
        </div>
      ) : (
        <ol className={styles.list}>
          {pageItems.map(({ job, score }) => {
            const salary = formatSalary(job.salaryMin, job.salaryMax);
            const tailoredId = tailored.get(job.id);
            return (
              <li key={job.id} className={styles.card}>
                <ScoreBadge score={score.score} />
                <div className={styles.body}>
                  <Link href={`/jobs/${job.id}`} className={styles.jobTitle}>
                    {job.title}
                  </Link>
                  <div className={styles.meta}>
                    <strong>{job.company}</strong>
                    {job.remote && <span className={styles.remote}>Remote</span>}
                    {job.location && <span>{job.location}</span>}
                    {salary && <span>{salary}</span>}
                    <span>{timeAgo(job.postedAt ?? job.firstSeenAt)}</span>
                    <span className={styles.source}>{SOURCE_LABELS[job.source] ?? job.source}</span>
                  </div>
                  {score.excluded ? (
                    <p className={styles.excluded}>{score.excluded}</p>
                  ) : (
                    score.matchedSkills.length > 0 && (
                      <div className={styles.chips}>
                        {score.matchedSkills.map((s) => (
                          <span key={s} className={styles.chip}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )
                  )}
                </div>
                <div className={styles.actions}>
                  <StatusButtons id={job.id} status={job.status} />
                  {tailoredId && (
                    <Link href={`/tailored/${tailoredId}`} className={styles.ready}>
                      Tailored resume →
                    </Link>
                  )}
                  <a href={job.url} target="_blank" rel="noreferrer" className={styles.open}>
                    Posting ↗
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label="Pages">
          {page > 1 && <Link href={href({ page: page - 1 })}>← Previous</Link>}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={href({ page: page + 1 })}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
