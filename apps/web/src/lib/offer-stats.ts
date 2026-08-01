import { prisma } from "@/lib/db";

function countBy(rows: { key: string; _count: { _all: number } }[]) {
  return rows
    .map((r) => ({ key: r.key || "(пусто)", count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export async function collectOfferSessionStats() {
  const [
    byStatus,
    bySource,
    rejectedBySource,
    rejectReasonsRaw,
    jobsByStatus,
    searchByStatus,
    recentRejected,
    recentJobs,
  ] = await Promise.all([
    prisma.offer.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.offer.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
    prisma.offer.groupBy({
      by: ["source"],
      where: { status: "rejected" },
      _count: { _all: true },
    }),
    prisma.offer.groupBy({
      by: ["rejectReason"],
      where: { status: "rejected" },
      _count: { _all: true },
    }),
    prisma.agentJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.searchRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.offer.findMany({
      where: { status: "rejected" },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        source: true,
        hotelName: true,
        fromCity: true,
        country: true,
        rejectReason: true,
        deepLink: true,
        updatedAt: true,
      },
    }),
    prisma.agentJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        error: true,
        createdAt: true,
        finishedAt: true,
        request: {
          select: {
            fromCity: true,
            countries: true,
            status: true,
          },
        },
      },
    }),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  const rejectedCount = statusMap.rejected ?? 0;
  const verifiedCount = statusMap.verified ?? 0;
  const pendingCount = statusMap.pending_human ?? 0;

  const rejectReasons = rejectReasonsRaw
    .map((r) => ({
      reason: (r.rejectReason || "(без причины)").slice(0, 160),
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    note:
      "Чёрный список сайтов нет: агент избегает только отклонённые fingerprint (отель+город+даты+ночи+состав). Домены Level.Travel / Travelata / Onlinetours не блокируются.",
    offers: {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      byStatus: countBy(byStatus.map((r) => ({ key: r.status, _count: r._count }))),
      rejected: rejectedCount,
      verified: verifiedCount,
      pending: pendingCount,
      bySource: countBy(bySource.map((r) => ({ key: r.source, _count: r._count }))),
      rejectedBySource: countBy(
        rejectedBySource.map((r) => ({ key: r.source, _count: r._count })),
      ),
      topRejectReasons: rejectReasons,
    },
    jobs: {
      byStatus: countBy(jobsByStatus.map((r) => ({ key: r.status, _count: r._count }))),
      recent: recentJobs.map((j) => ({
        id: j.id,
        status: j.status,
        error: j.error,
        createdAt: j.createdAt.toISOString(),
        finishedAt: j.finishedAt?.toISOString() ?? null,
        fromCity: j.request?.fromCity ?? null,
        countries: j.request?.countries ?? null,
        requestStatus: j.request?.status ?? null,
      })),
    },
    searches: {
      byStatus: countBy(searchByStatus.map((r) => ({ key: r.status, _count: r._count }))),
    },
    recentRejected: recentRejected.map((o) => ({
      id: o.id,
      source: o.source,
      hotelName: o.hotelName,
      fromCity: o.fromCity,
      country: o.country,
      rejectReason: o.rejectReason,
      deepLink: o.deepLink,
      updatedAt: o.updatedAt.toISOString(),
    })),
  };
}

export type ResetScope = "rejected" | "pending" | "non_verified" | "all_offers";

export async function resetOfferCache(scope: ResetScope) {
  const where =
    scope === "rejected"
      ? { status: "rejected" }
      : scope === "pending"
        ? { status: "pending_human" }
        : scope === "non_verified"
          ? { status: { in: ["rejected", "pending_human", "candidate", "expired"] } }
          : {}; // all_offers

  const result = await prisma.offer.deleteMany({ where });
  return { deleted: result.count, scope };
}
