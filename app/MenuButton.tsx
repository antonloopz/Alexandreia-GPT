// app/MenuButton.tsx
//
// Navigationsreihe (Pillen), auf jedem Screen wiederverwendet — ersetzt das
// frühere Dropdown-Menü (Icon + Overlay) durch vier immer sichtbare
// Pillen-Buttons, gleichmässig über die volle Seitenbreite verteilt, in
// identischer Grösse. Wird als eigene Zeile UNTER dem jeweiligen
// Seiten-Header gerendert (nicht mehr in dessen rechte Ecke gequetscht,
// 09/2026, Pendenz "Pillenbuttons gleichmässig über die Breite verteilen").
//
// "Fortschritt" ist hier bewusst NICHT mehr enthalten — die Fortschritt-
// Seite ist stattdessen über den Streak-Pill auf der Startseite erreichbar
// (09/2026, Pendenz "Fortschritt-Button streichen, Streak führt dorthin").
//
// Die Pille des aktuell aktiven Screens ist dunkel hervorgehoben (dient als
// "Du bist hier"), alle anderen hell.
//
// Führt nebenbei weiterhin die "Menü-Kette" für SchliessenButton mit (siehe
// menuNavigation.ts, Bug 09/2026): bei jedem Seitenaufruf wird vermerkt, ob
// diese Seite gerade über einen Klick auf eine dieser Pillen erreicht wurde
// (Kette geht weiter, Anker bleibt) oder auf einem anderen Weg (neue Kette,
// Anker wird diese Seite).

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuKetteAktualisieren, menuNavigationStarten } from "./menuNavigation";

export const EINTRAEGE: { href: string; label: string; pfade: React.ReactNode }[] = [
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

export default function MenuButton() {
  const pathname = usePathname();

  // Läuft genau einmal beim Mount dieser Seite (eine neue Seite bedeutet
  // immer eine neue MenuButton-Instanz, siehe Kommentar oben).
  useEffect(() => {
    menuKetteAktualisieren();
  }, []);

  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 12, flexShrink: 0 }}>
      {EINTRAEGE.map((eintrag) => {
        const aktiv = pathname === eintrag.href;
        return (
          <Link
            key={eintrag.href}
            href={eintrag.href}
            aria-label={eintrag.label}
            onClick={() => menuNavigationStarten(pathname)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 10px",
              borderRadius: 999,
              background: aktiv ? "#24231F" : "rgba(36,35,31,.08)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={aktiv ? "#F2F4EF" : "#24231F"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {eintrag.pfade}
            </svg>
          </Link>
        );
      })}
    </div>
  );
}
