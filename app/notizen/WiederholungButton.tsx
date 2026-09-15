// app/notizen/WiederholungButton.tsx
//
// Toggle-Button "Zur Wiederholung hinzufügen" / "In Wiederholung" für eine
// einzelne Hervorhebung — Pendenz "Notizen/Hervorhebungen optional in die
// Wiederholung aufnehmen", 09/2026. Genutzt von der Notizen-Übersicht
// (page.tsx) und analog (eigene Umsetzung dort) vom Popover im Lesen-Screen
// (Hervorhebbarer.tsx). Server Component kann kein onClick haben — dafür
// dieser schlanke Client Component, der nach dem Umschalten die Seite neu
// lädt (router.refresh()), analog zu EntfernenButton.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { wiederholungHinzufuegen, wiederholungEntfernen } from "./actions";

export default function WiederholungButton({ notizId, aktiv }: { notizId: string; aktiv: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function umschalten() {
    startTransition(async () => {
      if (aktiv) {
        await wiederholungEntfernen(notizId);
      } else {
        await wiederholungHinzufuegen(notizId);
      }
      router.refresh();
    });
  }

  return (
    <button
      onClick={umschalten}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        border: "none",
        background: "none",
        color: aktiv ? "#24231F" : "rgba(36,35,31,.5)",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: aktiv ? 600 : 400,
        fontSize: 13,
        cursor: "pointer",
        padding: 0,
        alignSelf: "flex-start",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M4 12a8 8 0 0 1 14-5.3" />
        <path d="M20 12a8 8 0 0 1-14 5.3" />
        <path d="M18 3v4h-4" />
        <path d="M6 21v-4h4" />
      </svg>
      {aktiv ? "In Wiederholung" : "Zur Wiederholung"}
    </button>
  );
}
