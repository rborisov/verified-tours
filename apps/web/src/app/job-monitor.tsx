"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type JobRequest = {
  id: string;
  status: string;
  fromCity: string;
  countries: string;
  adults: number;
  childrenAges: string;
  departFrom: string;
  departTo: string;
};

type ActiveJob = {
  id: string;
  status: string;
  error: string | null;
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  request: JobRequest | null;
  pendingForRequest?: number;
  logTail?: string | null;
};

type Payload = {
  ok: boolean;
  active: ActiveJob | null;
  pendingOffers: number;
};

const STATUS_RU: Record<string, string> = {
  queued: "в очереди",
  running: "агент ищет",
  awaiting_human: "ждёт вашей проверки",
  done: "готово",
  failed: "ошибка",
};

function statusLabel(status: string) {
  return STATUS_RU[status] || status;
}

export function JobMonitor({
  initialActive = false,
}: {
  initialActive?: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs", { cache: "no-store" });
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) {
        setError(json.error || `Ошибка ${res.status}`);
        return;
      }
      setError(null);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить статус");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function cancelJob(jobId: string) {
    if (!window.confirm("Отменить текущий поиск?")) return;
    setBusyCancel(true);
    await fetch("/api/admin/jobs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, action: "cancel" }),
    });
    setBusyCancel(false);
    await refresh();
  }

  const active = data?.active;
  const showIdle = !active && !initialActive && data;

  if (error) {
    return (
      <div className="job-monitor job-monitor-error">
        <strong>Статус поиска</strong>
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="job-monitor">
        <strong>Статус поиска</strong>
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  if (!active) {
    return (
      <div className={`job-monitor ${showIdle ? "job-monitor-idle" : ""}`}>
        <strong>Статус поиска</strong>
        <p>
          Сейчас ничего не ищется.
          {data.pendingOffers > 0 ? (
            <>
              {" "}
              Есть кандидаты на проверку:{" "}
              <Link href="/admin/offers">{data.pendingOffers}</Link>.
            </>
          ) : (
            " Запустите форму ниже."
          )}
        </p>
      </div>
    );
  }

  const req = active.request;

  return (
    <div className="job-monitor job-monitor-active" id="job-status">
      <div className="job-monitor-head">
        <strong>Идёт поиск</strong>
        <span className="job-pill">{statusLabel(active.status)}</span>
      </div>
      <p>
        Агент Cursor сейчас ищет туры и будет писать кандидатов в «Офферы». Это может
        занять несколько минут. Пока задача активна, новый поиск не стартует.
      </p>
      <ul className="job-meta">
        <li>
          Job: <code>{active.id}</code>
          {active.pid ? ` · pid ${active.pid}` : null}
        </li>
        {req ? (
          <li>
            {req.fromCity} → {req.countries} · {req.departFrom}…{req.departTo} ·{" "}
            {req.adults} взр.
            {req.childrenAges ? ` + дети ${req.childrenAges}` : ""}
          </li>
        ) : null}
        <li>
          Кандидатов по этому запросу: {active.pendingForRequest ?? 0}
          {data.pendingOffers > 0 ? (
            <>
              {" "}
              · всего pending: <Link href="/admin/offers">{data.pendingOffers}</Link>
            </>
          ) : null}
        </li>
      </ul>
      {active.logTail ? (
        <details className="job-log">
          <summary>Лог агента (хвост)</summary>
          <pre>{active.logTail}</pre>
        </details>
      ) : (
        <p className="muted">Лог ещё не появился — агент только стартует или не пишет файл.</p>
      )}
      <div className="job-actions">
        <button
          type="button"
          className="btn"
          disabled={busyCancel}
          onClick={() => void cancelJob(active.id)}
        >
          {busyCancel ? "Отмена…" : "Отменить поиск"}
        </button>
        <Link className="btn" href="/admin/offers">
          Открыть офферы
        </Link>
      </div>
    </div>
  );
}
