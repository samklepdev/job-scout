import type { Job, JobInput, Preferences } from "./types";

export interface ScoreComponent {
  key: keyof Preferences["weights"];
  label: string;
  value: number; // 0..1
  detail: string;
}

export interface JobScore {
  score: number; // 0..100
  excluded: string | null; // reason, if a hard filter removed the job
  components: ScoreComponent[];
  matchedSkills: string[];
  missingSkills: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-term match that also works for terms like "C#", ".NET" and "Node.js". */
export function termRegex(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRe(term.toLowerCase().trim())}(?![a-z0-9])`, "i");
}

const matchesAny = (haystack: string, terms: string[]) => terms.find((t) => termRegex(t).test(haystack));

const skillLabel = (name: string) => name.split("|")[0].trim();

const ageInDays = (job: Pick<JobInput, "postedAt"> & { firstSeenAt?: Date }, now: Date) => {
  const when = job.postedAt ?? job.firstSeenAt ?? now;
  return Math.max(0, (now.getTime() - when.getTime()) / 86_400_000);
};

export function scoreJob(job: JobInput & { firstSeenAt?: Date }, prefs: Preferences, now = new Date()): JobScore {
  const title = job.title.toLowerCase();
  const location = (job.location ?? "").toLowerCase();
  const fullText = `${job.title}\n${job.tags.join(" ")}\n${job.description}`.toLowerCase();

  // ----- Hard filters -----
  let excluded: string | null = null;
  const titleBlock = matchesAny(title, prefs.titleExclude);
  const keywordBlock = matchesAny(fullText, prefs.excludeKeywords);
  const companyBlock = prefs.excludeCompanies.find((c) => c.toLowerCase() === job.company.toLowerCase());
  const locationMatch = matchesAny(location, prefs.locations);
  const age = ageInDays(job, now);

  if (titleBlock) excluded = `Title contains “${titleBlock}”`;
  else if (companyBlock) excluded = `Company ${job.company} is excluded`;
  else if (keywordBlock) excluded = `Mentions “${keywordBlock}”`;
  else if (prefs.remote === "remote_only" && !job.remote) excluded = "Not remote";
  else if (prefs.remote === "remote_or_local" && !job.remote && !locationMatch && prefs.locations.length > 0)
    excluded = "Not remote and not in your locations";
  else if (prefs.minSalary && job.salaryMax && job.salaryMax < prefs.minSalary)
    excluded = `Max salary $${Math.round(job.salaryMax / 1000)}k is below your minimum`;
  else if (age > prefs.maxAgeDays) excluded = `Older than ${prefs.maxAgeDays} days`;

  // ----- Title -----
  const titleHit = matchesAny(title, prefs.titleInclude);
  const seniorityHit = matchesAny(title, prefs.seniority);
  const titleValue = prefs.titleInclude.length === 0 ? 0.6 : (titleHit ? 0.7 : 0.1) + (seniorityHit ? 0.3 : 0);
  const titleDetail = [titleHit && `matches “${titleHit}”`, seniorityHit && `level “${seniorityHit}”`]
    .filter(Boolean)
    .join(", ");

  // ----- Skills -----
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const skill of prefs.skills) {
    totalWeight += skill.weight;
    const aliases = skill.name.split("|").map((a) => a.trim()).filter(Boolean);
    if (matchesAny(fullText, aliases)) {
      matchedWeight += skill.weight;
      matchedSkills.push(skillLabel(skill.name));
    } else {
      missingSkills.push(skillLabel(skill.name));
    }
  }
  // A posting rarely lists your whole stack, so hitting ~half your weighted skills counts as a full match.
  const skillsValue = totalWeight === 0 ? 0.5 : Math.min(1, matchedWeight / (totalWeight * 0.5));

  // ----- Location -----
  let locationValue: number;
  let locationDetail: string;
  if (job.remote) {
    locationValue = prefs.remote === "any" ? 0.8 : 1;
    locationDetail = "Remote";
  } else if (locationMatch) {
    locationValue = 1;
    locationDetail = `In ${locationMatch}`;
  } else {
    locationValue = prefs.remote === "any" ? 0.5 : 0.2;
    locationDetail = job.location || "Location unknown";
  }

  // ----- Salary -----
  let salaryValue: number;
  let salaryDetail: string;
  if (!job.salaryMin && !job.salaryMax) {
    salaryValue = 0.5;
    salaryDetail = "Not listed";
  } else if (!prefs.minSalary) {
    salaryValue = 0.75;
    salaryDetail = "Listed";
  } else {
    const top = job.salaryMax ?? job.salaryMin ?? 0;
    const bottom = job.salaryMin ?? top;
    salaryValue = bottom >= prefs.minSalary ? 1 : top >= prefs.minSalary ? 0.75 : 0;
    salaryDetail = bottom >= prefs.minSalary ? "Meets your minimum" : "Range reaches your minimum";
  }

  // ----- Recency -----
  const recencyValue = Math.max(0, 1 - age / prefs.maxAgeDays);
  const recencyDetail = age < 1 ? "Today" : `${Math.round(age)}d ago`;

  const components: ScoreComponent[] = [
    { key: "title", label: "Title", value: titleValue, detail: titleDetail || "No title match" },
    {
      key: "skills",
      label: "Skills",
      value: skillsValue,
      detail: matchedSkills.length ? matchedSkills.join(", ") : "None of your skills mentioned",
    },
    { key: "location", label: "Location", value: locationValue, detail: locationDetail },
    { key: "salary", label: "Salary", value: salaryValue, detail: salaryDetail },
    { key: "recency", label: "Recency", value: recencyValue, detail: recencyDetail },
  ];

  const weightSum = components.reduce((s, c) => s + prefs.weights[c.key], 0);
  const raw = weightSum === 0 ? 0 : components.reduce((s, c) => s + c.value * prefs.weights[c.key], 0) / weightSum;

  return { score: Math.round(raw * 100), excluded, components, matchedSkills, missingSkills };
}

export interface ScoredJob {
  job: Job;
  score: JobScore;
}

export function rankJobs(jobs: Job[], prefs: Preferences, now = new Date()): ScoredJob[] {
  return jobs
    .map((job) => ({ job, score: scoreJob(job, prefs, now) }))
    .sort((a, b) => b.score.score - a.score.score || +(b.job.postedAt ?? 0) - +(a.job.postedAt ?? 0));
}
