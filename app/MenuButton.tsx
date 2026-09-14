// app/MenuButton.tsx
//
// Menü-Icon + Dropdown-Overlay, auf jedem Screen (inkl. Home) wiederverwendet
// (09/2026, Pendenz "Bibliothek/Wunschliste/Wiederholung/Streak entfernen,
// nur über Dropdownmenü aufrufbar; Dropdown-Button ohne Hintergrund, nur
// drei Balken") — Rückbau der zwischenzeitlichen Pillen-Reihen (sowohl der
// eigenen auf Unterseiten als auch StartseitenPillen.tsx auf Home, siehe
// Git-Historie vor 9f84b83) zu einem einzigen unauffälligen Menü-Trigger
// plus Overlay, das alle fünf Ziele auflistet.
//
// Trigger bewusst OHNE Pillen-/Kreis-Hintergrund (anders als die früheren
// Buttons) — reine drei Balken, kein Wechsel-Icon beim Öffnen (Schliessen
// funktioniert über Tap auf den Scrim oder einen Menü-Eintrag). Rechtsbündig
// auf allen Seiten (eigene volle-Breite-Zeile mit justify-content: flex-end
// hier im Component, nicht pro Seite nachgezogen).
//
// Die drei Balken sind ausschliesslich das Trigger-Icon — der Menü-Eintrag
// "Einstellungen" selbst zeigt weiterhin das Zahnrad (09/2026: sonst zwei
// optisch identische Balken-Icons, einmal aussen als Trigger, einmal innen
// als Listeneintrag — verwirrend).
//
// Führt nebenbei die "Menü-Kette" für SchliessenButton mit (siehe
// menuNavigation.ts, Bug 09/2026): bei jedem Seitenaufruf wird vermerkt, ob
// diese Seite gerade über einen Klick auf einen Menü-Eintrag erreicht wurde
// (Kette geht weiter, Anker bleibt) oder auf einem anderen Weg (neue Kette,
// Anker wird diese Seite).
//
// ankerPfad (optional, 09/2026, Bug "Themenverteilung ohne Exit"): manche
// Unterseiten (z.B. einstellungen/themenverteilung) haben selbst KEINEN
// SchliessenButton und sind nur über einen festen Elternscreen erreichbar.
// Wird von dort aus das Menü geöffnet, würde die Kette sonst genau diese
// Unterseite als Rücksprungziel setzen — Schliessen auf der Zielseite
// landet dann auf einer Seite ohne eigenen Ausweg (nur der Zurück-Pfeil).
// ankerPfad überschreibt für diesen Fall den tatsächlichen Pfad durch den
// bekannten, "richtigen" Elternscreen (hier: /einstellungen).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuKetteAktualisieren, menuNavigationStarten } from "./menuNavigation";

const EINTRAEGE: { href: string; label: string; pfade: React.ReactNode }[] = [
  {
    href: "/wiederholung",
    label: "Wiederholung",
    pfade: (
      <>
        <path d="M4 12a8 8 0 1 1 2.5 5.8" />
        <path d="M4 17v-4h4" />
      </>
    ),
  },
  {
    href: "/bookshelf",
    label: "Bibliothek",
    pfade: (
      <>
        <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
        <path d="M12 6.5v11" />
      </>
    ),
  },
  {
    href: "/buecherliste",
    label: "Wunschliste",
    pfade: (
      <>
        <path d="M6 3.5v17" />
        <path d="M6 4h11l-3 3.5 3 3.5H6" />
      </>
    ),
  },
  {
    href: "/fortschritt",
    label: "Fortschritt",
    pfade: (
      <>
        <line x1="5.5" y1="18.5" x2="5.5" y2="12.5" />
        <line x1="12" y1="18.5" x2="12" y2="8.5" />
        <line x1="18.5" y1="18.5" x2="18.5" y2="5.5" />
      </>
    ),
  },
  {
    href: "/notizen",
    label: "Notizen",
    pfade: (
      <>
        <path d="M7 4.5h8.5L19 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
        <path d="M15.5 4.5V8H19" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="15.5" x2="13" y2="15.5" />
      </>
    ),
  },
  {
    href: "/einstellungen",
    label: "Einstellungen",
    pfade: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1.04-1.56V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.56 1.04h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" />
      </>
    ),
  },
];

export default function MenuButton({ ankerPfad }: { ankerPfad?: string } = {}) {
  const [offen, setOffen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    menuKetteAktualisieren();
  }, []);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <button
          onClick={() => setOffen((o) => !o)}
          aria-label={offen ? "Menü schliessen" : "Menü öffnen"}
          style={{
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
      </div>

      {offen && (
        <>
          <div
            onClick={() => setOffen(false)}
            aria-hidden
            style={{ position: "fixed", inset: 0, background: "rgba(36,35,31,.45)", zIndex: 40 }}
          />
          <div
            style={{
              position: "fixed",
              top: 64,
              right: 16,
              width: 246,
              boxSizing: "border-box",
              background: "#F2F4EF",
              border: "1.5px solid #24231F",
              borderRadius: 16,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              zIndex: 41,
            }}
          >
            {EINTRAEGE.map((eintrag) => (
              <Link
                key={eintrag.href}
                href={eintrag.href}
                onClick={() => {
                  setOffen(false);
                  menuNavigationStarten(ankerPfad ?? pathname);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 12px",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "#24231F",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  {eintrag.pfade}
                </svg>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 500, fontSize: 16.5 }}>
                  {eintrag.label}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
