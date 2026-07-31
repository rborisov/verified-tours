import { NextResponse } from "next/server";
import { z } from "zod";

import { offerFingerprint } from "@/lib/agent";
import { deepLinkRejectionReason } from "@/lib/deep-link";
import { prisma } from "@/lib/db";
import { requireInternalApi } from "@/lib/require-internal";

const bodySchema = z.object({
  jobId: z.string().min(1),
  requestId: z.string().optional(),
  source: z.string().min(1),
  hotelName: z.string().min(1),
  hotelId: z.string().optional().nullable(),
  country: z.string().min(1),
  resort: z.string().optional().nullable(),
  deepLink: z.string().url(),
  fromCity: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  nights: z.number().int().positive(),
  adults: z.number().int().positive(),
  childrenAges: z.string().default(""),
  listingPriceRub: z.number().int().positive().optional().nullable(),
  pagePriceRub: z.number().int().positive(),
  hasFlight: z.boolean().default(true),
  seaNote: z.string().optional().nullable(),
  hotBadge: z.string().optional().nullable(),
  visaOk: z.boolean().default(true),
  autoLevel: z.enum(["L1", "L2", "L3"]),
  autoNotes: z.string().optional().nullable(),
  expiresInHours: z.number().positive().optional(),
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
  const badLink = deepLinkRejectionReason(data.deepLink);
  if (badLink) {
    return NextResponse.json({ error: badLink, deepLink: data.deepLink }, { status: 422 });
  }

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
  if (data.listingPriceRub && data.listingPriceRub > 0) {
    priceDriftPct =
      (Math.abs(data.pagePriceRub - data.listingPriceRub) / data.listingPriceRub) *
      100;
    if (priceDriftPct > 15) {
      return NextResponse.json(
        {
          error: `Price drift ${priceDriftPct.toFixed(1)}% exceeds 15%. Use mark_offer_rejected_auto.`,
          fingerprint,
          priceDriftPct,
        },
        { status: 422 },
      );
    }
  }

  const expiresAt = new Date(
    Date.now() + (data.expiresInHours ?? 24) * 60 * 60 * 1000,
  );

  const offer = await prisma.offer.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      searchRequestId: data.requestId,
      source: data.source,
      hotelName: data.hotelName,
      hotelId: data.hotelId ?? null,
      country: data.country,
      resort: data.resort ?? null,
      deepLink: data.deepLink,
      fromCity: data.fromCity,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      nights: data.nights,
      adults: data.adults,
      childrenAges: data.childrenAges,
      listingPriceRub: data.listingPriceRub ?? null,
      pagePriceRub: data.pagePriceRub,
      priceDriftPct,
      hasFlight: data.hasFlight,
      seaNote: data.seaNote ?? null,
      hotBadge: data.hotBadge ?? null,
      visaOk: data.visaOk,
      autoLevel: data.autoLevel,
      autoNotes: data.autoNotes ?? null,
      status: "pending_human",
      expiresAt,
    },
    update: {
      searchRequestId: data.requestId ?? undefined,
      deepLink: data.deepLink,
      listingPriceRub: data.listingPriceRub ?? null,
      pagePriceRub: data.pagePriceRub,
      priceDriftPct,
      hasFlight: data.hasFlight,
      seaNote: data.seaNote ?? null,
      hotBadge: data.hotBadge ?? null,
      autoLevel: data.autoLevel,
      autoNotes: data.autoNotes ?? null,
      status: "pending_human",
      rejectReason: null,
      expiresAt,
    },
  });

  return NextResponse.json({ ok: true, offerId: offer.id, fingerprint, status: offer.status });
}
