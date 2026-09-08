// app/StatusBarColor.tsx
//
// Setzt die Statusleisten-Fläche (siehe body { background: var(--status-farbe) }
// in globals.css) auf die Kategorie-/Akzentfarbe der jeweiligen Seite, statt
// immer nur Ink. Reines Hilfselement ohne eigene Darstellung (rendert null)
// — einfach als erstes Kind in ein farbiges <main> einbauen:
//
//   <main style={{ background: akzent, ... }}>
//     <StatusBarColor farbe={akzent} />
//     ...
//   </main>
//
// Läuft clientseitig, weil body ausserhalb des von React kontrollierten
// Baums liegt (im Root-Layout gerendert) — ein Server Component kann keine
// Eigenschaften eines Vorfahren setzen, useEffect + direktes DOM-Update ist
// hier der pragmatischste Weg. Setzt beim Verlassen der Seite wieder zurück
// auf den globalen Ink-Standard (globals.css-Fallback), nicht zwingend
// nötig (jede Seite setzt es beim Mounten neu), aber sauberer bei schnellen
// Zurück-Navigationen.

"use client";

import { useEffect } from "react";

export default function StatusBarColor({ farbe }: { farbe: string }) {
  useEffect(() => {
    document.body.style.setProperty("--status-farbe", farbe);
    return () => {
      document.body.style.removeProperty("--status-farbe");
    };
  }, [farbe]);

  return null;
}
