// app/buecherliste/PrioritaetToggle.tsx
//
// Kleiner Umschalter pro noch nicht produziertem Wunschlisten-Eintrag:
// "bald" setzen/zurücknehmen. Optimistisches UI (Zustand sofort lokal
// umgeschaltet), Server Action läuft im Hintergrund nach.

"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { prioritaetUmschalten } from "./actions";

const basisStil: CSSProperties = {
  fontFamily: "Helvetica, Arial, sans-serif",
  fontWeight: 600,
  fontSize: 11.5,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(36,35,31,.25)",
  background: "transparent",
  color: "#24231F",
  cursor: "pointer",
};

const aktivStil: CSSProperties = {
  ...basisStil,
  background: "#24231F",
  color: "#FBFAF7",
  border: "1px solid #24231F",
};

export default function PrioritaetToggle({
  eintragId,
  aktiv: initial,
}: {
  eintragId: string;
  aktiv: boolean;
}) {
  const [aktiv, setAktiv] = useState(initial);
  const [, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        const naechsterWert = !aktiv;
        setAktiv(naechsterWert);
        startTransition(() => {
          prioritaetUmschalten(eintragId, naechsterWert);
        });
      }}
      style={aktiv ? aktivStil : basisStil}
    >
      {aktiv ? "Vorgemerkt für nächsten Lauf ✓" : "Für nächsten Lauf vormerken"}
    </button>
  );
}
