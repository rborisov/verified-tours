import Link from "next/link";

import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { requireAdmin } from "@/lib/require-admin";
import { collectSystemMetrics } from "@/lib/system-metrics";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export default async function AdminSystemPage() {
  await requireAdmin();
  const metrics = await collectSystemMetrics();

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
              <Link href="/admin/offers" className="nav-link">
                Офферы
              </Link>
            </>
          }
        />
        <section className="hero-page">
          <h1>Система</h1>
          <p>Диск и хранилище на этом хосте. Алерты шлёт worker.</p>
        </section>
        <section className="section">
          <ul style={{ listStyle: "none", display: "grid", gap: "0.55rem" }}>
            <li>
              Диск:{" "}
              {metrics.disk
                ? `${metrics.disk.usedPct.toFixed(1)}% занято · свободно ${fmtBytes(metrics.disk.free)}`
                : "н/д"}
            </li>
            <li>База: {fmtBytes(metrics.storage.databaseBytes)}</li>
            <li>Workspace: {fmtBytes(metrics.storage.workspaceBytes)}</li>
            <li>Data: {fmtBytes(metrics.storage.dataBytes)}</li>
            <li>
              Офферы: {metrics.counts.offers} · pending {metrics.counts.pending} · verified{" "}
              {metrics.counts.verified}
            </li>
            <li>Jobs: {metrics.counts.jobsRunning}</li>
            <li>CURSOR_API_KEY: {metrics.apiKeyConfigured ? "есть" : "нет"}</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
