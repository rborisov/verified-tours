import Link from "next/link";

import { JobMonitor } from "@/app/job-monitor";
import { ResortBackdrop } from "@/app/resort-backdrop";
import { SiteHeader } from "@/app/site-header";
import { requireAdmin } from "@/lib/require-admin";
import { collectSystemMetrics } from "@/lib/system-metrics";
import { prisma } from "@/lib/db";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

export default async function AdminSystemPage() {
  await requireAdmin();
  const [metrics, recentJobs] = await Promise.all([
    collectSystemMetrics(),
    prisma.agentJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { request: true },
    }),
  ]);

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
          <p>Диск, jobs и хранилище. Алерты шлёт worker.</p>
        </section>

        <section className="section">
          <h2>Сейчас</h2>
          <JobMonitor />
        </section>

        <section className="section">
          <h2>Ресурсы</h2>
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
              Офферы: {metrics.counts.offers} · ждут проверки {metrics.counts.pending} ·
              verified {metrics.counts.verified}
            </li>
            <li>
              Активных поисков: {metrics.counts.jobsActive} (running{" "}
              {metrics.counts.jobsRunning}, queued {metrics.counts.jobsQueued})
              {metrics.counts.jobsActive > 0
                ? " — да, job ещё в работе или завис; смотрите блок «Сейчас»."
                : " — сейчас агент не ищет."}
            </li>
            <li>CURSOR_API_KEY: {metrics.apiKeyConfigured ? "есть" : "нет"}</li>
          </ul>
        </section>

        <section className="section">
          <h2>Последние jobs</h2>
          {recentJobs.length === 0 ? (
            <p className="muted">Пока не было запусков.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Когда</th>
                  <th>Запрос</th>
                  <th>Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.status}</td>
                    <td className="muted">
                      {j.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td>
                      {j.request
                        ? `${j.request.fromCity} → ${j.request.countries}`
                        : j.id}
                    </td>
                    <td className="muted">{j.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
