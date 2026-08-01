import { NextResponse } from "next/server";
import { z } from "zod";

import { resetOfferCache } from "@/lib/offer-stats";
import { requireAdminApi } from "@/lib/require-admin";

const bodySchema = z.object({
  scope: z.enum(["rejected", "pending", "non_verified", "all_offers"]),
});

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await resetOfferCache(parsed.data.scope);
  return NextResponse.json({
    ok: true,
    ...result,
    by: admin.session.user.email || "admin",
  });
}
