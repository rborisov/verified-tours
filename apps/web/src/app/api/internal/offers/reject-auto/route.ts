import { NextResponse } from "next/server";
import { z } from "zod";

import { offerFingerprint } from "@/lib/agent";
import { prisma } from "@/lib/db";
import { requireInternalApi } from "@/lib/require-internal";

const bodySchema = z.object({
  jobId: z.string().optional(),
  requestId: z.string().optional(),
  source: z.string().min(1),
  hotelName: z.string().min(1),
  hotelId: z.string().optional().nullable(),
  country: z.string().optional().default(""),
  deepLink: z.string().url(),
  fromCity: z.string().min(1),
  startDate: z.string().min(1),
  nights: z.number().int().positive(),
  adults: z.number().int().positive(),
  childrenAges: z.string().default(""),
  listingPriceRub: z.number().int().optional().nullable(),
  pagePriceRub: z.number().int().optional().nullable(),
  reason: z.string().min(1),
  autoNotes: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const auth = requireInternalApi(request);
  if (auth.error) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const fingerprint = offerFingerprint({
    source: data.source,
    hotelId: data.hotelId,
    hotelName: data.hotelName,
    fromCity: data.fromCity,
    startDate: data.startDate,
    nights: data.nights,
    adults: data.adults,
    childrenAges: data.childrenAges,
  });

  let priceDriftPct: number | null = null;
  if (data.listingPriceRub && data.pagePriceRub && data.listingPriceRub > 0) {
    priceDriftPct =
      (Math.abs(data.pagePriceRub - data.listingPriceRub) / data.listingPriceRub) *
      100;
  }

  const start = new Date(data.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + data.nights);

  const offer = await prisma.offer.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      searchRequestId: data.requestId,
      source: data.source,
      hotelName: data.hotelName,
      hotelId: data.hotelId ?? null,
      country: data.country || "unknown",
      deepLink: data.deepLink,
      fromCity: data.fromCity,
      startDate: start,
      endDate: end,
      nights: data.nights,
      adults: data.adults,
      childrenAges: data.childrenAges,
      listingPriceRub: data.listingPriceRub ?? null,
      pagePriceRub: data.pagePriceRub ?? null,
      priceDriftPct,
      autoLevel: "L2",
      autoNotes: data.autoNotes ?? null,
      status: "rejected",
      rejectReason: data.reason,
    },
    update: {
      status: "rejected",
      rejectReason: data.reason,
      autoNotes: data.autoNotes ?? null,
      listingPriceRub: data.listingPriceRub ?? undefined,
      pagePriceRub: data.pagePriceRub ?? undefined,
      priceDriftPct: priceDriftPct ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, offerId: offer.id, fingerprint, status: "rejected" });
}
