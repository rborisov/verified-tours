import { PrismaClient } from "@prisma/client";
import cron from "node-cron";
import fs from "node:fs";

const prisma = new PrismaClient();

const DISK_CRON = process.env.DISK_CHECK_CRON?.trim() || "0 * * * *";
const USED_PCT = Number(process.env.DISK_ALERT_USED_PCT || "85");
const COOLDOWN_HOURS = Number(process.env.DISK_ALERT_COOLDOWN_HOURS || "6");

function portalBaseUrl(): string {
  return (process.env.PORTAL_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
}

async function maybeNotify(message: string, freeBytes: number, usedPct: number) {
  const webhook = process.env.DISK_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.warn(`[disk] ALERT (no webhook): ${message}`);
    return;
  }
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, freeBytes, usedPct }),
    });
  } catch (error) {
    console.error("[disk] webhook failed", error);
  }
}

async function checkDisk() {
  let free = 0;
  let size = 0;
  try {
    const st = fs.statfsSync(process.cwd());
    size = Number(st.blocks) * Number(st.bsize);
    free = Number(st.bavail) * Number(st.bsize);
  } catch (error) {
    console.error("[disk] statfs failed", error);
    return;
  }

  const usedPct = size > 0 ? ((size - free) / size) * 100 : 0;
  if (usedPct < USED_PCT) {
    console.log(`[disk] ok used=${usedPct.toFixed(1)}% free=${free}`);
    return;
  }

  const since = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await prisma.diskAlert.findFirst({
    where: { sentAt: { gte: since } },
    orderBy: { sentAt: "desc" },
  });
  if (recent) {
    console.log(`[disk] alert suppressed (cooldown) used=${usedPct.toFixed(1)}%`);
    return;
  }

  const message = `verified-tours disk alert: used ${usedPct.toFixed(1)}% (threshold ${USED_PCT}%), free ${Math.round(free / (1024 * 1024))} MiB on host running ${portalBaseUrl()}`;
  await prisma.diskAlert.create({
    data: {
      freeBytes: BigInt(free),
      usedPct,
      message,
    },
  });
  await maybeNotify(message, free, usedPct);
  console.warn(`[disk] ${message}`);
}

async function main() {
  console.log(`[worker] disk cron=${DISK_CRON} threshold=${USED_PCT}% cwd=${process.cwd()}`);
  if (!cron.validate(DISK_CRON)) {
    throw new Error(`Invalid DISK_CHECK_CRON: ${DISK_CRON}`);
  }
  cron.schedule(DISK_CRON, () => {
    void checkDisk();
  });
  await checkDisk();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
