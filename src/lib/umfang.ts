// src/lib/umfang.ts
//
// Grobe Umfangsangabe (Seitenzahl) für ein Buch, über die kostenlose
// Open Library Search API — bewusst KEIN Claude-Aufruf (keine Websuche-
// Kosten), damit jeder Vorschlag (auch aus der Wunschliste) diese Info
// bekommen kann, ohne die Recherche-Pipeline zu belasten. Kein API-Key
// nötig. Best-Effort: liefert null bei Netzwerkfehler, fehlendem Treffer
// oder fehlender Seitenzahl — darf einen Vorschlag nie blockieren.
//
// HINWEIS: ursprünglich mit der Google Books API gebaut, die aber für
// unauthentifizierte Anfragen ein Tageskontingent von 0 hat (Stand
// 09/2026) — deshalb Wechsel auf Open Library.
//
// FALLBACK (09/2026, "praktisch bei allen Büchern fehlt der Umfang"):
// Titel+Autor als EIN Suchfilter ist zu strikt, sobald die Autoren-
// Schreibweise nicht exakt zu Open Librarys Katalogisierung passt (z.B.
// "Mark Aurel" vs. "Marcus Aurelius", "Fjodor Dostojewski" vs. "Fyodor
// Dostoevsky") — dann liefert die Suche null Dokumente, statt nur keine
// Seitenzahl. Deshalb zuerst mit Titel+Autor versuchen, bei keinem Treffer
// zusätzlich nur mit dem Titel (ohne Autor-Filter) — der erste brauchbare
// Treffer (mit Seitenzahl) gewinnt.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { buecher } from "../db/schema";

export type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  number_of_pages_median?: number;
  language?: string[];
};

// Gemeinsamer Open-Library-Suchaufruf (09/2026, Pendenz "Doubletten-
// erkennung + automatische Ergänzung von Buchdetails") — vorher hier fest
// auf die Seitenzahl-Felder verdrahtet, jetzt mit wählbaren `felder`, damit
// src/lib/buchdetails.ts (Autor/Sprache nachschlagen) dieselbe Anfrage-
// Logik samt Fehlerbehandlung nutzen kann, statt sie zu duplizieren.
//
// Rückgabe: die gefundenen Dokumente, ODER null bei einem ECHTEN
// Fehlschlag (Netzwerkfehler, Timeout, Nicht-200-Status) — UNTERSCHIEDEN
// von einer erfolgreichen Anfrage ohne Treffer ([]), damit Aufrufer mit
// eigenem Negativ-Cache (z.B. sicherstelleBuchinfos() in lib/buchinfos.ts)
// einen echten Fehlschlag nicht fälschlich als "kein Treffer" dauerhaft
// cachen (Bug 09/2026: nach dem ersten — evtl. gedrosselten — Seitenaufbau
// bekam praktisch KEIN Buch mehr eine Chance, jemals Buchinfos zu
// bekommen, weil der Negativ-Cache-Zeitstempel bei JEDEM Fehlschlag
// genauso gesetzt wurde wie bei einem echten "kein Treffer"). Die
// bestehenden Aufrufer hier (umfangNachschlagen, buchdetailsErgaenzen)
// behandeln null weiterhin wie [] — für sie ändert sich nichts, sie
// setzen ja keinen eigenen Negativ-Cache-Zeitstempel abhängig vom Ergebnis
// dieser Funktion.
export async function openLibraryDokumente(
  titel: string,
  autor: string,
  felder = "title,author_name,number_of_pages_median",
  limit = 5
): Promise<OpenLibraryDoc[] | null> {
  try {
    const params = new URLSearchParams({ title: titel, fields: felder, limit: String(limit) });
    if (autor) params.set("author", autor);

    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { headers: { "User-Agent": "Alexandreia/1.0 (privates Buchprojekt)" } });

    if (!res.ok) {
      console.error(
        `[openLibraryDokumente] HTTP ${res.status} für "${titel}"${autor ? ` von ${autor}` : ""}:`,
        await res.text()
      );
      return null;
    }

    const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
    return data.docs ?? [];
  } catch (err) {
    console.error(`[openLibraryDokumente] Fehler für "${titel}"${autor ? ` von ${autor}` : ""}:`, err);
    return null;
  }
}

async function seitenzahlSuchen(titel: string, autor: string): Promise<number | null> {
  const docs = (await openLibraryDokumente(titel, autor, "title,author_name,number_of_pages_median")) ?? [];
  const treffer = docs.find(
    (doc) => typeof doc.number_of_pages_median === "number" && doc.number_of_pages_median > 0
  );

  if (!treffer?.number_of_pages_median) {
    // Legitimer, erwarteter Fall (z.B. unregelmässig editierte
    // Mehrbänder) — trotzdem geloggt, damit sich bei Bedarf nachvollziehen
    // lässt, ob es an fehlenden Seitenzahl-Daten liegt (Dokumente
    // gefunden, aber ohne number_of_pages_median) oder an keinerlei Treffer.
    console.log(
      `[umfangNachschlagen] Kein Seitenzahl-Treffer für "${titel}"${autor ? ` von ${autor}` : ""} ` +
        `(${docs.length} Dokument(e) gefunden).`
    );
    return null;
  }

  return treffer.number_of_pages_median;
}

export async function umfangNachschlagen(titel: string, autor: string): Promise<string | null> {
  const seitenzahl =
    (autor ? await seitenzahlSuchen(titel, autor) : null) ?? (await seitenzahlSuchen(titel, ""));
  if (!seitenzahl) return null;
  return `${seitenzahl} Seiten`;
}
// Liefert den vorhandenen Umfang zurück, oder schlägt ihn nach und
// persistiert ihn (Cache-Writeback, damit derselbe Titel nicht bei jedem
// Aufruf erneut nachgeschlagen wird). Von vorschlaege() für jeden
// gewählten Kandidaten genutzt UND von den Bücherlisten-Screens (Wunsch-
// liste, Bibliothek) für alle angezeigten Einträge, nicht nur die
// aktuell vorgeschlagenen — sonst bekämen nur die paar gerade knappen
// Kategorien je eine Umfangsangabe.
//
// umfangGeprueftAm ist der Negativ-Cache (Bug-Fix 09/2026): ohne ihn wurde
// ein Buch OHNE Open-Library-Treffer (z.B. keine Katalogisierung) bei
// JEDEM Aufruf erneut angefragt, weil nur ERFOLGREICHE Treffer gecacht
// wurden — bei vielen nicht katalogisierten Wunschlisten-Einträgen machte
// das den Seitenaufbau spürbar langsam. Ist der Zeitstempel gesetzt, wurde
// bereits (mindestens einmal) erfolglos nachgeschlagen — kein erneuter
// Versuch.
export async function sicherstelleUmfang(
  buchId: string,
  titel: string,
  autor: string,
  vorhandenerUmfang: string | null | undefined,
  umfangGeprueftAm: Date | null | undefined
): Promise<string | null> {
  if (vorhandenerUmfang) return vorhandenerUmfang;
  if (umfangGeprueftAm) return null;
  const gefunden = await umfangNachschlagen(titel, autor);
  await db
    .update(buecher)
    .set({ umfang: gefunden, umfangGeprueftAm: new Date() })
    .where(eq(buecher.id, buchId));
  return gefunden;
}
