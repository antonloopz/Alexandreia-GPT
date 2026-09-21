// app/konzepte/ZurueckButton.tsx
//
// Zurück-Pfeil für die Konzept-Seiten (09/2026, Pendenz "Vernetzung"). Die
// Seiten sind von vielen Stellen aus erreichbar (Lesen, Bibliothek,
// Konzept-Übersicht, andere Konzepte) — deshalb router.back() statt eines
// festen Ziels. Ohne Verlauf (Seite direkt aufgerufen) zur Übersicht.

"use client";

import { useRouter } from "next/navigation";

export default function ZurueckButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      aria-label="Zurück"
      style={{ border: "none", background: "none", padding: 0, margin: 0, display: "flex", alignItems: "center", cursor: "pointer" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 5.5 8 12l6.5 6.5" />
      </svg>
    </button>
  );
}
