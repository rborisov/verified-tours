import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildTourSearchPrompt,
  spawnTourAgent,
  tryAcquireAgentMutex,
} from "@/lib/agent";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/require-admin";

const bodySchema = z.object({
  adults: z.number().int().positive().default(2),
  childrenAges: z.string().default(""),
  fromCity: z.string().min(1),
  countries: z.string().min(1),
  departFrom: z.string().min(1),
  departTo: z.string().min(1),
  nightsMin: z.number().int().positive().default(7),
  nightsMax: z.number().int().positive().default(7),
  seaRequired: z.boolean().default(true),
  visaFreeOnly: z.boolean().default(true),
  preferHot: z.boolean().default(true),
  rawBrief: z.string().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const mutex = tryAcquireAgentMutex(`verified-tours:${admin.session.user.email}`);
  if (!mutex.ok) {
    return NextResponse.json({ error: mutex.error }, { status: 409 });
  }

  const running = await prisma.agentJob.findFirst({
    where: { status: { in: ["queued", "running"] } },
  });
  if (running) {
    mutex.release();
    return NextResponse.json(
      { error: "Another tour search job is already active.", jobId: running.id },
      { status: 409 },
    );
  }

  const searchRequest = await prisma.searchRequest.create({
    data: {
      adults: data.adults,
      childrenAges: data.childrenAges,
      fromCity: data.fromCity,
      countries: data.countries,
      departFrom: new Date(data.departFrom),
      departTo: new Date(data.departTo),
      nightsMin: data.nightsMin,
      nightsMax: data.nightsMax,
      seaRequired: data.seaRequired,
      visaFreeOnly: data.visaFreeOnly,
      preferHot: data.preferHot,
      rawBrief: data.rawBrief,
      status: "queued",
    },
  });

  const job = await prisma.agentJob.create({
    data: {
      kind: "tour_search",
      status: "queued",
      requestId: searchRequest.id,
    },
  });

  const prompt = buildTourSearchPrompt({
    jobId: job.id,
    requestId: searchRequest.id,
    adults: data.adults,
    childrenAges: data.childrenAges,
    fromCity: data.fromCity,
    countries: data.countries,
    departFrom: data.departFrom.slice(0, 10),
    departTo: data.departTo.slice(0, 10),
    nightsMin: data.nightsMin,
    nightsMax: data.nightsMax,
    seaRequired: data.seaRequired,
    visaFreeOnly: data.visaFreeOnly,
    preferHot: data.preferHot,
    rawBrief: data.rawBrief,
  });

  const spawn = spawnTourAgent(prompt, job.id);
  if (!spawn.ok) {
    mutex.release();
    await prisma.agentJob.update({
      where: { id: job.id },
      data: { status: "failed", error: spawn.error, finishedAt: new Date() },
    });
    await prisma.searchRequest.update({
      where: { id: searchRequest.id },
      data: { status: "failed", error: spawn.error },
    });
    return NextResponse.json({ error: spawn.error }, { status: 500 });
  }

  await prisma.agentJob.update({
    where: { id: job.id },
    data: {
      status: "running",
      prompt,
      pid: spawn.pid,
      startedAt: new Date(),
    },
  });
  await prisma.searchRequest.update({
    where: { id: searchRequest.id },
    data: { status: "running", jobId: job.id },
  });

  // Mutex is released when agent-exited / finish is called.
  // Keep file locked while job runs (do not release here).
  void mutex;

  return NextResponse.json({
    ok: true,
    requestId: searchRequest.id,
    jobId: job.id,
    pid: spawn.pid,
  });
}
