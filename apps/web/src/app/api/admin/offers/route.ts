import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/require-admin";

export async function GET(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;

  const offers = await prisma.offer.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ ok: true, offers });
}

const patchSchema = z.object({
  offerId: z.string().min(1),
  action: z.enum(["verify", "reject"]),
  reason: z.string().optional(),
  expiresInHours: z.number().positive().optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdminApi();
  if (admin.error) return admin.error;

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { offerId, action, reason, expiresInHours } = parsed.data;
  const email = admin.session.user.email || "admin";

  if (action === "verify") {
    const offer = await prisma.offer.update({
      where: { id: offerId },
      data: {
        status: "verified",
        verifiedAt: new Date(),
        verifiedBy: email,
        rejectReason: null,
        expiresAt: new Date(
          Date.now() + (expiresInHours ?? 24) * 60 * 60 * 1000,
        ),
      },
    });
    return NextResponse.json({ ok: true, offer });
  }

  const offer = await prisma.offer.update({
    where: { id: offerId },
    data: {
      status: "rejected",
      rejectReason: reason || "Rejected by admin",
      verifiedBy: email,
      verifiedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, offer });
}
