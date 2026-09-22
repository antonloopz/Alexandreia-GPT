// src/lib/lesemodus.ts
//
// Lesemodus (09/2026, Pendenz "Lesemodus: Schriftgrösse & Zeilenabstand
// einstellbar", inkl. Schriftart aus der Pendenz "Typografie"): drei
// Einstellungen in festen Stufen statt freier Regler — auf dem Handy
// treffsicher und typografisch sauber. Gespeichert in
// kontoeinstellungen.lesemodus (gilt damit auf allen Geräten), eingestellt
// unter Einstellungen → Lesemodus (Entscheid 22.09.2026: über das Menü,
// nicht auf der Lese-Seite selbst).
//
// Wirkt über CSS-Variablen (leseVariablen), die die Lese-Screens (Lesen,
// Kernaussagen, Konzept-Seite) auf ihrem Wurzelelement setzen; der
// eigentliche Lesetext nutzt die Stile LESETEXT/LESETEXT_* unten. Titel,
// Beschriftungen und Buttons bleiben bewusst fix, damit das Layout stabil
// bleibt. Rein (ohne DB-Import), damit auch Client Components es nutzen
// können — Laden: src/lib/lesemodus-laden.ts.

import type { CSSProperties } from "react";

export const GROESSEN_PX = [15, 16, 17, 19, 21] as const;
export const ZEILENABSTAENDE = { eng: 1.4, normal: 1.55, weit: 1.75 } as const;
export const SCHRIFTEN = {
  sans: "Helvetica, Arial, sans-serif",
  serif: 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif',
} as const;

export type Zeilenabstand = keyof typeof ZEILENABSTAENDE;
export type Schrift = keyof typeof SCHRIFTEN;
export type Lesemodus = { groesse: number; zeilen: Zeilenabstand; schrift: Schrift };

// Standard = bisherige feste Werte (17 px, 1,55, Helvetica).
export const STANDARD_LESEMODUS: Lesemodus = { groesse: 2, zeilen: "normal", schrift: "sans" };

export const ZEILEN_LABEL: Record<Zeilenabstand, string> = { eng: "Eng", normal: "Normal", weit: "Weit" };
export const SCHRIFT_LABEL: Record<Schrift, string> = { sans: "Helvetica", serif: "Serif" };

// Robust gegen fehlende/ungültige Werte aus der DB oder einer Server Action.
export function normalisiereLesemodus(roh: unknown): Lesemodus {
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const groesse =
    typeof o.groesse === "number" && Number.isInteger(o.groesse) && o.groesse >= 0 && o.groesse < GROESSEN_PX.length
      ? o.groesse
      : STANDARD_LESEMODUS.groesse;
  const zeilen = typeof o.zeilen === "string" && o.zeilen in ZEILENABSTAENDE ? (o.zeilen as Zeilenabstand) : STANDARD_LESEMODUS.zeilen;
  const schrift = typeof o.schrift === "string" && o.schrift in SCHRIFTEN ? (o.schrift as Schrift) : STANDARD_LESEMODUS.schrift;
  return { groesse, zeilen, schrift };
}

export function leseVariablen(modus: Lesemodus): CSSProperties {
  return {
    "--lese-groesse": `${GROESSEN_PX[modus.groesse]}px`,
    "--lese-zeilen": String(ZEILENABSTAENDE[modus.zeilen]),
    "--lese-schrift": SCHRIFTEN[modus.schrift],
  } as CSSProperties;
}

export function lesemodusKurz(modus: Lesemodus): string {
  return `${GROESSEN_PX[modus.groesse]} px · ${ZEILEN_LABEL[modus.zeilen]} · ${SCHRIFT_LABEL[modus.schrift]}`;
}

// Lesetext-Stile. Fallbacks = Standardwerte, falls ein Screen die
// Variablen (noch) nicht setzt. Varianten relativ zur Grundgrösse, damit
// die bisherige Abstufung (17 / 16 / 15 / 18 px) erhalten bleibt.
const basis = (deltaPx: number) =>
  deltaPx === 0 ? "var(--lese-groesse, 17px)" : `calc(var(--lese-groesse, 17px) ${deltaPx > 0 ? "+" : "-"} ${Math.abs(deltaPx)}px)`;

export const LESETEXT: CSSProperties = {
  fontSize: basis(0),
  lineHeight: "var(--lese-zeilen, 1.55)",
  fontFamily: "var(--lese-schrift, inherit)",
};
export const LESETEXT_KLEIN: CSSProperties = { ...LESETEXT, fontSize: basis(-1) };
export const LESETEXT_KLEINER: CSSProperties = { ...LESETEXT, fontSize: basis(-2) };
export const LESETEXT_GROSS: CSSProperties = { ...LESETEXT, fontSize: basis(1) };
