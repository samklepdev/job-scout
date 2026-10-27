import "./env";
import { getPool } from "../src/lib/db";
import { runAutoTailor } from "../src/lib/autotailor";
import { runIngest } from "../src/lib/ingest";

const { runId, results } = await runIngest();
for (const r of results) {
  console.log(
    r.error
      ? `✗ ${r.source.padEnd(24)} ${r.error}`
      : `✓ ${r.source.padEnd(24)} fetched ${r.fetched}, kept ${r.kept}, new ${r.inserted}`,
  );
}

if (!process.argv.includes("--no-tailor")) {
  console.log("\nAuto-tailoring resumes for top matches…");
  const t = await runAutoTailor(runId);
  if (t.skipped) console.log(`Skipped: ${t.skipped}`);
  else console.log(`Tailored ${t.created} of ${t.candidates} matches.`);
  for (const e of t.errors) console.log(`✗ ${e}`);
}
await getPool().end();
