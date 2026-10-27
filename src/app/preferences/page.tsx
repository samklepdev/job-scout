import { savePreferencesAction } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { RangeField } from "@/components/RangeField";
import { getPreferences } from "@/lib/repo";
import type { Preferences } from "@/lib/types";
import styles from "../forms.module.css";

export const dynamic = "force-dynamic";

const WEIGHTS: { key: keyof Preferences["weights"]; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "skills", label: "Skills" },
  { key: "location", label: "Location" },
  { key: "salary", label: "Salary" },
  { key: "recency", label: "Recency" },
];

function ListField({
  name,
  label,
  value,
  hint,
  rows = 3,
}: {
  name: string;
  label: string;
  value: string[];
  hint?: string;
  rows?: number;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea name={name} rows={rows} defaultValue={value.join(", ")} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export default async function PreferencesPage() {
  const p = await getPreferences();

  return (
    <div>
      <h1 className={styles.pageTitle}>Preferences</h1>
      <p className={styles.lead}>
        Every job gets a 0–100 score from the five factors below, weighted by the sliders. Hard filters remove a job
        regardless of score (you can still see those under “Filtered out”). Changes re-rank your feed instantly.
      </p>

      <ActionForm action={savePreferencesAction} submitLabel="Save preferences" pendingLabel="Saving…">
        <section className={styles.section}>
          <h2>What matters most</h2>
          <p>Relative weight of each factor in the score. Set one to 0 to ignore it.</p>
          <div className={styles.sliders}>
            {WEIGHTS.map((w) => (
              <div key={w.key} className={styles.slider}>
                <RangeField name={`w_${w.key}`} label={w.label} defaultValue={p.weights[w.key]} />
              </div>
            ))}
          </div>
          <div className={styles.grid} style={{ marginTop: 18 }}>
            <label className={styles.field}>
              <span>Minimum score for “For you”</span>
              <input type="number" name="minScore" min={0} max={100} defaultValue={p.minScore} />
            </label>
            <label className={styles.field}>
              <span>Only show jobs posted in the last (days)</span>
              <input type="number" name="maxAgeDays" min={1} max={120} defaultValue={p.maxAgeDays} />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Auto-tailor resumes</h2>
          <p>
            After every refresh, Claude writes a tailored resume for each new job at or above this score, so it&apos;s
            ready when you open the feed. Each job is tailored once; you can always re-tailor from the job page. Each
            resume is one Anthropic API call, so the per-refresh cap keeps costs predictable.
          </p>
          <div className={styles.checks} style={{ marginBottom: 14 }}>
            <label>
              <input type="checkbox" name="at_enabled" defaultChecked={p.autoTailor.enabled} /> Auto-tailor top matches
            </label>
          </div>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Tailor jobs scoring at least</span>
              <input type="number" name="at_minScore" min={0} max={100} defaultValue={p.autoTailor.minScore} />
            </label>
            <label className={styles.field}>
              <span>Max resumes per refresh</span>
              <input type="number" name="at_maxPerRun" min={1} max={50} defaultValue={p.autoTailor.maxPerRun} />
              <small>Highest scores go first; the rest are picked up on the next refresh.</small>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Roles</h2>
          <p>Comma or newline separated. Matching is case-insensitive and whole-word.</p>
          <div className={styles.grid3}>
            <ListField name="titleInclude" label="Titles you want" value={p.titleInclude} rows={5} />
            <ListField name="seniority" label="Seniority boost" value={p.seniority} rows={5} />
            <ListField
              name="titleExclude"
              label="Exclude titles containing"
              value={p.titleExclude}
              rows={5}
              hint="Hard filter"
            />
          </div>
        </section>

        <section className={styles.section}>
          <h2>Skills</h2>
          <p>
            One per line as <code>name: weight</code> (1–5). Add aliases with <code>|</code>, e.g.{" "}
            <code>C#|.NET|dotnet: 4</code>. Matched against the title and full description.
          </p>
          <textarea
            name="skills"
            rows={Math.max(6, p.skills.length + 1)}
            className={styles.mono}
            defaultValue={p.skills.map((s) => `${s.name}: ${s.weight}`).join("\n")}
          />
        </section>

        <section className={styles.section}>
          <h2>Location & pay</h2>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Remote</span>
              <select name="remote" defaultValue={p.remote}>
                <option value="remote_only">Remote only</option>
                <option value="remote_or_local">Remote, or on-site/hybrid in my locations</option>
                <option value="any">Anything (remote preferred)</option>
              </select>
            </label>
            <ListField
              name="locations"
              label="Your locations"
              value={p.locations}
              rows={2}
              hint="Cities/states you'd work on-site or hybrid in, e.g. Houston, Austin, TX"
            />
            <label className={styles.field}>
              <span>Minimum base salary (USD)</span>
              <input
                type="text"
                inputMode="numeric"
                name="minSalary"
                placeholder="e.g. 150000"
                defaultValue={p.minSalary ?? ""}
              />
              <small>Jobs whose listed max is below this are filtered. Unlisted pay is never filtered.</small>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <h2>Dealbreakers</h2>
          <div className={styles.grid}>
            <ListField
              name="excludeKeywords"
              label="Exclude if description mentions"
              value={p.excludeKeywords}
              hint="e.g. security clearance, relocation required"
            />
            <ListField name="excludeCompanies" label="Exclude companies" value={p.excludeCompanies} />
          </div>
        </section>

        <section className={styles.section}>
          <h2>Sources</h2>
          <p>
            Company boards use each company&apos;s public job API. The slug is the last part of their careers URL —
            boards.greenhouse.io/<b>stripe</b>, jobs.lever.co/<b>plaid</b>, jobs.ashbyhq.com/<b>linear</b>.
          </p>
          <div className={styles.grid3}>
            <ListField name="greenhouse" label="Greenhouse boards" value={p.boards.greenhouse} rows={5} />
            <ListField name="lever" label="Lever boards" value={p.boards.lever} rows={5} />
            <ListField name="ashby" label="Ashby boards" value={p.boards.ashby} rows={5} />
          </div>
          <div className={styles.checks} style={{ marginTop: 16 }}>
            <label>
              <input type="checkbox" name="src_remotive" defaultChecked={p.sources.remotive} /> Remotive
            </label>
            <label>
              <input type="checkbox" name="src_remoteok" defaultChecked={p.sources.remoteok} /> RemoteOK
            </label>
            <label>
              <input type="checkbox" name="src_hn" defaultChecked={p.sources.hn} /> Hacker News “Who is hiring?”
            </label>
          </div>
        </section>
      </ActionForm>
    </div>
  );
}
