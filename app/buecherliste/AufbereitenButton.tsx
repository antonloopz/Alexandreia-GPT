// app/buecherliste/AufbereitenButton.tsx
//
// Löst die Pipeline (Entwurf → Prüfung → Quiz) sofort für ein
// gewähltes Buch aus, statt auf den nächsten Cron-Lauf zu warten. Läuft
// serverseitig im Hintergrund (siehe actions.ts, next/server after()) und
// damit auch weiter, wenn diese Seite verlassen oder das Tab geschlossen
// wird — dauert real trotzdem 1-3 Minuten (echte Claude-API-Aufrufe), der
// Hinweistext hier ist deshalb rein lokale UI-Rückmeldung für den Moment des
// Klicks, kein Live-Status der eigentlichen Verarbeitung: verlässt man die
// Seite und kommt zurück, ist dieser Zustand weg, auch wenn im Hintergrund
// noch weitergearbeitet wird — das fertige Buch erscheint dann einfach ohne
// weitere Ankündigung in der Bibliothek.
//
// In der kostenfreien Testumgebung (siehe src/lib/testmodus.ts) ist dieser
// Button durch einen Hinweis ersetzt statt einfach ausgeblendet — löst
// echte Claude-API-Kosten aus, soll dort also gar nicht erst klickbar sein.

"use client";

import { useState, useTransition } from "react";
import { buchJetztAufbereiten } from "./actions";
import { kiDeaktiviert } from "../../src/lib/testmodus";

export default function AufbereitenButton({ buchId }: { buchId: string }) {
  const [gestartet, setGestartet] = useState(false);
  const [, startTransition] = useTransition();

  if (kiDeaktiviert()) {
    return (
      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 13.5,
          padding: "6px 10px",
          color: "rgba(36,35,31,.4)",
        }}
      >
        In der Testversion deaktiviert
      </span>
    );
  }

  if (gestartet) {
    return (
      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 13.5,
          padding: "6px 10px",
          color: "rgba(36,35,31,.55)",
        }}
      >
        Läuft im Hintergrund … (1–3 Min., Seite kann verlassen werden)
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
        fontSize: 13.5,
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
