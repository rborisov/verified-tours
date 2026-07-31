import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/require-admin";

function resolveWorkspace(): string {
  return (
    process.env.AGENT_WORKSPACE?.trim() ||
    path.resolve(process.cwd(), "../../workspace")
  );
}

function readLogTail(jobId: string, maxChars = 4000): string | null {
  const logPath = path.join(resolveWorkspace(), "logs", `${jobId}.log`);
  if (!existsSync(logPath)) return null;
  try {
    const raw = readFileSync(logPath, "utf8");
    return raw.length <= maxChars ? raw : raw.slice(-maxChars);
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const active = await prisma.agentJob.findFirst({
    where: { status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    include: { request: true },
  });

  const recent = await prisma.agentJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { request: true },
  });

  const pendingOffers = await prisma.offer.count({
    where: { status: "pending_human" },
  });

  if (!active) {
    return NextResponse.json({
      ok: true,
      active: null,
      pendingOffers,
      recent: recent.map(serializeJob),
    });
  }

  const pendingForRequest = active.requestId
    ? await prisma.offer.count({
        where: { searchRequestId: active.requestId, status: "pending_human" },
      })
    : 0;

  return NextResponse.json({
    ok: true,
    active: {
      ...serializeJob(active),
      pendingForRequest,
      logTail: readLogTail(active.id),
    },
    pendingOffers,
    recent: recent.map(serializeJob),
  });
}

function serializeJob(job: {
  id: string;
  status: string;
  error: string | null;
  pid: number | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  requestId: string | null;
  request: {
    id: string;
    status: string;
    fromCity: string;
    countries: string;
    adults: number;
    childrenAges: string;
    departFrom: Date;
    departTo: Date;
  } | null;
}) {
  return {
    id: job.id,
    status: job.status,
    error: job.error,
    pid: job.pid,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    requestId: job.requestId,
    request: job.request
      ? {
          id: job.request.id,
          status: job.request.status,
          fromCity: job.request.fromCity,
          countries: job.request.countries,
          adults: job.request.adults,
          childrenAges: job.request.childrenAges,
          departFrom: job.request.departFrom.toISOString().slice(0, 10),
          departTo: job.request.departTo.toISOString().slice(0, 10),
        }
      : null,
  };
}
