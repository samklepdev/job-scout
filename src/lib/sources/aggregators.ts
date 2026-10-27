import type { JobInput } from "../types";
import { detectRemote, htmlToText, parseSalary, toDate, truncate } from "../text";
import { fetchJson } from "./http";

// ---------- Remotive: https://remotive.com/api/remote-jobs?category=software-dev ----------

export interface RemotiveResponse {
  jobs: {
    id: number;
    url: string;
    title: string;
    company_name: string;
    tags?: string[];
    publication_date?: string;
    candidate_required_location?: string;
    salary?: string;
    description?: string;
  }[];
}

export function parseRemotive(raw: RemotiveResponse): JobInput[] {
  return (raw.jobs ?? []).map((j) => {
    const description = htmlToText(j.description);
    const fromField = parseSalary(j.salary);
    const s = fromField.min ? fromField : parseSalary(description);
    return {
      source: "remotive",
      externalId: String(j.id),
      company: j.company_name.trim(),
      title: j.title.trim(),
      location: j.candidate_required_location?.trim() || "Remote",
      remote: true,
      url: j.url,
      description,
      tags: j.tags ?? [],
      salaryMin: s.min,
      salaryMax: s.max,
      postedAt: toDate(j.publication_date),
    };
  });
}

export async function fetchRemotive(): Promise<JobInput[]> {
  return parseRemotive(await fetchJson<RemotiveResponse>("https://remotive.com/api/remote-jobs?category=software-dev"));
}

// ---------- RemoteOK: https://remoteok.com/api (first element is a legal notice) ----------

export type RemoteOkResponse = (
  | {
      id?: string | number;
      epoch?: number;
      date?: string;
      company?: string;
      position?: string;
      tags?: string[];
      description?: string;
      location?: string;
      salary_min?: number;
      salary_max?: number;
      url?: string;
      apply_url?: string;
    }
  | { legal: string }
)[];

export function parseRemoteOk(raw: RemoteOkResponse): JobInput[] {
  const out: JobInput[] = [];
  for (const item of raw ?? []) {
    if ("legal" in item || !item.id || !item.position || !item.company) continue;
    out.push({
      source: "remoteok",
      externalId: String(item.id),
      company: item.company.trim(),
      title: item.position.trim(),
      location: item.location?.trim() || "Remote",
      remote: true,
      url: item.url || item.apply_url || `https://remoteok.com/remote-jobs/${item.id}`,
      description: htmlToText(item.description),
      tags: item.tags ?? [],
      salaryMin: item.salary_min || null,
      salaryMax: item.salary_max || null,
      postedAt: item.epoch ? new Date(item.epoch * 1000) : toDate(item.date),
    });
  }
  return out;
}

export async function fetchRemoteOk(): Promise<JobInput[]> {
  return parseRemoteOk(await fetchJson<RemoteOkResponse>("https://remoteok.com/api"));
}

// ---------- Hacker News "Ask HN: Who is hiring?" via the Algolia API ----------

export interface HnItem {
  id: number;
  created_at_i?: number;
  text?: string | null;
  author?: string | null;
  children?: HnItem[];
}

const ROLE_HINT = /\b(engineer|developer|swe|full[- ]?stack|front[- ]?end|back[- ]?end|programmer|devops|sre)\b/i;

/** Top-level comments conventionally start with "Company | Role | Location | REMOTE | Salary". */
export function parseHnThread(thread: HnItem): JobInput[] {
  const out: JobInput[] = [];
  for (const c of thread.children ?? []) {
    if (!c.text || !c.author) continue;
    const text = htmlToText(c.text);
    const firstLine = text.split("\n")[0] ?? "";
    const parts = firstLine.split(/\s+\|\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const company = truncate(parts[0], 80);
    const roleParts = parts.slice(1).filter((p) => ROLE_HINT.test(p));
    const title = truncate(roleParts.length ? roleParts.join(" / ") : parts[1], 160);
    const others = parts.slice(1).filter((p) => !roleParts.includes(p) && p !== parts[1]);
    const locationPart = others.find((p) => /remote|onsite|on-site|hybrid|,|\b[A-Z]{2}\b/.test(p)) ?? null;
    const salary = parseSalary(firstLine);
    const s = salary.min ? salary : parseSalary(text);

    out.push({
      source: "hn",
      externalId: String(c.id),
      company,
      title,
      location: locationPart ? truncate(locationPart, 120) : null,
      remote: detectRemote(firstLine),
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      description: text,
      tags: [],
      salaryMin: s.min,
      salaryMax: s.max,
      postedAt: c.created_at_i ? new Date(c.created_at_i * 1000) : null,
    });
  }
  return out;
}

export async function fetchHnWhoIsHiring(): Promise<JobInput[]> {
  const search = await fetchJson<{ hits: { objectID: string; title: string }[] }>(
    "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10",
  );
  const story = search.hits.find((h) => /who is hiring/i.test(h.title));
  if (!story) return [];
  const thread = await fetchJson<HnItem>(`https://hn.algolia.com/api/v1/items/${story.objectID}`, 45_000);
  return parseHnThread(thread);
}
