import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { signIn } from "@/lib/auth";

type SignInPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl = "/admin/offers" } = await searchParams;

  return (
    <div className="page">
      <ResortBackdrop />
      <main className="shell">
        <SiteHeader
          actions={
            <Link href="/" className="nav-link">
              На главную
            </Link>
          }
        />

        <section className="hero-page">
          <h1>Вход</h1>
          <p>Админка только для email из allowlist.</p>
        </section>

        <section className="section" style={{ maxWidth: "24rem" }}>
          <h2>Продолжить</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: callbackUrl });
              }}
            >
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                Google
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await signIn("yandex", { redirectTo: callbackUrl });
              }}
            >
              <button type="submit" className="btn" style={{ width: "100%" }}>
                Яндекс
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
