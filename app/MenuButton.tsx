// app/MenuButton.tsx
//
// Navigationsreihe (Pillen), auf jedem Screen wiederverwendet — ersetzt das
// frühere Dropdown-Menü (Icon + Overlay) durch vier immer sichtbare
// Pillen-Buttons. Gleiche Anordnung wie auf der Startseite (09/2026,
// Pendenz "gleiche Anordnung wie auf der Titelseite"): zwei Gruppen, links
// und rechts aufgerückt, statt gleichmässig über die volle Breite verteilt
// — links Bibliothek, Wunschliste, Wiederholung; rechts Einstellungen
// (identische Reihenfolge wie StartseitenPillen.tsx, nur ohne die dort
// zusätzliche Streak-Pille). Wird als eigene Zeile UNTER dem jeweiligen
// Seiten-Header gerendert (nicht in dessen rechte Ecke gequetscht).
//
// "Fortschritt" ist hier bewusst NICHT enthalten — die Fortschritt-Seite
// ist stattdessen über den Streak-Pill auf der Startseite erreichbar
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
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
  },
];

function Pille({
  eintrag,
  aktiv,
  pathname,
}: {
  eintrag: (typeof EINTRAEGE)[number];
  aktiv: boolean;
  pathname: string;
}) {
  return (
    <Link
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
        flexShrink: 0,
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
}

export default function MenuButton() {
  const pathname = usePathname();

  // Läuft genau einmal beim Mount dieser Seite (eine neue Seite bedeutet
  // immer eine neue MenuButton-Instanz, siehe Kommentar oben).
  useEffect(() => {
    menuKetteAktualisieren();
  }, []);

  const bibliothek = EINTRAEGE.find((e) => e.href === "/bookshelf")!;
  const wunschliste = EINTRAEGE.find((e) => e.href === "/buecherliste")!;
  const wiederholung = EINTRAEGE.find((e) => e.href === "/wiederholung")!;
  const einstellungen = EINTRAEGE.find((e) => e.href === "/einstellungen")!;

  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Pille eintrag={bibliothek} aktiv={pathname === bibliothek.href} pathname={pathname} />
        <Pille eintrag={wunschliste} aktiv={pathname === wunschliste.href} pathname={pathname} />
        <Pille eintrag={wiederholung} aktiv={pathname === wiederholung.href} pathname={pathname} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Pille eintrag={einstellungen} aktiv={pathname === einstellungen.href} pathname={pathname} />
      </div>
    </div>
  );
}
