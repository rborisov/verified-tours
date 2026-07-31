import fs from "node:fs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveMutexPath } from "@/lib/agent";
import { prisma } from "@/lib/db";
import { requireInternalApi } from "@/lib/require-internal";

const bodySchema = z.object({
  jobId: z.string().min(1),
  requestId: z.string().optional(),
  status: z.enum(["awaiting_human", "done", "failed"]).default("awaiting_human"),
  error: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const auth = requireInternalApi(request);
  if (auth.error) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { jobId, requestId, status, error } = parsed.data;
  const now = new Date();

  const job = await prisma.agentJob.update({
    where: { id: jobId },
    data: {
      status: status === "failed" ? "failed" : "done",
      error: error ?? null,
      finishedAt: now,
    },
  });

  const reqId = requestId ?? job.requestId;
  if (reqId) {
    await prisma.searchRequest.update({
      where: { id: reqId },
      data: {
        status: status === "failed" ? "failed" : status,
        error: error ?? null,
      },
    });
  }

  try {
    fs.unlinkSync(resolveMutexPath());
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, jobId, status });
}
