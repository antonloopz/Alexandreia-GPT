// src/lib/darstellung.ts
//
// Reine Formatierungs-Helfer für die Umfangsangabe eines Buchs (Original-
// Seitenzahl via Open Library + Wortanzahl der generierten Zusammenfassung).
// Vorher in app/bookshelf/page.tsx dupliziert, jetzt auch von Home
// (app/page.tsx) genutzt (09/2026, Pendenz "Startseite umbauen").

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
