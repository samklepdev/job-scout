import { test } from "node:test";
import assert from "node:assert/strict";
import { rankJobs, scoreJob, termRegex } from "../src/lib/scoring";
import { DEFAULT_PREFERENCES, type JobInput, type Preferences } from "../src/lib/types";

const now = new Date("2026-10-26T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const base: JobInput = {
  source: "test",
  externalId: "1",
  company: "Acme",
  title: "Senior Full Stack Engineer",
  location: "Remote - US",
  remote: true,
  url: "https://example.com",
  description: "We build with TypeScript, React, Node.js and PostgreSQL. Some C# services on .NET.",
  tags: [],
  salaryMin: 170000,
  salaryMax: 210000,
  postedAt: daysAgo(1),
};
const prefs: Preferences = { ...DEFAULT_PREFERENCES, minSalary: 150000 };

test("termRegex matches symbols and word boundaries", () => {
  assert.ok(termRegex("C#").test("experience with c# and sql"));
  assert.ok(termRegex(".NET").test("asp .net core"));
  assert.ok(termRegex("Node.js").test("node.js services"));
  assert.ok(!termRegex("React").test("reactive streams"));
  assert.ok(!termRegex("intern").test("international team"));
  assert.ok(termRegex("sr").test("sr. engineer"));
});

test("a strong match scores high with a readable breakdown", () => {
  const s = scoreJob(base, prefs, now);
  assert.equal(s.excluded, null);
  assert.ok(s.score >= 85, `score was ${s.score}`);
  assert.ok(s.matchedSkills.includes("TypeScript"));
  assert.ok(s.matchedSkills.includes("C#"));
  assert.ok(s.missingSkills.includes("GraphQL"));
});

test("hard filters exclude with a reason", () => {
  assert.match(scoreJob({ ...base, title: "Engineering Manager" }, prefs, now).excluded!, /manager/);
  assert.match(scoreJob({ ...base, salaryMin: 90000, salaryMax: 120000 }, prefs, now).excluded!, /below/);
  assert.match(scoreJob({ ...base, postedAt: daysAgo(40) }, prefs, now).excluded!, /Older/);
  assert.match(
    scoreJob({ ...base, description: base.description + " Requires active security clearance." }, prefs, now).excluded!,
    /clearance/,
  );
  const remoteOnly = { ...prefs, remote: "remote_only" as const };
  assert.equal(scoreJob({ ...base, remote: false, location: "Houston, TX" }, remoteOnly, now).excluded, "Not remote");
});

test("remote_or_local keeps on-site jobs in your locations", () => {
  const local = { ...prefs, locations: ["Houston"] };
  const job = { ...base, remote: false, location: "Houston, TX" };
  assert.equal(scoreJob(job, local, now).excluded, null);
  assert.match(scoreJob({ ...job, location: "Seattle, WA" }, local, now).excluded!, /locations/);
});

test("weights change the ranking", () => {
  const skillsHeavy = { ...base, externalId: "a", title: "Software Engineer", salaryMin: null, salaryMax: null };
  const salaryHeavy = { ...base, externalId: "b", description: "Python and Go.", salaryMin: 250000, salaryMax: 300000 };
  const jobs = [skillsHeavy, salaryHeavy].map((j, i) => ({
    ...j,
    id: i,
    firstSeenAt: now,
    status: "new" as const,
    statusAt: null,
  }));

  const bySkills = rankJobs(jobs, { ...prefs, weights: { title: 0, skills: 10, location: 0, salary: 0, recency: 0 } }, now);
  assert.equal(bySkills[0].job.externalId, "a");
  const bySalary = rankJobs(jobs, { ...prefs, weights: { title: 0, skills: 0, location: 0, salary: 10, recency: 0 } }, now);
  assert.equal(bySalary[0].job.externalId, "b");
});
