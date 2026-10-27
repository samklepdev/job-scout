import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Job } from "./types";
import { truncate } from "./text";

export const TAILOR_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const resultSchema = z.object({
  resume_markdown: z.string().min(50),
  changes: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
});
export type TailorResult = z.infer<typeof resultSchema>;

const SYSTEM = `You tailor a software engineer's resume to a specific job posting.

Hard rules — never break these:
- Use only facts present in the master resume. Never invent employers, titles, dates, degrees, certifications, metrics, projects or technologies.
- You may reorder sections and bullets, rewrite bullets to foreground relevant work, mirror the posting's terminology where the resume genuinely supports it, tighten wording, and drop or condense less relevant items.
- Keep the candidate's name and contact details exactly as given.
- Keep it to roughly one page (two at most for very senior histories). Concise, results-first bullets; no buzzword stuffing.
- Output clean Markdown in the same overall structure as the master resume (# name, ## sections, bullet lists).

Also report:
- changes: short notes on what you changed and why, so the candidate can review quickly.
- gaps: requirements in the posting that the resume does not evidence. Do not paper over these; the candidate decides whether they can honestly address them.`;

const TOOL: Anthropic.Tool = {
  name: "submit_tailored_resume",
  description: "Return the tailored resume and review notes.",
  input_schema: {
    type: "object",
    properties: {
      resume_markdown: { type: "string", description: "The full tailored resume in Markdown." },
      changes: { type: "array", items: { type: "string" }, description: "What changed and why (3-8 items)." },
      gaps: { type: "array", items: { type: "string" }, description: "Posting requirements the resume doesn't evidence." },
    },
    required: ["resume_markdown", "changes", "gaps"],
  },
};

export async function tailorResume(params: {
  masterResume: string;
  job: Job;
  guidance?: string | null;
}): Promise<TailorResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in .env.local.");
  const client = new Anthropic();
  const { job } = params;

  const posting = [
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    job.location ? `Location: ${job.location}${job.remote ? " (remote)" : ""}` : job.remote ? "Location: Remote" : "",
    "",
    truncate(job.description, 15_000),
  ].join("\n");

  const userContent = [
    `<master_resume>\n${params.masterResume}\n</master_resume>`,
    `<job_posting>\n${posting}\n</job_posting>`,
    params.guidance?.trim() ? `<candidate_guidance>\n${params.guidance.trim()}\n</candidate_guidance>` : "",
    "Tailor the resume for this posting and submit it with the tool.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const message = await client.messages.create({
    model: TAILOR_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("The model did not return a tailored resume. Try again.");
  const parsed = resultSchema.safeParse(block.input);
  if (!parsed.success) throw new Error("The model returned an unexpected format. Try again.");
  return parsed.data;
}
