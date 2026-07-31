import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireInternalApi } from "@/lib/require-internal";

const bodySchema = z.object({
  fromCity: z.string().min(1),
  countries: z.string().optional(),
  departFrom: z.string().optional(),
  departTo: z.string().optional(),
  adults: z.number().int().positive().optional(),
  childrenAges: z.string().optional(),
  includeRejected: z.boolean().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export async function POST(request: Request) {
  const auth = requireInternalApi(request);
  if (auth.error) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    fromCity,
    countries,
    departFrom,
    departTo,
    adults,
    childrenAges,
    includeRejected = true,
    limit = 20,
  } = parsed.data;

  const now = new Date();
  const countryList = (countries || "")
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean);

  const verified = await prisma.offer.findMany({
    where: {
      status: "verified",
      fromCity: { contains: fromCity },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(adults ? { adults } : {}),
      ...(childrenAges !== undefined ? { childrenAges } : {}),
      ...(departFrom || departTo
        ? {
            startDate: {
              ...(departFrom ? { gte: new Date(departFrom) } : {}),
              ...(departTo ? { lte: new Date(departTo) } : {}),
            },
          }
        : {}),
      ...(countryList.length
        ? {
            OR: countryList.map((c) => ({
              country: { contains: c },
            })),
          }
        : {}),
    },
    orderBy: { verifiedAt: "desc" },
    take: limit,
  });

  const rejected = includeRejected
    ? await prisma.offer.findMany({
        where: {
          status: "rejected",
          fromCity: { contains: fromCity },
        },
        select: {
          fingerprint: true,
          hotelName: true,
          deepLink: true,
          rejectReason: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : [];

  return NextResponse.json({ ok: true, verified, rejected });
}
