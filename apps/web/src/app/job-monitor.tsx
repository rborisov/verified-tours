"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { JOB_STARTED_EVENT } from "./search-events";

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
  prompt?: string | null;
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

function progressPercent(job: ActiveJob, now: number): number {
  if (job.status === "awaiting_human" || job.status === "done") return 100;
  if (job.status === "failed") return 100;
  if (job.status === "queued") return 8;
  const started = Date.parse(job.startedAt || job.createdAt);
  const mins = Math.max(0, (now - started) / 60_000);
  // Asymptote toward ~88% while running — real completion is awaiting_human.
  return Math.min(88, 18 + mins * 10);
}

function setPageSearching(on: boolean) {
  const page = document.querySelector(".page");
  if (!page) return;
  page.classList.toggle("is-searching", on);
}

export function JobMonitor({
  initialActive = false,
  variant = "full",
}: {
  initialActive?: boolean;
  /** compact = home progress; full = system log + details */
  variant?: "compact" | "full";
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
    const onStarted = () => void refresh();
    window.addEventListener(JOB_STARTED_EVENT, onStarted);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(JOB_STARTED_EVENT, onStarted);
    };
  }, [refresh]);

  useEffect(() => {
    const searching =
      data?.active?.status === "queued" || data?.active?.status === "running";
    setPageSearching(Boolean(searching || (initialActive && !data)));
    return () => setPageSearching(false);
  }, [data, initialActive]);

  useEffect(() => {
    if (variant !== "compact") return;
    if (!data?.active || data.active.status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, [variant, data?.active]);

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

  if (variant === "compact") {
    if (error) {
      return (
        <div className="search-pulse search-pulse-error" id="job-status">
          <p>{error}</p>
        </div>
      );
    }

    if (!active) {
      if (data && data.pendingOffers > 0) {
        return (
          <p className="search-pulse-idle" id="job-status">
            Есть кандидаты:{" "}
            <Link href="/admin/offers">{data.pendingOffers} на проверку</Link>
          </p>
        );
      }
      return null;
    }

    const pct = progressPercent(active, now);
    const label =
      active.status === "awaiting_human"
        ? "Готово — проверьте офферы"
        : active.status === "queued"
          ? "Очередь…"
          : "Ищем туры…";

    return (
      <div className="search-pulse" id="job-status">
        <div className="search-pulse-track" aria-hidden="true">
          <div
            className={`search-pulse-fill${active.status === "running" ? " search-pulse-fill-live" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="search-pulse-row">
          <span>{label}</span>
          <div className="search-pulse-actions">
            {active.status === "awaiting_human" ? (
              <Link className="btn btn-primary" href="/admin/offers">
                Офферы
              </Link>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busyCancel}
                onClick={() => void cancelJob(active.id)}
              >
                {busyCancel ? "…" : "Стоп"}
              </button>
            )}
            <Link className="nav-link" href="/admin/system">
              Лог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* —— full (Система) —— */
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
      <div className="job-monitor job-monitor-idle">
        <strong>Статус поиска</strong>
        <p>
          Сейчас ничего не ищется.
          {data.pendingOffers > 0 ? (
            <>
              {" "}
              Есть кандидаты: <Link href="/admin/offers">{data.pendingOffers}</Link>.
            </>
          ) : null}
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
        <li>Кандидатов: {active.pendingForRequest ?? 0}</li>
        {active.error ? <li className="muted">{active.error}</li> : null}
      </ul>
      {active.prompt ? (
        <details className="job-log" open>
          <summary>Промпт агента</summary>
          <pre>{active.prompt}</pre>
        </details>
      ) : null}
      {active.logTail ? (
        <details className="job-log" open>
          <summary>Лог агента</summary>
          <pre>{active.logTail}</pre>
        </details>
      ) : (
        <p className="muted">Лог ещё не появился.</p>
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
          Офферы
        </Link>
      </div>
    </div>
  );
}
