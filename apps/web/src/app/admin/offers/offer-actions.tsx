"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "verify" | "reject") {
    setBusy(true);
    const reason =
      action === "reject" ? window.prompt("Причина отклонения?") || "Отклонено админом" : undefined;
    await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId, action, reason }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn" type="button" disabled={busy} onClick={() => void act("verify")}>
        Подтвердить
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => void act("reject")}>
        Отклонить
      </button>
    </>
  );
}
