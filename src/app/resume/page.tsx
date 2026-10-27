import { saveResumeAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { getMasterResume } from "@/lib/repo";
import styles from "../forms.module.css";

export const dynamic = "force-dynamic";

const TEMPLATE = `# Your Name
City, ST · you@example.com · github.com/you · yoursite.dev

## Summary
Senior full-stack engineer with N years building ...

## Experience

### Senior Software Engineer — Company
*Jan 2023 – Present*
- Built ... using TypeScript, React and Node, which ...
- Led ...

### Software Engineer — Company
*2019 – 2022*
- ...

## Skills
TypeScript, React, Next.js, Node.js, C#/.NET, PostgreSQL, ...

## Education
B.S. Computer Science — University
`;

export default async function ResumePage() {
  const resume = await getMasterResume();
  return (
    <div>
      <h1 className={styles.pageTitle}>Master resume</h1>
      <p className={styles.lead}>
        The full, honest version of your history in Markdown — include everything, even what you&apos;d normally cut.
        Each tailored resume is built only from what&apos;s here: it gets reordered and reworded for the job, never
        embellished.
        {resume && <> Last saved {resume.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}.</>}
      </p>
      <ActionForm action={saveResumeAction} submitLabel="Save resume" pendingLabel="Saving…">
        <textarea
          name="markdown"
          rows={32}
          className={styles.mono}
          defaultValue={resume?.markdown ?? TEMPLATE}
          aria-label="Master resume (Markdown)"
        />
      </ActionForm>
    </div>
  );
}
