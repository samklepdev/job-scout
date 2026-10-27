import { NextResponse } from "next/server";
import { runAutoTailor } from "@/lib/autotailor";
import { runIngest } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** For cron: POST /api/ingest with "Authorization: Bearer $CRON_SECRET". Add ?tailor=0 to skip auto-tailoring. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId, results } = await runIngest();
  const autoTailor = new URL(req.url).searchParams.get("tailor") === "0" ? null : await runAutoTailor(runId);
  return NextResponse.json({ results, autoTailor });
}
