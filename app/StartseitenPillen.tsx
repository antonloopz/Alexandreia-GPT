// app/StartseitenPillen.tsx
//
// Navigationsreihe für den Homescreen: zwei Gruppen kleiner, gleich
// grosser Pillen, an den Rändern aufgerückt (09/2026, Pendenz "Buttons
// bleiben klein, Zwischenraum statt Streckung, in zwei Gruppen an den
// Rändern"):
//   links:  Bibliothek · Wunschliste · Wiederholung (Icon+Zahl)
//   rechts: Streak (Icon+Zahl, führt zur Fortschritt-Seite) · Einstellungen
// Innerhalb einer Gruppe sitzen die Pillen dicht beieinander (kleiner
// fester Abstand), zwischen den beiden Gruppen bleibt der Rest der Breite
// als Freiraum (justify-content: space-between auf die zwei Gruppen, nicht
// auf einzelne Pillen). Kein separates Fortschritt-Icon mehr — die
// Streak-Pille übernimmt diese Rolle bereits (siehe StartseitenPillen-
// Historie, 09/2026).
//
// Wiederholung und Streak zeigen zusätzlich ihre Zahl (fällige
// Wiederholungen bzw. aktueller Streak) — Bibliothek, Wunschliste und
// Einstellungen sind reine Icon-Pillen. Alle fünf Pillen haben trotzdem
// exakt dieselbe Höhe UND Breite (fixe PILL_GROESSE statt auto-Breite via
// Padding, 09/2026 — zuvor liess die variable Breite die Icon+Zahl-Pillen
// deutlich breiter als die reinen Icon-Pillen wirken, siehe Screenshot).
// PILL_GROESSE ist bewusst so gewählt, dass auch zweistellige Zahlen
// (Streak/fällige Wiederholungen > 9) noch bequem Platz haben.
//
// Home (app/page.tsx) ist ein Server Component und kann daher selbst keine
// Klick-Handler/useEffects haben — deshalb dieser kleine Client-Wrapper,
// analog zu MenuButton.tsx, von dem auch die Icons für Bibliothek,
// Wunschliste und Einstellungen wiederverwendet werden (EINTRAEGE-Export).
//
// Führt die "Menü-Kette" für SchliessenButton weiter (siehe
// menuNavigation.ts) — Home selbst braucht zwar kein Schliessen, aber ein
// Sprung von hier über eine dieser Pillen zählt als Kettenstart, damit ein
// nachfolgendes Schliessen auf einer Unterseite wieder hierher zurückführt.

"use client";

import { useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuKetteAktualisieren, menuNavigationStarten } from "./menuNavigation";
import { EINTRAEGE } from "./MenuButton";

export default function StartseitenPillen({
  faellig,
  streak,
  akzent,
}: {
  faellig: number;
  streak: number;
  akzent: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    menuKetteAktualisieren();
  }, []);

  const bibliothek = EINTRAEGE.find((e) => e.href === "/bookshelf")!;
  const wunschliste = EINTRAEGE.find((e) => e.href === "/buecherliste")!;
  const einstellungen = EINTRAEGE.find((e) => e.href === "/einstellungen")!;
  const wiederholungPfade = EINTRAEGE.find((e) => e.href === "/wiederholung")!.pfade;

  const PILL_GROESSE = 38;

  const pillStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: PILL_GROESSE,
    height: PILL_GROESSE,
    borderRadius: 999,
    background: `linear-gradient(rgba(0,0,0,.07),rgba(0,0,0,.07)), ${akzent}`,
    flexShrink: 0,
  };

  function klick() {
    menuNavigationStarten(pathname);
  }

  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href={bibliothek.href} aria-label={bibliothek.label} onClick={klick} style={pillStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {bibliothek.pfade}
          </svg>
        </Link>

        <Link href={wunschliste.href} aria-label={wunschliste.label} onClick={klick} style={pillStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {wunschliste.pfade}
          </svg>
        </Link>

        <Link
          href="/wiederholung"
          aria-label={`${faellig} fällige Wiederholung${faellig === 1 ? "" : "en"}`}
          onClick={klick}
          style={pillStyle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            {wiederholungPfade}
          </svg>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>{faellig}</span>
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/fortschritt" aria-label={`Streak: ${streak} Tage, Fortschritt`} onClick={klick} style={pillStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4.5h12v15l-6-4-6 4Z" />
          </svg>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>{streak}</span>
        </Link>

        <Link href={einstellungen.href} aria-label={einstellungen.label} onClick={klick} style={pillStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {einstellungen.pfade}
          </svg>
        </Link>
      </div>
    </div>
  );
}
