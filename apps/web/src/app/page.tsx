import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { JobMonitor } from "./job-monitor";
import { SearchForm } from "./search-form";

export default async function HomePage() {
  const session = await auth();
  const verified = await prisma.offer.findMany({
    where: {
      status: "verified",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { verifiedAt: "desc" },
    take: 10,
  });
  const activeJob = session?.user?.isAdmin
    ? await prisma.agentJob.findFirst({
        where: { status: { in: ["queued", "running", "awaiting_human"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      })
    : null;

  return (
    <div className="page">
      <ResortBackdrop />
      <main className="shell">
        <SiteHeader
          actions={
            <>
              {session?.user?.isAdmin ? (
                <>
                  <Link href="/admin/offers" className="nav-link">
                    Офферы
                  </Link>
                  <Link href="/admin/system" className="nav-link">
                    Система
                  </Link>
                </>
              ) : (
                <Link href="/auth/signin" className="nav-link">
                  Войти
                </Link>
              )}
            </>
          }
        />

        <section className="hero-stage">
          <p className="hero-brand">
            NoFake<span className="hero-brand-tail">Tours</span>
          </p>
          <blockquote className="hero-lead">
            <p>Зорко одно лишь сердце. Самого главного глазами не увидишь.</p>
            <cite>— Антуан де Сент-Экзюпери</cite>
          </blockquote>
          <div className="hero-cta">
            {session?.user?.isAdmin ? (
              <a className="btn btn-primary" href="#search">
                Найти тур
              </a>
            ) : (
              <Link className="btn btn-primary" href="/auth/signin">
                Войти
              </Link>
            )}
            <a className="btn" href="#offers">
              Проверенные
            </a>
          </div>
        </section>

        {session?.user?.isAdmin ? (
          <section className="section" id="search">
            <h2>Новый поиск</h2>
            <p className="section-lead">
              Агент ищет bookable-офферы; вы подтверждаете по ссылке. Кэш питает следующие
              поиски.
            </p>
            <JobMonitor variant="compact" initialActive={Boolean(activeJob)} />
            <SearchForm disabled={Boolean(activeJob)} />
          </section>
        ) : (
          <section className="section" id="search">
            <h2>Доступ</h2>
            <p className="section-lead">
              Войдите с allowlist-email, чтобы запустить поиск.
            </p>
            <Link className="btn btn-primary" href="/auth/signin">
              Войти
            </Link>
          </section>
        )}

        <section className="section" id="offers">
          <h2>Проверенные офферы</h2>
          <p className="section-lead">Подтверждены человеком, ещё в сроке годности.</p>
          {verified.length === 0 ? (
            <p className="muted">Пока пусто — запустите поиск и подтвердите кандидатов.</p>
          ) : (
            <ul className="offer-list">
              {verified.map((o) => (
                <li key={o.id}>
                  <a href={o.deepLink} target="_blank" rel="noreferrer">
                    {o.hotelName}
                  </a>
                  <span className="muted">
                    {o.fromCity} · {o.startDate.toISOString().slice(0, 10)} · {o.nights}{" "}
                    ноч. · {o.pagePriceRub?.toLocaleString("ru-RU")} ₽
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
