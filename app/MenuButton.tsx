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
// funktioniert über Tap auf den Scrim oder einen Menü-Eintrag).
//
// Führt nebenbei die "Menü-Kette" für SchliessenButton mit (siehe
// menuNavigation.ts, Bug 09/2026): bei jedem Seitenaufruf wird vermerkt, ob
// diese Seite gerade über einen Klick auf einen Menü-Eintrag erreicht wurde
// (Kette geht weiter, Anker bleibt) oder auf einem anderen Weg (neue Kette,
// Anker wird diese Seite).

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
    href: "/einstellungen",
    label: "Einstellungen",
    pfade: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
  },
];

export default function MenuButton() {
  const [offen, setOffen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    menuKetteAktualisieren();
  }, []);

  return (
    <>
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
                  menuNavigationStarten(pathname);
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
