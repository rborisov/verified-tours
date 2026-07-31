"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "verify" | "reject") {
    setBusy(true);
    const reason =
      action === "reject" ? window.prompt("Reject reason?") || "Rejected by admin" : undefined;
    await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId, action, reason }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="row-actions">
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act("verify")}>
        Confirm
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => void act("reject")}>
        Reject
      </button>
    </div>
  );
}
