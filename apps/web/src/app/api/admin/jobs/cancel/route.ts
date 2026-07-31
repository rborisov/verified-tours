import fs from "node:fs";

import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveMutexPath } from "@/lib/agent";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/require-admin";

const bodySchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(["cancel"]),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const job = await prisma.agentJob.findUnique({
    where: { id: parsed.data.jobId },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "queued" && job.status !== "running") {
    return NextResponse.json({ error: `Job already ${job.status}` }, { status: 409 });
  }

  const now = new Date();
  await prisma.agentJob.update({
    where: { id: job.id },
    data: {
      status: "failed",
      error: `Cancelled by ${admin.session.user.email || "admin"}`,
      finishedAt: now,
    },
  });
  if (job.requestId) {
    await prisma.searchRequest.update({
      where: { id: job.requestId },
      data: {
        status: "failed",
        error: `Cancelled by ${admin.session.user.email || "admin"}`,
      },
    });
  }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // process may already be gone
    }
  }

  try {
    fs.unlinkSync(resolveMutexPath());
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, jobId: job.id, status: "failed" });
}
