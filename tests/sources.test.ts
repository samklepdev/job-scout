import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAshby, parseGreenhouse, parseLever } from "../src/lib/sources/ats";
import { parseHnThread, parseRemoteOk, parseRemotive } from "../src/lib/sources/aggregators";
import { htmlToText, isEngineeringRole, parseSalary } from "../src/lib/text";

test("htmlToText decodes Greenhouse's entity-escaped HTML", () => {
  const raw = "&lt;p&gt;We use &lt;strong&gt;TypeScript&lt;/strong&gt; &amp;amp; C#.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;li&gt;Node.js&lt;/li&gt;&lt;/ul&gt;";
  assert.equal(htmlToText(raw), "We use TypeScript & C#.\n\n• React\n• Node.js");
});

test("parseSalary handles common formats and ignores hourly", () => {
  assert.deepEqual(parseSalary("Pay: $150,000 - $190,000 per year"), { min: 150000, max: 190000 });
  assert.deepEqual(parseSalary("$140k–$175k + equity"), { min: 140000, max: 175000 });
  assert.deepEqual(parseSalary("$160K to 200K"), { min: 160000, max: 200000 });
  assert.deepEqual(parseSalary("$55 - $70 / hour"), { min: null, max: null });
  assert.deepEqual(parseSalary("competitive"), { min: null, max: null });
});

test("isEngineeringRole keeps engineering titles only", () => {
  assert.ok(isEngineeringRole("Senior Full-Stack Engineer"));
  assert.ok(isEngineeringRole("Frontend Developer"));
  assert.ok(!isEngineeringRole("Account Executive"));
  assert.ok(!isEngineeringRole("Product Designer"));
});

test("Greenhouse parser", () => {
  const jobs = parseGreenhouse(
    {
      jobs: [
        {
          id: 42,
          title: "Senior Software Engineer, Payments",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/42",
          first_published: "2026-10-20T12:00:00Z",
          company_name: "Acme",
          location: { name: "Remote - US" },
          content: "&lt;p&gt;Salary: $170,000 - $210,000&lt;/p&gt;",
        },
      ],
    },
    "acme",
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].externalId, "acme:42");
  assert.equal(jobs[0].remote, true);
  assert.equal(jobs[0].salaryMin, 170000);
  assert.equal(jobs[0].company, "Acme");
});

test("Lever parser uses structured salary and workplaceType", () => {
  const [job] = parseLever(
    [
      {
        id: "abc",
        text: "Full Stack Engineer",
        hostedUrl: "https://jobs.lever.co/plaid/abc",
        createdAt: 1761000000000,
        workplaceType: "remote",
        categories: { location: "San Francisco", team: "Engineering", commitment: "Full-time" },
        descriptionPlain: "Build things with React.",
        lists: [{ text: "Requirements", content: "<li>TypeScript</li>" }],
        salaryRange: { min: 160000, max: 200000, currency: "USD", interval: "per-year-salary" },
      },
    ],
    "plaid",
  );
  assert.equal(job.company, "Plaid");
  assert.equal(job.remote, true);
  assert.equal(job.salaryMax, 200000);
  assert.match(job.description, /Requirements\n• TypeScript/);
  assert.deepEqual(job.tags, ["Engineering", "Full-time"]);
});

test("Ashby parser reads compensation and skips unlisted jobs", () => {
  const jobs = parseAshby(
    {
      jobs: [
        {
          id: "u1",
          title: "Product Engineer",
          jobUrl: "https://jobs.ashbyhq.com/linear/u1",
          isRemote: true,
          publishedAt: "2026-10-22T00:00:00Z",
          descriptionPlain: "TypeScript, React, Postgres",
          compensation: { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", minValue: 180000, maxValue: 240000 }] },
        },
        { id: "u2", title: "Hidden", jobUrl: "https://x", isListed: false },
      ],
    },
    "linear",
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].salaryMin, 180000);
  assert.equal(jobs[0].remote, true);
});

test("Remotive and RemoteOK parsers", () => {
  const remotive = parseRemotive({
    jobs: [
      {
        id: 7,
        url: "https://remotive.com/7",
        title: "React Developer",
        company_name: "Foo",
        salary: "$120k - $150k",
        publication_date: "2026-10-25T10:00:00",
        candidate_required_location: "USA",
        description: "<p>Hi</p>",
      },
    ],
  });
  assert.equal(remotive[0].salaryMin, 120000);
  assert.equal(remotive[0].remote, true);

  const remoteok = parseRemoteOk([
    { legal: "notice" },
    { id: "99", epoch: 1761400000, company: "Bar", position: "Backend Engineer", tags: ["node"], salary_min: 0, url: "https://remoteok.com/99" },
  ]);
  assert.equal(remoteok.length, 1);
  assert.equal(remoteok[0].salaryMin, null);
  assert.deepEqual(remoteok[0].tags, ["node"]);
});

test("HN parser extracts company, role, location and remote from the header line", () => {
  const jobs = parseHnThread({
    id: 1,
    children: [
      {
        id: 101,
        author: "founder",
        created_at_i: 1761400000,
        text: "Widgetly | Senior Full Stack Engineer | Austin, TX or REMOTE (US) | $160k-$200k<p>We use TypeScript and Postgres.",
      },
      { id: 102, author: null, text: null },
      { id: 103, author: "chatty", text: "Is anyone hiring juniors?" },
    ],
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "Widgetly");
  assert.equal(jobs[0].title, "Senior Full Stack Engineer");
  assert.equal(jobs[0].location, "Austin, TX or REMOTE (US)");
  assert.equal(jobs[0].remote, true);
  assert.equal(jobs[0].salaryMin, 160000);
  assert.equal(jobs[0].url, "https://news.ycombinator.com/item?id=101");
});
