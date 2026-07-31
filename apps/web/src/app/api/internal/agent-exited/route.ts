import fs from "node:fs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveMutexPath } from "@/lib/agent";
import { prisma } from "@/lib/db";
import { requireInternalApi } from "@/lib/require-internal";

const bodySchema = z.object({
  jobId: z.string().min(1),
  exitCode: z.number().int(),
});

function releaseMutexBestEffort() {
  try {
    fs.unlinkSync(resolveMutexPath());
  } catch {
    // ignore
  }
}

export async function POST(request: Request) {
  const auth = requireInternalApi(request);
  if (auth.error) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { jobId, exitCode } = parsed.data;
  const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
  if (!job) {
    releaseMutexBestEffort();
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (job.status === "running" || job.status === "queued") {
    const failed = exitCode !== 0;
    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: failed ? "failed" : "done",
        error: failed ? `Agent exited with code ${exitCode}` : null,
        finishedAt: new Date(),
      },
    });
    if (job.requestId) {
      const requestRow = await prisma.searchRequest.findUnique({
        where: { id: job.requestId },
      });
      // If agent exited without finish_search_job, keep awaiting_human when exit 0
      // and there are pending offers; else mark failed/done accordingly.
      if (requestRow && requestRow.status === "running") {
        const pending = await prisma.offer.count({
          where: { searchRequestId: job.requestId, status: "pending_human" },
        });
        await prisma.searchRequest.update({
          where: { id: job.requestId },
          data: {
            status: failed ? "failed" : pending > 0 ? "awaiting_human" : "done",
            error: failed ? `Agent exited with code ${exitCode}` : null,
          },
        });
      }
    }
  }

  releaseMutexBestEffort();
  return NextResponse.json({ ok: true, jobId, exitCode });
}
