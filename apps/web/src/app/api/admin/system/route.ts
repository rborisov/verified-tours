import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin";
import { collectSystemMetrics } from "@/lib/system-metrics";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const metrics = await collectSystemMetrics();
  return NextResponse.json({ ok: true, metrics });
}
