import Link from "next/link";

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
    <main className="shell">
      <SiteHeader
        actions={
          <>
            <Link href="/" className="nav-link">
              Home
            </Link>
            <Link href="/admin/system" className="nav-link">
              System
            </Link>
          </>
        }
      />
      <section className="hero">
        <h1>Offers</h1>
        <p>Confirm or reject agent candidates. Verified rows feed the next search.</p>
      </section>
      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Status</th>
              <th>Hotel</th>
              <th>From / dates</th>
              <th>Price</th>
              <th>Auto</th>
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
                  <div className="muted">{o.source} · {o.country}</div>
                </td>
                <td>
                  {o.fromCity}
                  <div className="muted">
                    {o.startDate.toISOString().slice(0, 10)} · {o.nights}n · {o.adults}+
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
                  {o.rejectReason ? (
                    <div className="muted">{o.rejectReason}</div>
                  ) : null}
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
  );
}
