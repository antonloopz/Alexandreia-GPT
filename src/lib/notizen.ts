// src/lib/notizen.ts
//
// Gemeinsame Typen/Konstanten für die Notiz-/Highlight-Funktion (09/2026) —
// bewusst NICHT in app/notizen/actions.ts, da eine "use server"-Datei nur
// async-Funktionen exportieren darf (Build-Fehler: "A 'use server' file can
// only export async functions, found object" für FELD_LABEL).

export type NotizFeld =
  | "zusammenfassung"
  | "entstehungsgeschichte"
  | "autorenhintergrund"
  | "kernzitat_original"
  | "kernzitat_uebersetzung";

export const FELD_LABEL: Record<NotizFeld, string> = {
  zusammenfassung: "Zusammenfassung",
  entstehungsgeschichte: "Entstehungsgeschichte",
  autorenhintergrund: "Autor",
  kernzitat_original: "Kernzitat",
  kernzitat_uebersetzung: "Kernzitat",
};
