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

type JobView = {
  id: string;
  status: string;
  error: string | null;
  pid: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt?: string | null;
  request: JobRequest | null;
  pendingForRequest?: number;
  logTail?: string | null;
  prompt?: string | null;
  hasPrompt?: boolean;
  hasLog?: boolean;
  live?: boolean;
};

type RecentJob = {
  id: string;
  status: string;
  createdAt: string;
  error: string | null;
  request: JobRequest | null;
  hasPrompt: boolean;
  hasLog: boolean;
};

type Payload = {
  ok: boolean;
  active: JobView | null;
  focus: JobView | null;
  pendingOffers: number;
  recent: RecentJob[];
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

function progressPercent(job: JobView, now: number): number {
  if (job.status === "awaiting_human" || job.status === "done") return 100;
  if (job.status === "failed") return 100;
  if (job.status === "queued") return 8;
  const started = Date.parse(job.startedAt || job.createdAt);
  const mins = Math.max(0, (now - started) / 60_000);
  return Math.min(88, 18 + mins * 10);
}

function setPageSearching(on: boolean) {
  const page = document.querySelector(".page");
  if (!page) return;
  page.classList.toggle("is-searching", on);
}

function shortWhen(iso: string) {
  return iso.replace("T", " ").slice(0, 16);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async (jobId: string | null = selectedId) => {
    try {
      const qs = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const res = await fetch(`/api/admin/jobs${qs}`, { cache: "no-store" });
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
  }, [selectedId]);

  useEffect(() => {
    void refresh(selectedId);
    const id = window.setInterval(() => void refresh(selectedId), 4000);
    const onStarted = () => {
      setSelectedId(null);
      void refresh(null);
    };
    window.addEventListener(JOB_STARTED_EVENT, onStarted);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(JOB_STARTED_EVENT, onStarted);
    };
  }, [refresh, selectedId]);

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
            {" · "}
            <Link href="/admin/system">лог / промпт</Link>
          </p>
        );
      }
      if (data?.focus) {
        return (
          <p className="search-pulse-idle" id="job-status">
            Последний поиск: {statusLabel(data.focus.status)}
            {" · "}
            <Link href="/admin/system">лог / промпт</Link>
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

  const focus = data.focus;
  const recent = data.recent ?? [];

  if (!focus) {
    return (
      <div className="job-monitor job-monitor-idle">
        <strong>Статус поиска</strong>
        <p>Пока не было запусков.</p>
      </div>
    );
  }

  const req = focus.request;
  const live = Boolean(focus.live);

  return (
    <div
      className={`job-monitor ${live ? "job-monitor-active" : "job-monitor-idle"}`}
      id="job-status"
    >
      <div className="job-monitor-head">
        <strong>{live ? "Идёт поиск" : "Последний поиск"}</strong>
        <span className="job-pill">{statusLabel(focus.status)}</span>
      </div>
      <ul className="job-meta">
        <li>
          Job: <code>{focus.id}</code>
          {focus.pid && live ? ` · pid ${focus.pid}` : null}
          {" · "}
          {shortWhen(focus.createdAt)}
        </li>
        {req ? (
          <li>
            {req.fromCity} → {req.countries} · {req.departFrom}…{req.departTo} ·{" "}
            {req.adults} взр.
            {req.childrenAges ? ` + дети ${req.childrenAges}` : ""}
          </li>
        ) : null}
        <li>Кандидатов: {focus.pendingForRequest ?? 0}</li>
        {focus.error ? <li className="muted">{focus.error}</li> : null}
      </ul>

      {recent.length > 1 ? (
        <div className="job-recent">
          <p className="muted job-recent-label">Недавние jobs — выберите, чтобы открыть лог/промпт:</p>
          <ul className="job-recent-list">
            {recent.map((job) => {
              const selected = job.id === focus.id;
              return (
                <li key={job.id}>
                  <button
                    type="button"
                    className={`job-recent-btn${selected ? " is-selected" : ""}`}
                    onClick={() => setSelectedId(job.id)}
                  >
                    <span>{statusLabel(job.status)}</span>
                    <span className="muted">{shortWhen(job.createdAt)}</span>
                    <span className="muted">
                      {job.request
                        ? `${job.request.fromCity} → ${job.request.countries}`
                        : job.id.slice(0, 8)}
                    </span>
                    <span className="muted">
                      {[job.hasPrompt ? "промпт" : null, job.hasLog ? "лог" : null]
                        .filter(Boolean)
                        .join(" · ") || "нет файлов"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {focus.prompt ? (
        <details className="job-log" open={!live}>
          <summary>Промпт агента</summary>
          <pre>{focus.prompt}</pre>
        </details>
      ) : (
        <p className="muted">Промпт недоступен для этого job.</p>
      )}
      {focus.logTail ? (
        <details className="job-log" open>
          <summary>Лог агента{live ? " (обновляется)" : ""}</summary>
          <pre>{focus.logTail}</pre>
        </details>
      ) : (
        <p className="muted">
          {live ? "Лог ещё не появился." : "Лог не найден (файл удалён при очистке диска?)."}
        </p>
      )}
      <div className="job-actions">
        {live ? (
          <button
            type="button"
            className="btn"
            disabled={busyCancel}
            onClick={() => void cancelJob(focus.id)}
          >
            {busyCancel ? "Отмена…" : "Отменить поиск"}
          </button>
        ) : null}
        <Link className="btn" href="/admin/offers">
          Офферы
        </Link>
        {data.pendingOffers > 0 ? (
          <span className="muted">ждут проверки: {data.pendingOffers}</span>
        ) : null}
      </div>
    </div>
  );
}
