import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { updateTailoredAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { PrintButton } from "@/components/PrintButton";
import { StatusButtons } from "@/components/StatusButtons";
import { getJob, getTailoredResume } from "@/lib/repo";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function TailoredPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tailored = await getTailoredResume(Number(id));
  if (!tailored) notFound();
  const job = await getJob(tailored.jobId);
  if (!job) notFound();

  return (
    <div className={styles.layout}>
      <div className={styles.top}>
        <Link href={`/jobs/${job.id}`} className={styles.back}>
          ← {job.title} · {job.company}
        </Link>
        <div className={styles.actions}>
          <PrintButton />
          <a href={`/tailored/${tailored.id}/download`} className={styles.secondary}>
            Download .md
          </a>
          <a href={job.url} target="_blank" rel="noreferrer" className={styles.secondary}>
            Apply ↗
          </a>
        </div>
      </div>

      <div className={styles.columns}>
        <article className={styles.paper}>
          <ReactMarkdown>{tailored.markdown}</ReactMarkdown>
        </article>

        <aside className={styles.side}>
          <section className={styles.panel}>
            <h2>Review before sending</h2>
            {tailored.changes.length > 0 && (
              <>
                <h3>What changed</h3>
                <ul>
                  {tailored.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            {tailored.gaps.length > 0 && (
              <>
                <h3 className={styles.gapTitle}>Gaps vs. the posting</h3>
                <ul>
                  {tailored.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                <p className={styles.hint}>
                  Left out on purpose. If you do have this experience, add it to your master resume and re-tailor.
                </p>
              </>
            )}
            <p className={styles.hint}>
              {tailored.model} · {tailored.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </section>

          <section className={styles.panel}>
            <h2>Applied?</h2>
            <StatusButtons id={job.id} status={job.status} />
          </section>

          <details className={styles.panel}>
            <summary>Edit this version</summary>
            <ActionForm action={updateTailoredAction} submitLabel="Save edits" pendingLabel="Saving…">
              <input type="hidden" name="id" value={tailored.id} />
              <textarea name="markdown" rows={24} className={styles.editor} defaultValue={tailored.markdown} />
            </ActionForm>
          </details>
        </aside>
      </div>
    </div>
  );
}
