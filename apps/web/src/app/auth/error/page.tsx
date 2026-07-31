import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Этот аккаунт не в allowlist или без прав админа.",
  Configuration: "Ошибка настройки входа. Свяжитесь с оператором.",
  Verification: "Ссылка входа недействительна или устарела.",
  Default: "Не удалось войти. Попробуйте ещё раз.",
};

type AuthErrorPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const { error } = await searchParams;
  const message = (error && ERROR_MESSAGES[error]) ?? ERROR_MESSAGES.Default;

  return (
    <div className="page">
      <ResortBackdrop />
      <main className="shell">
        <SiteHeader
          actions={
            <Link href="/auth/signin" className="nav-link">
              Войти
            </Link>
          }
        />
        <section className="hero-page">
          <h1>Ошибка входа</h1>
          <p>{message}</p>
          {error ? <p className="muted">Код: {error}</p> : null}
        </section>
        <Link className="btn btn-primary" href="/auth/signin">
          Попробовать снова
        </Link>
      </main>
    </div>
  );
}
