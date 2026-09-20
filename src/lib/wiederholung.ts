// src/lib/wiederholung.ts
//
// Spaced-Repetition-Logik für Kernaussagen. Feste Intervallstufen
// (in Tagen) statt eines vollen SM-2-Algorithmus — bewusst einfach, passend
// zur "ein Buch pro Tag"-Philosophie. Von der Quiz-Bewertung (09/2026:
// vorher der separaten, inzwischen entfernten Lernkarten-Bewertung) UND
// vom Wiederholung-Screen genutzt.

import { bewertungEnum } from "../db/schema";

export const INTERVALLE_TAGE = [1, 3, 7, 16, 35] as const;

export type Bewertung = (typeof bewertungEnum.enumValues)[number];

// Nächste Intervallstufe (Index in INTERVALLE_TAGE) nach einer Bewertung.
// nicht_gewusst -> zurück auf Stufe 0 (morgen wieder). unsicher -> auf der
// aktuellen Stufe bleiben (bald wieder, aber nicht ganz zurückfallen).
// gewusst -> eine Stufe weiter (bis zum Maximum von 35 Tagen).
export function naechsteStufe(bewertung: Bewertung, aktuelleStufe: number): number {
  if (bewertung === "nicht_gewusst") return 0;
  if (bewertung === "unsicher") return aktuelleStufe;
  return Math.min(aktuelleStufe + 1, INTERVALLE_TAGE.length - 1);
}

export function faelligkeitFuer(stufe: number, von: Date = new Date()): Date {
  const tage = INTERVALLE_TAGE[stufe] ?? INTERVALLE_TAGE[0];
  const datum = new Date(von);
  datum.setDate(datum.getDate() + tage);
  return datum;
}
