import { getJob, getTailoredResume } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tailored = await getTailoredResume(Number(id));
  if (!tailored) return new Response("Not found", { status: 404 });
  const job = await getJob(tailored.jobId);
  const slug = `${job?.company ?? "job"}-${job?.title ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return new Response(tailored.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="resume-${slug}.md"`,
    },
  });
}
