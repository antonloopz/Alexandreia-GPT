// src/lib/darstellung.ts
//
// Reine Formatierungs-Helfer für die Umfangsangabe eines Buchs (Original-
// Seitenzahl via Open Library + Wortanzahl der generierten Zusammenfassung).
// Vorher in app/bookshelf/page.tsx dupliziert, jetzt auch von Home
// (app/page.tsx) genutzt (09/2026, Pendenz "Startseite umbauen").
//
// relativesDatum() (09/2026, Pendenz "Hinzugefügt-Datum bei 'Bereit'-
// Büchern") — dasselbe relative Format, das "Gelesen" in bookshelf/page.tsx
// schon länger fürs Abschlussdatum nutzt, hier verallgemeinert und auch von
// Home (Weiterlesen-Liste) genutzt.

export function wortanzahl(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

// Kombiniert Umfang Original (Seitenangabe, via Open Library — siehe
// buecher.umfang) und Umfang Zusammenfassung (Wortanzahl des generierten
// Texts) zu einer Zeile, z.B. "412 Seiten · Zusammenfassung 1833 Wörter".
// Beides ist optional (Original-Umfang manchmal nicht auffindbar,
// Zusammenfassung theoretisch leer) — nur vorhandene Teile werden gezeigt.
export function umfangZeileAusWortanzahl(umfangOriginal: string | null, anzahlWoerter: number): string | null {
  const teile = [umfangOriginal, anzahlWoerter > 0 ? `Zusammenfassung ${anzahlWoerter} Wörter` : null].filter(
    (t): t is string => Boolean(t)
  );
  return teile.length > 0 ? teile.join(" · ") : null;
}

// Bequemlichkeits-Variante, wenn (wie in bookshelf/page.tsx) noch der volle
// Zusammenfassungs-Text vorliegt statt einer bereits vorgerechneten Wortzahl.
export function umfangZeileAusText(umfangOriginal: string | null, zusammenfassung: string): string | null {
  return umfangZeileAusWortanzahl(umfangOriginal, wortanzahl(zusammenfassung));
}


// Relatives Datum für Anzeigezwecke: "heute"/"gestern" für die letzten
// zwei Tage, "vor N Tagen" bis zu einer Woche zurück, danach ein festes
// Datum (z.B. "3. Sept.") — ab da ist die genaue Tageszahl ohnehin
// aussagekräftiger als "vor 12 Tagen". Vergleicht Kalendertage, nicht
// volle 24h-Blöcke (sonst würde ein um 23 Uhr produziertes Buch schon nach
// einer Stunde als "gestern" statt "heute" erscheinen).
export function relativesDatum(datum: Date): string {
  const heute = new Date();
  const mitternachtHeute = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  const mitternachtDatum = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  const tageDiff = Math.round((mitternachtHeute.getTime() - mitternachtDatum.getTime()) / 86400000);
  if (tageDiff <= 0) return "heute";
  if (tageDiff === 1) return "gestern";
  if (tageDiff < 7) return `vor ${tageDiff} Tagen`;
  // Ab hier ein festes Datum statt "vor N Tagen" — bei einem Datum aus
  // einem VORHERIGEN Jahr zusätzlich die Jahreszahl anhängen (09/2026,
  // Pendenz "relativesDatum: Jahresangabe bei älteren Daten"), sonst ist
  // z.B. "3. Sept." bei älteren Büchern mehrdeutig (dieses Jahr oder eines
  // der Vorjahre?).
  const jahresangabeNoetig = datum.getFullYear() !== heute.getFullYear();
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: jahresangabeNoetig ? "numeric" : undefined,
  }).format(datum);
}