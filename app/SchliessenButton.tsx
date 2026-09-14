// app/SchliessenButton.tsx
//
// "Schliessen"-Button (×) für die fünf Hauptscreens, die über MenuButton.tsx
// direkt erreichbar sind (Wiederholung, Bibliothek, Wunschliste, Fortschritt,
// Einstellungen). Ursprünglich ein <Link href="/">, was IMMER auf den
// Homescreen führte — auch wenn das Menü von einer anderen Unterseite aus
// geöffnet wurde (Bug, 09/2026), dann auf router.back() umgestellt.
//
// back() allein reichte aber nicht, sobald mehrere Menü-Sprünge
// hintereinander passierten (z.B. Wiederholung -> Fortschritt ->
// Einstellungen): back() bringt dann immer nur zum VORHERIGEN Thema in der
// Kette zurück, nicht zur Seite, von der aus das Menü zum ersten Mal
// geöffnet wurde (Bug, 09/2026). menuAnkerLesen() liefert genau diese Seite,
// von MenuButton bei jeder Navigation über einen Menü-Eintrag mitgeführt
// (siehe menuNavigation.ts).
//
// Ohne aktive Menü-Kette (Seite direkt aufgerufen, oder über eine feste
// Unterseiten-Navigation ohne das Dropdown-Menü erreicht) fiel dies bisher
// auf router.back() zurück — das führte zu einem Ping-Pong-Bug (09/2026,
// "Themenverteilung ohne Exit"): einstellungen/themenverteilung wird per
// festem <Link> von Einstellungen aus aufgerufen und leitet beim Speichern
// serverseitig zurück auf /einstellungen (redirect(), KEIN Menü-Sprung,
// also kein Anker). back() auf Einstellungen führte dann im echten
// Browser-Verlauf genau zurück zu Themenverteilung, wieder und wieder.
// Ohne Anker gilt deshalb jetzt immer push("/") statt back() — eindeutig
// und unabhängig vom bisherigen Browser-Verlauf.
//
// Seiten, die IMMER von genau einem bestimmten Elternscreen aus erreichbar
// sind (z.B. buecherliste/neu von buecherliste, wiederholung/sitzung von
// wiederholung), behalten bewusst ihren festen <Link href="..."> — dort gibt
// es kein Mehrdeutigkeits-Problem.

"use client";

import { useRouter } from "next/navigation";
import { menuAnkerLesen } from "./menuNavigation";

export default function SchliessenButton() {
  const router = useRouter();

  function schliessen() {
    const anker = menuAnkerLesen();
    router.push(anker ?? "/");
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
