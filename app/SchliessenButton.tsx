// app/SchliessenButton.tsx
//
// "Schliessen"-Button (×) für die fünf Hauptscreens, die über MenuButton.tsx
// direkt erreichbar sind (Wiederholung, Bibliothek, Wunschliste, Fortschritt,
// Einstellungen). Bisher war das ein <Link href="/">, was IMMER auf den
// Homescreen führte — auch wenn das Menü von einer anderen Unterseite aus
// geöffnet wurde (Bug, 09/2026). MenuButton navigiert per <Link>
// (Next.js-Client-Navigation), was einen Verlaufseintrag anlegt — deshalb
// bringt router.back() wieder genau dorthin zurück, von wo aus das Menü
// geöffnet wurde. Fällt nur auf den Homescreen zurück, wenn es keinen
// Verlauf gibt (Seite direkt aufgerufen/als Lesezeichen geöffnet).
//
// Seiten, die IMMER von genau einem bestimmten Elternscreen aus erreichbar
// sind (z.B. buecherliste/neu von buecherliste, wiederholung/sitzung von
// wiederholung), behalten bewusst ihren festen <Link href="..."> — dort gibt
// es kein Mehrdeutigkeits-Problem.

"use client";

import { useRouter } from "next/navigation";

export default function SchliessenButton() {
  const router = useRouter();

  function schliessen() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <button
      onClick={schliessen}
      aria-label="Schliessen"
      style={{
        border: "none",
        background: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="18" y1="6" x2="6" y2="18" />
      </svg>
    </button>
  );
}
