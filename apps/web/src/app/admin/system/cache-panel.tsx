"use client";

import { useCallback, useEffect, useState } from "react";

type CountRow = { key: string; count: number };
type ReasonRow = { reason: string; count: number };

type Stats = {
  note: string;
  offers: {
    total: number;
    rejected: number;
    verified: number;
    pending: number;
    byStatus: CountRow[];
    bySource: CountRow[];
    rejectedBySource: CountRow[];
    topRejectReasons: ReasonRow[];
  };
  jobs: {
    byStatus: CountRow[];
    recent: Array<{
      id: string;
      status: string;
      error: string | null;
      createdAt: string;
      finishedAt: string | null;
      fromCity: string | null;
      countries: string | null;
      requestStatus: string | null;
    }>;
  };
  searches: { byStatus: CountRow[] };
  recentRejected: Array<{
    id: string;
    source: string;
    hotelName: string;
    fromCity: string;
    country: string;
    rejectReason: string | null;
    deepLink: string;
    updatedAt: string;
  }>;
};

type Scope = "rejected" | "pending" | "non_verified" | "all_offers";

function rows(list: CountRow[]) {
  if (!list.length) return <p className="muted">Пусто</p>;
  return (
    <ul className="stat-rows">
      {list.map((r) => (
        <li key={r.key}>
          <span>{r.key}</span>
          <strong>{r.count}</strong>
        </li>
      ))}
    </ul>
  );
}

export function CachePanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Scope | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/offers/stats", { cache: "no-store" });
      const json = (await res.json()) as Stats & { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(json.error || `Ошибка ${res.status}`);
        return;
      }
      setError(null);
      setStats(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить статистику");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function reset(scope: Scope, label: string) {
    const confirmText =
      scope === "all_offers"
        ? "Удалить ВСЕ офферы (включая verified)?"
        : scope === "non_verified"
          ? "Удалить все не-verified офферы (rejected + pending + candidate)?"
          : `Сбросить: ${label}?`;
    if (!window.confirm(confirmText)) return;
    setBusy(scope);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/offers/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) {
        setMessage(json.error || `Ошибка ${res.status}`);
      } else {
        setMessage(`Удалено записей: ${json.deleted ?? 0} (${label})`);
        await refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Сброс не удался");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="cache-panel">
        <p className="muted">{error}</p>
        <button type="button" className="btn" onClick={() => void refresh()}>
          Обновить
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="cache-panel">
        <p className="muted">Загрузка статистики…</p>
      </div>
    );
  }

  return (
    <div className="cache-panel">
      <p className="section-lead">{stats.note}</p>

      <div className="stat-grid">
        <div>
          <h3>Офферы</h3>
          <p className="muted">
            всего {stats.offers.total} · rejected {stats.offers.rejected} · pending{" "}
            {stats.offers.pending} · verified {stats.offers.verified}
          </p>
          {rows(stats.offers.byStatus)}
        </div>
        <div>
          <h3>По источникам</h3>
          {rows(stats.offers.bySource)}
        </div>
        <div>
          <h3>Rejected по источникам</h3>
          {rows(stats.offers.rejectedBySource)}
        </div>
        <div>
          <h3>Jobs</h3>
          {rows(stats.jobs.byStatus)}
        </div>
      </div>

      <div className="stat-block">
        <h3>Топ причин отклонения (fingerprint blacklist)</h3>
        {stats.offers.topRejectReasons.length === 0 ? (
          <p className="muted">Отклонённых ещё нет.</p>
        ) : (
          <ul className="stat-rows">
            {stats.offers.topRejectReasons.map((r) => (
              <li key={r.reason}>
                <span title={r.reason}>{r.reason}</span>
                <strong>{r.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stat-block">
        <h3>Последние rejected</h3>
        {stats.recentRejected.length === 0 ? (
          <p className="muted">Пусто</p>
        ) : (
          <ul className="reject-list">
            {stats.recentRejected.map((o) => (
              <li key={o.id}>
                <strong>
                  {o.source} · {o.hotelName}
                </strong>
                <span className="muted">
                  {o.fromCity} → {o.country}
                </span>
                <span>{o.rejectReason || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="stat-block">
        <h3>Сброс кэша / «чёрного списка»</h3>
        <p className="muted">
          Сброс rejected снимает запрет на повторную подачу тех же fingerprint. Логи jobs не
          трогаем.
        </p>
        <div className="job-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || stats.offers.rejected === 0}
            onClick={() => void reset("rejected", "только rejected")}
          >
            {busy === "rejected" ? "…" : `Сбросить rejected (${stats.offers.rejected})`}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || stats.offers.pending === 0}
            onClick={() => void reset("pending", "pending_human")}
          >
            {busy === "pending" ? "…" : `Сбросить pending (${stats.offers.pending})`}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void reset("non_verified", "все кроме verified")}
          >
            {busy === "non_verified" ? "…" : "Сбросить всё кроме verified"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== null || stats.offers.total === 0}
            onClick={() => void reset("all_offers", "все офферы")}
          >
            {busy === "all_offers" ? "…" : "Удалить все офферы"}
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void refresh()}>
            Обновить
          </button>
        </div>
        {message ? <p className="muted">{message}</p> : null}
      </div>
    </div>
  );
}
