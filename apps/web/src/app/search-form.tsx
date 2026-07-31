"use client";

import { useState } from "react";

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

export function SearchForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      adults: Number(fd.get("adults") || 2),
      childrenAges: String(fd.get("childrenAges") || ""),
      fromCity: String(fd.get("fromCity") || ""),
      countries: String(fd.get("countries") || ""),
      departFrom: String(fd.get("departFrom") || ""),
      departTo: String(fd.get("departTo") || ""),
      nightsMin: Number(fd.get("nightsMin") || 7),
      nightsMax: Number(fd.get("nightsMax") || 7),
      seaRequired: fd.get("seaRequired") === "on",
      visaFreeOnly: fd.get("visaFreeOnly") === "on",
      preferHot: fd.get("preferHot") === "on",
      rawBrief: String(fd.get("rawBrief") || "") || undefined,
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
    setMessage(
      `Задача ${data.jobId} запущена. Кандидаты появятся в разделе «Офферы».`,
    );
  }

  return (
    <form className="search-form" onSubmit={onSubmit}>
      <label>
        Город вылета
        <input name="fromCity" defaultValue="Нижний Новгород" required />
      </label>
      <label>
        Страны
        <input name="countries" defaultValue="Турция, Марокко, Черногория" required />
      </label>
      <label>
        Взрослые
        <input name="adults" type="number" min={1} defaultValue={2} />
      </label>
      <label>
        Возраст детей
        <input name="childrenAges" defaultValue="11,14" placeholder="11,14" />
      </label>
      <label>
        Вылет с
        <input name="departFrom" type="date" defaultValue={tomorrowISO()} required />
      </label>
      <label>
        Вылет по
        <input name="departTo" type="date" defaultValue={plusDaysISO(14)} required />
      </label>
      <label>
        Ночей от
        <input name="nightsMin" type="number" min={1} defaultValue={7} />
      </label>
      <label>
        Ночей до
        <input name="nightsMax" type="number" min={1} defaultValue={7} />
      </label>
      <div className="checks full">
        <label className="check">
          <input name="seaRequired" type="checkbox" defaultChecked />
          <span>Море</span>
        </label>
        <label className="check">
          <input name="visaFreeOnly" type="checkbox" defaultChecked />
          <span>Без визы</span>
        </label>
        <label className="check">
          <input name="preferHot" type="checkbox" defaultChecked />
          <span>Горящие / скидки</span>
        </label>
      </div>
      <label className="full">
        Свободный бриф
        <textarea name="rawBrief" rows={3} placeholder="Опционально" />
      </label>
      <div className="full">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Запуск…" : "Искать с проверкой"}
        </button>
        {message ? <p className="muted" style={{ marginTop: "0.75rem" }}>{message}</p> : null}
      </div>
    </form>
  );
}
