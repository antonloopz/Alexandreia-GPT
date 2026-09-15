// src/lib/buchdetails.ts
//
// Automatische Ergänzung von Autor und Originalsprache beim Hinzufügen
// zur Wunschliste (09/2026, Pendenz "Doublettenerkennung + automatische
// Ergänzung von Buchdetails") — nutzt dieselbe kostenlose Open Library
// Search API wie umfang.ts (kein API-Key, kein Claude-Aufruf), nur wenn
// der Nutzer das jeweilige Feld leer gelassen hat (siehe
// buecherliste/neu/actions.ts). Best-Effort: liefert null-Felder bei
// fehlendem Treffer statt zu raten — blockiert das Hinzufügen nie.

import { openLibraryDokumente } from "./umfang";

// Nur die häufigsten Sprachcodes (ISO 639-2/B, wie Open Library sie in
// language[] liefert) — reicht für den ganz überwiegenden Teil der
// Wunschliste; ein unbekannter Code bleibt einfach unausgefüllt statt
// eine falsche Vermutung anzuzeigen.
const SPRACHE_LABEL: Record<string, string> = {
  eng: "Englisch",
  deu: "Deutsch",
  ger: "Deutsch",
  fre: "Französisch",
  fra: "Französisch",
  spa: "Spanisch",
  ita: "Italienisch",
  por: "Portugiesisch",
  rus: "Russisch",
  chi: "Chinesisch",
  zho: "Chinesisch",
  jpn: "Japanisch",
  kor: "Koreanisch",
  heb: "Hebräisch",
  lat: "Latein",
  grc: "Griechisch",
  gre: "Griechisch",
  ara: "Arabisch",
  dut: "Niederländisch",
  nld: "Niederländisch",
  swe: "Schwedisch",
  nor: "Norwegisch",
  dan: "Dänisch",
  pol: "Polnisch",
  tur: "Türkisch",
  ces: "Tschechisch",
  hun: "Ungarisch",
};

export async function buchdetailsErgaenzen(
  titel: string
): Promise<{ autor: string | null; originalsprache: string | null }> {
  const docs = await openLibraryDokumente(titel, "", "title,author_name,language", 5);

  const autor = docs.find((d) => d.author_name && d.author_name.length > 0)?.author_name?.[0] ?? null;
  const sprachCode = docs.find((d) => d.language && d.language.length > 0)?.language?.[0];
  const originalsprache = sprachCode ? SPRACHE_LABEL[sprachCode] ?? null : null;

  return { autor, originalsprache };
}
