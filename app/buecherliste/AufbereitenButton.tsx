// app/buecherliste/AufbereitenButton.tsx
//
// Löst die Pipeline (Entwurf → Prüfung → Lernkarten/Quiz) sofort für ein
// gewähltes Buch aus, statt auf den nächsten Cron-Lauf zu warten. Dauert
// real 1-3 Minuten (echte Claude-API-Aufrufe) — zeigt deshalb sofort einen
// Hinweistext an, damit es nicht wie ein hängender Button wirkt.

"use client";

import { useState, useTransition } from "react";
import { buchJetztAufbereiten } from "./actions";

export default function AufbereitenButton({ buchId }: { buchId: string }) {
  const [gestartet, setGestartet] = useState(false);
  const [, startTransition] = useTransition();

  if (gestartet) {
    return (
      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 11.5,
          padding: "6px 10px",
          color: "rgba(36,35,31,.55)",
        }}
      >
        Wird aufbereitet … (1–3 Min.)
      </span>
    );
  }

  return (
    <button
      onClick={() => {
        setGestartet(true);
        startTransition(() => {
          buchJetztAufbereiten(buchId);
        });
      }}
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 600,
        fontSize: 11.5,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(36,35,31,.25)",
        background: "transparent",
        color: "#24231F",
        cursor: "pointer",
      }}
    >
      Jetzt aufbereiten
    </button>
  );
}
