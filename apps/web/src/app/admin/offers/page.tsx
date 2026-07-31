import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/db";
import { OfferActions } from "./offer-actions";

export default async function AdminOffersPage() {
  await requireAdmin();
  const offers = await prisma.offer.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="page">
      <ResortBackdrop />
      <main className="shell">
        <SiteHeader
          actions={
            <>
              <Link href="/" className="nav-link">
                Главная
              </Link>
              <Link href="/admin/system" className="nav-link">
                Система
              </Link>
            </>
          }
        />
        <section className="hero-page">
          <h1>Офферы</h1>
          <p>Подтвердите или отклоните кандидатов агента.</p>
        </section>
        <section className="section">
          <table className="data">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Отель</th>
                <th>Вылет / даты</th>
                <th>Цена</th>
                <th>Авто</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.status}</td>
                  <td>
                    <a href={o.deepLink} target="_blank" rel="noreferrer">
                      {o.hotelName}
                    </a>
                    <div className="muted">
                      {o.source} · {o.country}
                    </div>
                  </td>
                  <td>
                    {o.fromCity}
                    <div className="muted">
                      {o.startDate.toISOString().slice(0, 10)} · {o.nights}н · {o.adults}+
                      {o.childrenAges || "0"}
                    </div>
                  </td>
                  <td>
                    {o.pagePriceRub?.toLocaleString("ru-RU")} ₽
                    {o.priceDriftPct != null ? (
                      <div className="muted">drift {o.priceDriftPct.toFixed(1)}%</div>
                    ) : null}
                  </td>
                  <td>
                    {o.autoLevel}
                    {o.rejectReason ? <div className="muted">{o.rejectReason}</div> : null}
                  </td>
                  <td>
                    {o.status === "pending_human" ? <OfferActions offerId={o.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
