import { existsSync, readFileSync } from "node:fs";
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

function logPath(jobId: string) {
  return path.join(resolveWorkspace(), "logs", `${jobId}.log`);
}

function promptPath(jobId: string) {
  return path.join(resolveWorkspace(), "logs", `${jobId}.prompt.txt`);
}

function readLogTail(jobId: string, maxChars = 48_000): string | null {
  const file = logPath(jobId);
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    return raw.length <= maxChars ? raw : raw.slice(-maxChars);
  } catch {
    return null;
  }
}

function readPromptFile(jobId: string, maxChars = 16_000): string | null {
  const file = promptPath(jobId);
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars)}\n…`;
  } catch {
    return null;
  }
}

type JobRow = {
  id: string;
  status: string;
  error: string | null;
  pid: number | null;
  prompt: string | null;
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
};

function serializeJob(job: JobRow, withArtifacts: boolean) {
  const filePrompt = withArtifacts ? readPromptFile(job.id) : null;
  const prompt = withArtifacts ? filePrompt || job.prompt || null : null;
  const logTail = withArtifacts ? readLogTail(job.id) : null;

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
    hasPrompt: withArtifacts
      ? Boolean(prompt)
      : Boolean(job.prompt) || existsSync(promptPath(job.id)),
    hasLog: withArtifacts ? Boolean(logTail) : existsSync(logPath(job.id)),
    ...(withArtifacts ? { prompt, logTail } : {}),
  };
}

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const selectedId = new URL(request.url).searchParams.get("jobId")?.trim() || null;

  const [active, latest, recent, pendingOffers, selected] = await Promise.all([
    prisma.agentJob.findFirst({
      where: { status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
      include: { request: true },
    }),
    prisma.agentJob.findFirst({
      orderBy: { createdAt: "desc" },
      include: { request: true },
    }),
    prisma.agentJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { request: true },
    }),
    prisma.offer.count({ where: { status: "pending_human" } }),
    selectedId
      ? prisma.agentJob.findUnique({
          where: { id: selectedId },
          include: { request: true },
        })
      : Promise.resolve(null),
  ]);

  // Explicit selection wins (post-run analysis); else live job; else most recent.
  const focus = selected ?? active ?? latest;

  const pendingForRequest = focus?.requestId
    ? await prisma.offer.count({
        where: { searchRequestId: focus.requestId, status: "pending_human" },
      })
    : 0;

  return NextResponse.json({
    ok: true,
    active: active
      ? {
          ...serializeJob(active, true),
          pendingForRequest:
            focus?.id === active.id
              ? pendingForRequest
              : await prisma.offer.count({
                  where: {
                    searchRequestId: active.requestId ?? "__none__",
                    status: "pending_human",
                  },
                }),
          live: true,
        }
      : null,
    focus: focus
      ? {
          ...serializeJob(focus, true),
          pendingForRequest,
          live: Boolean(active && active.id === focus.id),
        }
      : null,
    pendingOffers,
    recent: recent.map((job) => serializeJob(job, false)),
  });
}
