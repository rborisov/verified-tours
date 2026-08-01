"use client";

import { useEffect, useState } from "react";

import { JOB_STARTED_EVENT } from "./search-events";

const STORAGE_KEY = "nofaketours.searchDraft";

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function plusDaysISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

type SearchDraft = {
  fromCity: string;
  countries: string;
  adults: number;
  childrenAges: string;
  departFrom: string;
  departTo: string;
  nightsMin: number;
  nightsMax: number;
  seaRequired: boolean;
  visaFreeOnly: boolean;
  preferHot: boolean;
  rawBrief: string;
};

function defaultDraft(): SearchDraft {
  return {
    fromCity: "Нижний Новгород",
    countries: "Турция, Марокко, Черногория",
    adults: 2,
    childrenAges: "11,14",
    departFrom: tomorrowISO(),
    departTo: plusDaysISO(14),
    nightsMin: 7,
    nightsMax: 7,
    seaRequired: true,
    visaFreeOnly: true,
    preferHot: true,
    rawBrief: "",
  };
}

function loadDraft(): SearchDraft {
  const base = defaultDraft();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SearchDraft>;
    return {
      ...base,
      ...parsed,
      adults: Number(parsed.adults ?? base.adults) || base.adults,
      nightsMin: Number(parsed.nightsMin ?? base.nightsMin) || base.nightsMin,
      nightsMax: Number(parsed.nightsMax ?? base.nightsMax) || base.nightsMax,
      seaRequired: Boolean(parsed.seaRequired ?? base.seaRequired),
      visaFreeOnly: Boolean(parsed.visaFreeOnly ?? base.visaFreeOnly),
      preferHot: Boolean(parsed.preferHot ?? base.preferHot),
      fromCity: String(parsed.fromCity ?? base.fromCity),
      countries: String(parsed.countries ?? base.countries),
      childrenAges: String(parsed.childrenAges ?? base.childrenAges),
      departFrom: String(parsed.departFrom ?? base.departFrom),
      departTo: String(parsed.departTo ?? base.departTo),
      rawBrief: String(parsed.rawBrief ?? base.rawBrief),
    };
  } catch {
    return base;
  }
}

function saveDraft(draft: SearchDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function SearchForm({ disabled = false }: { disabled?: boolean }) {
  const [draft, setDraft] = useState<SearchDraft>(defaultDraft);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startedHere, setStartedHere] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(loadDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft(draft);
  }, [draft, hydrated]);

  function patch<K extends keyof SearchDraft>(key: K, value: SearchDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled || startedHere) return;
    setBusy(true);
    setMessage(null);
    saveDraft(draft);
    const body = {
      adults: draft.adults,
      childrenAges: draft.childrenAges,
      fromCity: draft.fromCity,
      countries: draft.countries,
      departFrom: draft.departFrom,
      departTo: draft.departTo,
      nightsMin: draft.nightsMin,
      nightsMax: draft.nightsMax,
      seaRequired: draft.seaRequired,
      visaFreeOnly: draft.visaFreeOnly,
      preferHot: draft.preferHot,
      rawBrief: draft.rawBrief.trim() || undefined,
    };

    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || `Ошибка ${res.status}`);
      return;
    }
    setStartedHere(true);
    setMessage("Поиск запущен — пальмы оживут, полоска покажет ход. Лог — в «Система».");
    window.dispatchEvent(new Event(JOB_STARTED_EVENT));
    window.location.hash = "job-status";
  }

  const locked = disabled || busy || startedHere;

  return (
    <form className="search-form" onSubmit={onSubmit}>
      {disabled || startedHere ? (
        <p className="muted full">
          Форма заблокирована: уже идёт поиск. Отмените его в блоке статуса или дождитесь
          завершения.
        </p>
      ) : null}
      <label>
        Город вылета
        <input
          name="fromCity"
          value={draft.fromCity}
          onChange={(e) => patch("fromCity", e.target.value)}
          required
        />
      </label>
      <label>
        Страны
        <input
          name="countries"
          value={draft.countries}
          onChange={(e) => patch("countries", e.target.value)}
          required
        />
      </label>
      <label>
        Взрослые
        <input
          name="adults"
          type="number"
          min={1}
          value={draft.adults}
          onChange={(e) => patch("adults", Number(e.target.value) || 1)}
        />
      </label>
      <label>
        Возраст детей
        <input
          name="childrenAges"
          value={draft.childrenAges}
          onChange={(e) => patch("childrenAges", e.target.value)}
          placeholder="11,14"
        />
      </label>
      <label>
        Вылет с
        <input
          name="departFrom"
          type="date"
          value={draft.departFrom}
          onChange={(e) => patch("departFrom", e.target.value)}
          required
        />
      </label>
      <label>
        Вылет по
        <input
          name="departTo"
          type="date"
          value={draft.departTo}
          onChange={(e) => patch("departTo", e.target.value)}
          required
        />
      </label>
      <label>
        Ночей от
        <input
          name="nightsMin"
          type="number"
          min={1}
          value={draft.nightsMin}
          onChange={(e) => patch("nightsMin", Number(e.target.value) || 1)}
        />
      </label>
      <label>
        Ночей до
        <input
          name="nightsMax"
          type="number"
          min={1}
          value={draft.nightsMax}
          onChange={(e) => patch("nightsMax", Number(e.target.value) || 1)}
        />
      </label>
      <div className="checks full">
        <label className="check">
          <input
            name="seaRequired"
            type="checkbox"
            checked={draft.seaRequired}
            onChange={(e) => patch("seaRequired", e.target.checked)}
          />
          <span>Море</span>
        </label>
        <label className="check">
          <input
            name="visaFreeOnly"
            type="checkbox"
            checked={draft.visaFreeOnly}
            onChange={(e) => patch("visaFreeOnly", e.target.checked)}
          />
          <span>Без визы</span>
        </label>
        <label className="check">
          <input
            name="preferHot"
            type="checkbox"
            checked={draft.preferHot}
            onChange={(e) => patch("preferHot", e.target.checked)}
          />
          <span>Горящие / скидки</span>
        </label>
      </div>
      <label className="full">
        Свободный бриф
        <textarea
          name="rawBrief"
          rows={3}
          placeholder="Опционально"
          value={draft.rawBrief}
          onChange={(e) => patch("rawBrief", e.target.value)}
        />
      </label>
      <div className="full">
        <button className="btn btn-primary" type="submit" disabled={locked}>
          {busy ? "Запуск…" : locked ? "Поиск уже идёт" : "Искать с проверкой"}
        </button>
        {message ? <p className="muted" style={{ marginTop: "0.75rem" }}>{message}</p> : null}
      </div>
    </form>
  );
}
