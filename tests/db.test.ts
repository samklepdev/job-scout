import { skipDb } from "./test-db";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db";
import {
  createTailoredResume,
  getPreferences,
  getTailoredResume,
  listRecentJobs,
  savePreferences,
  setJobStatus,
  upsertJobs,
} from "../src/lib/repo";
import { DEFAULT_PREFERENCES, type JobInput } from "../src/lib/types";

const skip = skipDb;
after(async () => {
  if (!skip) await getPool().end();
});

const job = (over: Partial<JobInput>): JobInput => ({
  source: "test",
  externalId: "t1",
  company: "Dupe Co",
  title: "Senior Software Engineer",
  location: "Remote",
  remote: true,
  url: "https://example.com/1",
  description: "TypeScript",
  tags: [],
  salaryMin: null,
  salaryMax: null,
  postedAt: new Date(),
  ...over,
});

test("upsert, cross-source dedupe, status and tailored resumes round-trip", { skip }, async () => {
  await getPool().query("DELETE FROM jobs WHERE company = 'Dupe Co'");

  const first = await upsertJobs([job({}), job({ source: "test2", externalId: "x9", title: "Senior Software Engineer (Remote)" })]);
  assert.deepEqual(first, { inserted: 2, updated: 0 });
  const again = await upsertJobs([job({ description: "TypeScript and React" })]);
  assert.deepEqual(again, { inserted: 0, updated: 1 });

  let mine = (await listRecentJobs(30)).filter((j) => j.company === "Dupe Co");
  assert.equal(mine.length, 1, "same company+title from two sources collapses to one");

  await setJobStatus(mine[0].id, "saved");
  await upsertJobs([job({ description: "re-fetched" })]); // re-ingest must not reset status
  mine = (await listRecentJobs(30)).filter((j) => j.company === "Dupe Co");
  assert.equal(mine[0].status, "saved");

  const tid = await createTailoredResume({
    jobId: mine[0].id,
    markdown: "# Name",
    changes: ["a"],
    gaps: ["b"],
    guidance: null,
    model: "test",
  });
  const t = await getTailoredResume(tid);
  assert.deepEqual(t?.changes, ["a"]);

  await getPool().query("DELETE FROM jobs WHERE company = 'Dupe Co'");
});

test("preferences round-trip", { skip }, async () => {
  await savePreferences({ ...DEFAULT_PREFERENCES, minSalary: 155000, locations: ["Houston"] });
  const p = await getPreferences();
  assert.equal(p.minSalary, 155000);
  assert.deepEqual(p.locations, ["Houston"]);
  await getPool().query("DELETE FROM preferences");
});
