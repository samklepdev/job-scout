import Link from "next/link";
import { notFound } from "next/navigation";
import { tailorAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusButtons } from "@/components/StatusButtons";
import { formatSalary, SOURCE_LABELS, timeAgo } from "@/components/format";
import { getJob, getMasterResume, getPreferences, listTailoredForJob } from "@/lib/repo";
import { scoreJob } from "@/lib/scoring";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(Number(id));
  if (!job) notFound();

  const [prefs, tailored, master] = await Promise.all([getPreferences(), listTailoredForJob(job.id), getMasterResume()]);
  const score = scoreJob(job, prefs);
  const salary = formatSalary(job.salaryMin, job.salaryMax);

  return (
    <div className={styles.layout}>
      <article className={styles.main}>
        <Link href="/" className={styles.back}>
          ← Feed
        </Link>
        <h1 className={styles.title}>{job.title}</h1>
        <div className={styles.meta}>
          <strong>{job.company}</strong>
          {job.remote && <span className={styles.remote}>Remote</span>}
          {job.location && <span>{job.location}</span>}
          {salary && <span>{salary}</span>}
          <span>Posted {timeAgo(job.postedAt ?? job.firstSeenAt)}</span>
          <span>via {SOURCE_LABELS[job.source] ?? job.source}</span>
        </div>
        <div className={styles.toolbar}>
          <a href={job.url} target="_blank" rel="noreferrer" className={styles.apply}>
            Open posting ↗
          </a>
          <StatusButtons id={job.id} status={job.status} />
        </div>
        <div className={styles.description}>{job.description || "No description provided by the source."}</div>
      </article>

      <aside className={styles.side}>
        <section className={styles.panel}>
          <div className={styles.scoreHead}>
            <ScoreBadge score={score.score} size="lg" />
            <div>
              <h2 className={styles.panelTitle}>Match</h2>
              {score.excluded && <p className={styles.excluded}>Filtered: {score.excluded}</p>}
            </div>
          </div>
          <dl className={styles.breakdown}>
            {score.components.map((c) => (
              <div key={c.key} className={styles.row}>
                <dt>
                  {c.label} <span className={styles.weight}>×{prefs.weights[c.key]}</span>
                </dt>
                <dd>
                  <div className={styles.bar}>
                    <div style={{ width: `${Math.round(c.value * 100)}%` }} />
                  </div>
                  <span className={styles.detail}>{c.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
          {score.missingSkills.length > 0 && (
            <p className={styles.missing}>Not mentioned: {score.missingSkills.join(", ")}</p>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Tailored resume</h2>
          {master ? (
            <ActionForm action={tailorAction} submitLabel="Tailor my resume" pendingLabel="Tailoring… (~30s)">
              <input type="hidden" name="jobId" value={job.id} />
              <label className={styles.label} htmlFor="guidance">
                Anything to emphasize? <span>(optional)</span>
              </label>
              <textarea
                id="guidance"
                name="guidance"
                rows={3}
                placeholder="e.g. lead with the payments work, mention I mentor juniors"
              />
            </ActionForm>
          ) : (
            <p className={styles.note}>
              <Link href="/resume">Add your master resume</Link> first — every tailored version is built from it.
            </p>
          )}
          {tailored.length > 0 && (
            <ul className={styles.versions}>
              {tailored.map((t, i) => (
                <li key={t.id}>
                  <Link href={`/tailored/${t.id}`}>
                    Version {tailored.length - i}
                  </Link>
                  <span>{t.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
