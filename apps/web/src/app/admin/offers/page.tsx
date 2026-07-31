import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/db";
import { OfferActions } from "./offer-actions";

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? `${u.pathname.slice(0, 40)}…` : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url.slice(0, 60);
  }
}

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
          <p>
            Откройте ссылку на тур, сверьте город/даты/цену на странице, затем подтвердите или
            отклоните.
          </p>
        </section>
        <section className="section">
          {offers.length === 0 ? (
            <p className="muted">Пока нет кандидатов.</p>
          ) : (
            <ul className="offer-review">
              {offers.map((o) => (
                <li key={o.id} className="offer-review-item">
                  <div className="offer-review-main">
                    <div className="offer-review-title">
                      <span className={`offer-status offer-status-${o.status}`}>{o.status}</span>
                      <strong>{o.hotelName}</strong>
                    </div>
                    <p className="muted">
                      {o.source} · {o.country}
                      {o.resort ? ` · ${o.resort}` : ""} · {o.fromCity} ·{" "}
                      {o.startDate.toISOString().slice(0, 10)} · {o.nights}н · {o.adults}+
                      {o.childrenAges || "0"}
                    </p>
                    <p>
                      Страница:{" "}
                      <strong>{o.pagePriceRub?.toLocaleString("ru-RU") ?? "—"} ₽</strong>
                      {o.listingPriceRub != null ? (
                        <span className="muted">
                          {" "}
                          · листинг {o.listingPriceRub.toLocaleString("ru-RU")} ₽
                        </span>
                      ) : null}
                      {o.priceDriftPct != null ? (
                        <span className="muted"> · drift {o.priceDriftPct.toFixed(1)}%</span>
                      ) : null}
                      {o.autoLevel ? <span className="muted"> · {o.autoLevel}</span> : null}
                    </p>
                    {o.autoNotes ? <p className="muted">{o.autoNotes}</p> : null}
                    {o.rejectReason ? (
                      <p className="muted">Причина: {o.rejectReason}</p>
                    ) : null}
                    <p className="offer-link-line">
                      <a href={o.deepLink} target="_blank" rel="noreferrer" className="offer-deep-link">
                        {shortUrl(o.deepLink)}
                      </a>
                    </p>
                  </div>
                  <div className="row-actions">
                    <a
                      className="btn btn-primary"
                      href={o.deepLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть тур
                    </a>
                    {o.status === "pending_human" ? <OfferActions offerId={o.id} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
