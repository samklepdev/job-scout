import { z } from "zod";

/** A job as produced by a source adapter, before it is stored. */
export interface JobInput {
  source: string;
  externalId: string;
  company: string;
  title: string;
  location: string | null;
  remote: boolean;
  url: string;
  description: string; // plain text
  tags: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: Date | null;
}

export type JobStatus = "new" | "saved" | "applied" | "hidden";

/** A stored job. */
export interface Job extends JobInput {
  id: number;
  firstSeenAt: Date;
  status: JobStatus;
  statusAt: Date | null;
}

const list = z.array(z.string().trim().min(1)).default([]);

export const skillSchema = z.object({
  /** Display name, may include aliases separated by "|", e.g. "Node|Node.js|nodejs". */
  name: z.string().trim().min(1),
  weight: z.number().int().min(1).max(5),
});
export type Skill = z.infer<typeof skillSchema>;

export const preferencesSchema = z.object({
  titleInclude: list,
  titleExclude: list,
  seniority: list,
  skills: z.array(skillSchema).default([]),
  excludeKeywords: list,
  excludeCompanies: list,
  remote: z.enum(["remote_only", "remote_or_local", "any"]).default("remote_or_local"),
  locations: list,
  minSalary: z.number().int().min(0).nullable().default(null),
  maxAgeDays: z.number().int().min(1).max(120).default(21),
  minScore: z.number().int().min(0).max(100).default(35),
  weights: z
    .object({
      title: z.number().min(0).max(10),
      skills: z.number().min(0).max(10),
      location: z.number().min(0).max(10),
      salary: z.number().min(0).max(10),
      recency: z.number().min(0).max(10),
    })
    .default({ title: 6, skills: 8, location: 4, salary: 3, recency: 4 }),
  boards: z
    .object({ greenhouse: list, lever: list, ashby: list })
    .default({ greenhouse: [], lever: [], ashby: [] }),
  sources: z
    .object({ remotive: z.boolean(), remoteok: z.boolean(), hn: z.boolean() })
    .default({ remotive: true, remoteok: true, hn: true }),
  autoTailor: z
    .object({
      enabled: z.boolean(),
      minScore: z.number().int().min(0).max(100),
      maxPerRun: z.number().int().min(1).max(50),
    })
    .default({ enabled: true, minScore: 70, maxPerRun: 10 }),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  titleInclude: [
    "software engineer",
    "software developer",
    "full stack",
    "fullstack",
    "frontend",
    "front end",
    "backend",
    "back end",
    "web engineer",
    "product engineer",
  ],
  titleExclude: ["intern", "sales engineer", "manager", "director", "recruiter", "qa", "test engineer"],
  seniority: ["senior", "sr", "staff", "lead"],
  skills: [
    { name: "TypeScript|TS", weight: 5 },
    { name: "React|React.js", weight: 5 },
    { name: "Node|Node.js|NodeJS", weight: 4 },
    { name: "Next.js|NextJS", weight: 4 },
    { name: "C#|.NET|ASP.NET|dotnet", weight: 4 },
    { name: "PostgreSQL|Postgres", weight: 3 },
    { name: "JavaScript", weight: 2 },
    { name: "AWS|Azure|GCP", weight: 2 },
    { name: "GraphQL", weight: 1 },
  ],
  excludeKeywords: ["security clearance", "ts/sci"],
  excludeCompanies: [],
  remote: "remote_or_local",
  locations: [],
  minSalary: null,
  maxAgeDays: 21,
  minScore: 35,
  weights: { title: 6, skills: 8, location: 4, salary: 3, recency: 4 },
  boards: {
    // Board slugs from boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, jobs.ashbyhq.com/<slug>.
    greenhouse: ["vercel", "stripe", "airbnb", "discord", "figma", "cloudflare", "gitlab", "datadog", "coinbase"],
    lever: ["palantir", "spotify", "plaid"],
    ashby: ["linear", "ramp", "supabase", "notion", "openai"],
  },
  sources: { remotive: true, remoteok: true, hn: true },
  autoTailor: { enabled: true, minScore: 70, maxPerRun: 10 },
};
