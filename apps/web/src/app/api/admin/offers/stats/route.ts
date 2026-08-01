import { NextResponse } from "next/server";

import { collectOfferSessionStats } from "@/lib/offer-stats";
import { requireAdminApi } from "@/lib/require-admin";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const stats = await collectOfferSessionStats();
  return NextResponse.json({ ok: true, ...stats });
}
