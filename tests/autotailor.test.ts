import { skipDb } from "./test-db";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pickAutoTailorCandidates, runAutoTailor } from "../src/lib/autotailor";
import { getPool } from "../src/lib/db";
import { listTailoredForJob, saveMasterResume, savePreferences, upsertJobs } from "../src/lib/repo";
import { rankJobs } from "../src/lib/scoring";
import { DEFAULT_PREFERENCES, type Job, type JobInput } from "../src/lib/types";

const now = new Date();
const job = (id: number, over: Partial<Job> = {}): Job => ({
  id,
  source: "t",
  externalId: String(id),
  company: `Co${id}`,
  title: "Senior Full Stack Engineer",
  location: "Remote",
  remote: true,
  url: "https://x",
  description: "TypeScript React Node.js Next.js C# .NET PostgreSQL",
  tags: [],
  salaryMin: null,
  salaryMax: null,
  postedAt: now,
  firstSeenAt: now,
  status: "new",
  statusAt: null,
  ...over,
});

test("candidates: above threshold, active, not excluded, not done, capped", () => {
  const prefs = { ...DEFAULT_PREFERENCES, autoTailor: { enabled: true, minScore: 70, maxPerRun: 2 } };
  const jobs = [
    job(1),
    job(2, { status: "applied" }),
    job(3, { title: "Engineering Manager" }), // excluded by title filter
    job(4, { description: "Python only", title: "Data Analyst" }), // low score
    job(5),
    job(6),
  ];
  const picked = pickAutoTailorCandidates(rankJobs(jobs, prefs, now), prefs, new Set([5]));
  assert.deepEqual(picked.map((j) => j.id).sort(), [1, 6]);
});

// ---- End to end against Postgres with a mock Anthropic Messages endpoint ----

const skip = skipDb;
let server: Server;
let calls = 0;

before(async () => {
  if (skip) return;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls++;
      const parsed = JSON.parse(body);
      assert.equal(parsed.tool_choice.name, "submit_tailored_resume");
      const company = /Company: (.*)/.exec(parsed.messages[0].content)?.[1];
      if (company === "AutoFail Co") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: parsed.model,
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "submit_tailored_resume",
              input: {
                resume_markdown: `# Sam\n\nTailored for ${company}. ${"Lorem ipsum dolor sit amet. ".repeat(3)}`,
                changes: ["Reordered"],
                gaps: [],
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
});

after(async () => {
  if (skip) return;
  server.close();
  await getPool().query("DELETE FROM jobs WHERE company LIKE 'Auto%'");
  await getPool().query("DELETE FROM preferences");
  await getPool().query("DELETE FROM master_resume");
  await getPool().end();
});

test("runAutoTailor tailors top matches once, records failures, never retries", { skip }, async () => {
  const pool = getPool();
  await pool.query("DELETE FROM jobs");
  await saveMasterResume("# Sam\n\n## Experience\n- TypeScript, React, Node.js, C#/.NET, PostgreSQL work");
  await savePreferences({ ...DEFAULT_PREFERENCES, autoTailor: { enabled: true, minScore: 60, maxPerRun: 10 } });

  const input = (company: string, over: Partial<JobInput> = {}): JobInput => {
    const { id: _id, firstSeenAt: _f, status: _s, statusAt: _sa, ...rest } = job(0, { company, externalId: company });
    return { ...rest, ...over };
  };
  await upsertJobs([
    input("AutoGood One"),
    input("AutoGood Two"),
    input("AutoFail Co"),
    input("AutoLow", { title: "Data Analyst", description: "Excel" }),
  ]);

  calls = 0;
  const first = await runAutoTailor();
  assert.equal(first.candidates, 3);
  assert.equal(first.created, 2);
  assert.equal(first.errors.length, 1);
  assert.match(first.errors[0], /AutoFail Co/);

  const { rows } = await pool.query<{ id: string; company: string }>("SELECT id, company FROM jobs WHERE company LIKE 'Auto%'");
  const byCompany = Object.fromEntries(rows.map((r) => [r.company, Number(r.id)]));
  const good = await listTailoredForJob(byCompany["AutoGood One"]);
  assert.equal(good.length, 1);
  assert.match(good[0].markdown, /Tailored for AutoGood One/);
  assert.equal((await listTailoredForJob(byCompany["AutoLow"])).length, 0);

  const callsAfterFirst = calls;
  const second = await runAutoTailor();
  assert.equal(second.candidates, 0, "already-tailored and already-failed jobs are not retried");
  assert.equal(calls, callsAfterFirst);

  await savePreferences({ ...DEFAULT_PREFERENCES, autoTailor: { enabled: false, minScore: 60, maxPerRun: 10 } });
  assert.equal((await runAutoTailor()).skipped, "Auto-tailor is off");
});
