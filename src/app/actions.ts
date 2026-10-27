"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { runAutoTailor } from "@/lib/autotailor";
import { runIngest } from "@/lib/ingest";
import {
  createTailoredResume,
  getJob,
  getMasterResume,
  saveMasterResume,
  savePreferences,
  setJobStatus,
  updateTailoredMarkdown,
} from "@/lib/repo";
import { tailorResume, TAILOR_MODEL } from "@/lib/tailor";
import { preferencesSchema, type JobStatus, type Skill } from "@/lib/types";

export interface ActionState {
  ok: boolean;
  message: string;
}

const STATUSES: JobStatus[] = ["new", "saved", "applied", "hidden"];

export async function setStatusAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) as JobStatus;
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return;
  await setJobStatus(id, status);
  revalidatePath("/");
  revalidatePath(`/jobs/${id}`);
}

export async function refreshJobsAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const { runId, results } = await runIngest();
    const added = results.reduce((s, r) => s + r.inserted, 0);
    const failed = results.filter((r) => r.error).length;
    // Tailoring takes ~20-40s per job, so it runs after the response is sent.
    after(() => runAutoTailor(runId));
    revalidatePath("/");
    return {
      ok: true,
      message: `${added} new job${added === 1 ? "" : "s"}${failed ? ` · ${failed} source${failed === 1 ? "" : "s"} failed` : ""} · tailoring top matches in the background`,
    };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

// ---------- Preferences ----------

const splitList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Lines like "Node|Node.js: 4". Weight defaults to 3. */
function parseSkills(value: FormDataEntryValue | null): Skill[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)(?:\s*:\s*(\d))?$/);
      const name = (m?.[1] ?? line).trim();
      const weight = Math.min(5, Math.max(1, Number(m?.[2] ?? 3)));
      return { name, weight };
    })
    .filter((s) => s.name.length > 0);
}

const num = (v: FormDataEntryValue | null, fallback: number) => {
  const n = Number(v);
  return v === null || v === "" || !Number.isFinite(n) ? fallback : n;
};

export async function savePreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const minSalaryRaw = String(formData.get("minSalary") ?? "").replace(/[^\d]/g, "");
  const parsed = preferencesSchema.safeParse({
    titleInclude: splitList(formData.get("titleInclude")),
    titleExclude: splitList(formData.get("titleExclude")),
    seniority: splitList(formData.get("seniority")),
    skills: parseSkills(formData.get("skills")),
    excludeKeywords: splitList(formData.get("excludeKeywords")),
    excludeCompanies: splitList(formData.get("excludeCompanies")),
    remote: formData.get("remote"),
    locations: splitList(formData.get("locations")),
    minSalary: minSalaryRaw ? Number(minSalaryRaw) : null,
    maxAgeDays: num(formData.get("maxAgeDays"), 21),
    minScore: num(formData.get("minScore"), 35),
    weights: {
      title: num(formData.get("w_title"), 6),
      skills: num(formData.get("w_skills"), 8),
      location: num(formData.get("w_location"), 4),
      salary: num(formData.get("w_salary"), 3),
      recency: num(formData.get("w_recency"), 4),
    },
    boards: {
      greenhouse: splitList(formData.get("greenhouse")),
      lever: splitList(formData.get("lever")),
      ashby: splitList(formData.get("ashby")),
    },
    sources: {
      remotive: formData.get("src_remotive") === "on",
      remoteok: formData.get("src_remoteok") === "on",
      hn: formData.get("src_hn") === "on",
    },
    autoTailor: {
      enabled: formData.get("at_enabled") === "on",
      minScore: num(formData.get("at_minScore"), 70),
      maxPerRun: num(formData.get("at_maxPerRun"), 10),
    },
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `${issue.path.join(".")}: ${issue.message}` };
  }
  await savePreferences(parsed.data);
  revalidatePath("/");
  revalidatePath("/preferences");
  return { ok: true, message: "Saved. Your feed has been re-ranked." };
}

// ---------- Resumes ----------

export async function saveResumeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const markdown = String(formData.get("markdown") ?? "").trim();
  if (markdown.length < 50) return { ok: false, message: "That looks too short to be a resume." };
  await saveMasterResume(markdown);
  revalidatePath("/resume");
  return { ok: true, message: "Master resume saved." };
}

export async function tailorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const jobId = Number(formData.get("jobId"));
  const guidance = String(formData.get("guidance") ?? "").trim() || null;
  const [job, master] = await Promise.all([getJob(jobId), getMasterResume()]);
  if (!job) return { ok: false, message: "Job not found." };
  if (!master) return { ok: false, message: "Add your master resume first (Resume tab)." };

  let id: number;
  try {
    const result = await tailorResume({ masterResume: master.markdown, job, guidance });
    id = await createTailoredResume({
      jobId,
      markdown: result.resume_markdown,
      changes: result.changes,
      gaps: result.gaps,
      guidance,
      model: TAILOR_MODEL,
    });
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/tailored/${id}`);
}

export async function autoTailorNowAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  after(() => runAutoTailor());
  return { ok: true, message: "Tailoring top matches in the background. Check the Resume ready tab in a minute." };
}

export async function updateTailoredAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = Number(formData.get("id"));
  const markdown = String(formData.get("markdown") ?? "").trim();
  if (!markdown) return { ok: false, message: "Resume can't be empty." };
  await updateTailoredMarkdown(id, markdown);
  revalidatePath(`/tailored/${id}`);
  return { ok: true, message: "Saved." };
}
