import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db";

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      try {
        if (entry.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      } catch {
        // ignore
      }
    }
  };
  walk(dir);
  return total;
}

export async function collectSystemMetrics() {
  const workspace =
    process.env.AGENT_WORKSPACE?.trim() ||
    path.resolve(process.cwd(), "../../workspace");
  const dataDir = path.resolve(process.cwd(), "data");

  let dbBytes = 0;
  try {
    const dbUrl = process.env.DATABASE_URL?.replace(/^file:/, "") || "";
    const dbPath = path.isAbsolute(dbUrl)
      ? dbUrl
      : path.resolve(process.cwd(), "prisma", dbUrl);
    if (fs.existsSync(dbPath)) dbBytes = fs.statSync(dbPath).size;
  } catch {
    // ignore
  }

  let disk: { free: number; size: number; usedPct: number } | null = null;
  try {
    const st = fs.statfsSync(process.cwd());
    const size = Number(st.blocks) * Number(st.bsize);
    const free = Number(st.bavail) * Number(st.bsize);
    disk = {
      free,
      size,
      usedPct: size > 0 ? ((size - free) / size) * 100 : 0,
    };
  } catch {
    disk = null;
  }

  const [offers, pending, verified, jobsRunning] = await Promise.all([
    prisma.offer.count(),
    prisma.offer.count({ where: { status: "pending_human" } }),
    prisma.offer.count({ where: { status: "verified" } }),
    prisma.agentJob.count({ where: { status: "running" } }),
  ]);

  return {
    disk,
    storage: {
      databaseBytes: dbBytes,
      workspaceBytes: dirBytes(workspace),
      dataBytes: dirBytes(dataDir),
    },
    counts: { offers, pending, verified, jobsRunning },
    apiKeyConfigured: Boolean(process.env.CURSOR_API_KEY?.trim()),
  };
}
