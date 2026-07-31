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
      setMessage(data.error || `Error ${res.status}`);
      return;
    }
    setMessage(`Started job ${data.jobId}. Review candidates in Admin → Offers.`);
  }

  return (
    <form className="search-form" onSubmit={onSubmit}>
      <label>
        From city
        <input name="fromCity" defaultValue="Nizhny Novgorod" required />
      </label>
      <label>
        Countries
        <input name="countries" defaultValue="Turkey, Morocco, Montenegro" required />
      </label>
      <label>
        Adults
        <input name="adults" type="number" min={1} defaultValue={2} />
      </label>
      <label>
        Children ages (comma)
        <input name="childrenAges" defaultValue="11,14" placeholder="11,14" />
      </label>
      <label>
        Depart from
        <input name="departFrom" type="date" defaultValue={tomorrowISO()} required />
      </label>
      <label>
        Depart to
        <input name="departTo" type="date" defaultValue={plusDaysISO(14)} required />
      </label>
      <label>
        Nights min
        <input name="nightsMin" type="number" min={1} defaultValue={7} />
      </label>
      <label>
        Nights max
        <input name="nightsMax" type="number" min={1} defaultValue={7} />
      </label>
      <label className="check">
        <input name="seaRequired" type="checkbox" defaultChecked /> Sea
      </label>
      <label className="check">
        <input name="visaFreeOnly" type="checkbox" defaultChecked /> Visa not required
      </label>
      <label className="check">
        <input name="preferHot" type="checkbox" defaultChecked /> Prefer hot/discount
      </label>
      <label className="full">
        Raw brief (optional)
        <textarea name="rawBrief" rows={3} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Starting…" : "Run verified search"}
      </button>
      {message ? <p className="muted full">{message}</p> : null}
    </form>
  );
}
