import type { JobInput } from "../types";
import { detectRemote, htmlToText, parseSalary, toDate } from "../text";
import { fetchJson } from "./http";

const titleize = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true ----------

export interface GreenhouseResponse {
  jobs: {
    id: number;
    title: string;
    absolute_url: string;
    updated_at?: string;
    first_published?: string;
    company_name?: string;
    location?: { name?: string };
    content?: string;
  }[];
}

export function parseGreenhouse(raw: GreenhouseResponse, slug: string): JobInput[] {
  return (raw.jobs ?? []).map((j) => {
    const description = htmlToText(j.content);
    const location = j.location?.name?.trim() || null;
    const salary = parseSalary(description);
    return {
      source: "greenhouse",
      externalId: `${slug}:${j.id}`,
      company: j.company_name?.trim() || titleize(slug),
      title: j.title.trim(),
      location,
      remote: detectRemote(location, j.title),
      url: j.absolute_url,
      description,
      tags: [],
      salaryMin: salary.min,
      salaryMax: salary.max,
      postedAt: toDate(j.first_published ?? j.updated_at),
    };
  });
}

export async function fetchGreenhouse(slug: string): Promise<JobInput[]> {
  const raw = await fetchJson<GreenhouseResponse>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
  );
  return parseGreenhouse(raw, slug);
}

// ---------- Lever: https://api.lever.co/v0/postings/{slug}?mode=json ----------

export type LeverResponse = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string; team?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}[];

export function parseLever(raw: LeverResponse, slug: string): JobInput[] {
  return (raw ?? []).map((j) => {
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const description = [j.descriptionPlain ?? htmlToText(j.description), lists, j.additionalPlain ?? ""]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const location = j.categories?.location?.trim() || null;
    const annual = j.salaryRange && (!j.salaryRange.interval || /year|annual/i.test(j.salaryRange.interval));
    const parsed = parseSalary(description);
    return {
      source: "lever",
      externalId: `${slug}:${j.id}`,
      company: titleize(slug),
      title: j.text.trim(),
      location,
      remote: j.workplaceType === "remote" || detectRemote(location),
      url: j.hostedUrl,
      description,
      tags: [j.categories?.team, j.categories?.commitment].filter((t): t is string => !!t),
      salaryMin: annual ? (j.salaryRange?.min ?? null) : parsed.min,
      salaryMax: annual ? (j.salaryRange?.max ?? null) : parsed.max,
      postedAt: toDate(j.createdAt),
    };
  });
}

export async function fetchLever(slug: string): Promise<JobInput[]> {
  const raw = await fetchJson<LeverResponse>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  return parseLever(raw, slug);
}

// ---------- Ashby: https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true ----------

export interface AshbyResponse {
  jobs: {
    id?: string;
    title: string;
    location?: string;
    isRemote?: boolean;
    workplaceType?: string;
    publishedAt?: string;
    jobUrl: string;
    descriptionPlain?: string;
    descriptionHtml?: string;
    isListed?: boolean;
    compensation?: {
      summaryComponents?: { compensationType?: string; interval?: string; minValue?: number; maxValue?: number }[];
    };
  }[];
}

export function parseAshby(raw: AshbyResponse, slug: string): JobInput[] {
  return (raw.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const description = j.descriptionPlain?.trim() || htmlToText(j.descriptionHtml);
      const salaryComp = j.compensation?.summaryComponents?.find(
        (c) => c.compensationType === "Salary" && (!c.interval || /year/i.test(c.interval)),
      );
      const parsed = parseSalary(description);
      const location = j.location?.trim() || null;
      return {
        source: "ashby",
        externalId: `${slug}:${j.id ?? j.jobUrl}`,
        company: titleize(slug),
        title: j.title.trim(),
        location,
        remote: j.isRemote === true || j.workplaceType === "Remote" || detectRemote(location),
        url: j.jobUrl,
        description,
        tags: [],
        salaryMin: salaryComp?.minValue ?? parsed.min,
        salaryMax: salaryComp?.maxValue ?? parsed.max,
        postedAt: toDate(j.publishedAt),
      };
    });
}

export async function fetchAshby(slug: string): Promise<JobInput[]> {
  const raw = await fetchJson<AshbyResponse>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
  );
  return parseAshby(raw, slug);
}
