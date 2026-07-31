import Link from "next/link";

import { SiteHeader } from "@/app/site-header";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  return (
    <main className="shell">
      <SiteHeader
        actions={
          <>
            {session?.user?.isAdmin ? (
              <>
                <Link href="/admin/offers" className="nav-link">
                  Admin
                </Link>
                <Link href="/admin/system" className="nav-link">
                  System
                </Link>
              </>
            ) : (
              <Link href="/auth/signin" className="nav-link">
                Sign in
              </Link>
            )}
          </>
        }
      />

      <section className="hero">
        <h1>Verified tours</h1>
        <p>
          Agent searches packages on demand; final confirmation is human. Cached
          verified offers feed the next search.
        </p>
      </section>

      {session?.user?.isAdmin ? (
        <section className="panel">
          <h2>New search</h2>
          <SearchForm />
        </section>
      ) : (
        <section className="panel">
          <p>
            Sign in with an allowlisted admin email to run a search.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>Verified offers</h2>
        {verified.length === 0 ? (
          <p className="muted">No verified offers yet.</p>
        ) : (
          <ul className="offer-list">
            {verified.map((o) => (
              <li key={o.id}>
                <a href={o.deepLink} target="_blank" rel="noreferrer">
                  {o.hotelName}
                </a>
                <span className="muted">
                  {" "}
                  · {o.fromCity} · {o.startDate.toISOString().slice(0, 10)} ·{" "}
                  {o.nights}n · {o.pagePriceRub?.toLocaleString("ru-RU")} ₽
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
