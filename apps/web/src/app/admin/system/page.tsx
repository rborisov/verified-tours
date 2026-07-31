import Link from "next/link";

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
    <main className="shell">
      <SiteHeader
        actions={
          <>
            <Link href="/" className="nav-link">
              Home
            </Link>
            <Link href="/admin/offers" className="nav-link">
              Offers
            </Link>
          </>
        }
      />
      <section className="hero">
        <h1>System</h1>
        <p>Disk and storage for this host install. Alerts are sent by the worker.</p>
      </section>
      <section className="panel">
        <ul>
          <li>
            Disk:{" "}
            {metrics.disk
              ? `${metrics.disk.usedPct.toFixed(1)}% used · free ${fmtBytes(metrics.disk.free)}`
              : "n/a"}
          </li>
          <li>Database: {fmtBytes(metrics.storage.databaseBytes)}</li>
          <li>Workspace: {fmtBytes(metrics.storage.workspaceBytes)}</li>
          <li>Data dir: {fmtBytes(metrics.storage.dataBytes)}</li>
          <li>
            Offers: {metrics.counts.offers} total · {metrics.counts.pending} pending ·{" "}
            {metrics.counts.verified} verified
          </li>
          <li>Running jobs: {metrics.counts.jobsRunning}</li>
          <li>CURSOR_API_KEY: {metrics.apiKeyConfigured ? "configured" : "missing"}</li>
        </ul>
      </section>
    </main>
  );
}
