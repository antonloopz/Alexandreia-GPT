// app/WiederInLaufButton.tsx
//
// Umschalter "Wieder in den Lauf" (09/2026, Pendenz "Gelesene Bücher
// wieder in den Lauf aufnehmen") — auf dem Abschluss-Screen und bei
// gelesenen Büchern in der Bibliothek. Aufgenommene Bücher kommen zurück in
// die Tagesauswahl und stehen bis dahin unter "Bereit"; der bisherige
// Durchgang bleibt gezählt (siehe gezeigteBuecher.wiederImLaufSeit).
// Optimistisch wie BuchBewertung.tsx: sofortige Anzeige, bei Fehler zurück.

"use client";

import { useState, useTransition } from "react";
import { wiederInDenLauf } from "./abschluss/[id]/actions";

export default function WiederInLaufButton({
  buchinhaltId,
  imLauf: initial,
  kompakt = false,
}: {
  buchinhaltId: string;
  imLauf: boolean;
  kompakt?: boolean;
}) {
  const [imLauf, setImLauf] = useState(initial);
  const [laeuft, startTransition] = useTransition();

  function umschalten() {
    const neu = !imLauf;
    setImLauf(neu);
    startTransition(async () => {
      try {
        await wiederInDenLauf(buchinhaltId, neu);
      } catch (e) {
        console.error("Wieder in den Lauf: Speichern fehlgeschlagen:", e);
        setImLauf(!neu);
      }
    });
  }

  const text = imLauf ? "Im Lauf ✓ · zurücknehmen" : "Wieder in den Lauf";
  return (
    <button
      onClick={umschalten}
      disabled={laeuft}
      style={{
        alignSelf: kompakt ? "flex-start" : "center",
        border: "none",
        cursor: "pointer",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 600,
        fontSize: kompakt ? 13.5 : 15,
        padding: kompakt ? 0 : "8px 16px",
        borderRadius: 999,
        background: kompakt ? "none" : imLauf ? "#24231F" : "rgba(36,35,31,.1)",
        color: kompakt ? "rgba(36,35,31,.6)" : imLauf ? "#FBFAF7" : "#24231F",
        textDecoration: kompakt ? "underline" : "none",
        textDecorationColor: "rgba(36,35,31,.25)",
        textUnderlineOffset: 2,
        opacity: laeuft ? 0.6 : 1,
      }}
    >
      {kompakt && !imLauf ? "↻ " : ""}
      {text}
    </button>
  );
}
