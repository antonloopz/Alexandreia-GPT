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
  | "kernzitat_uebersetzung"
  // Kernaussagen-Screen (09/2026, Pendenz "Hervorhebungen auch auf
  // Kernaussagen erlauben") — zwei Varianten wie bei kernzitat_original/
  // -uebersetzung: die kurze Aussage selbst und ihre Erklärung sind
  // getrennt markierbar.
  | "kernaussage_text"
  | "kernaussage_erklaerung";

export const FELD_LABEL: Record<NotizFeld, string> = {
  zusammenfassung: "Zusammenfassung",
  entstehungsgeschichte: "Entstehungsgeschichte",
  autorenhintergrund: "Autor",
  kernzitat_original: "Kernzitat",
  kernzitat_uebersetzung: "Kernzitat",
  kernaussage_text: "Kernaussage",
  kernaussage_erklaerung: "Kernaussage",
};
