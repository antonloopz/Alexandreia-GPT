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

import { eq } from "drizzle-orm";
import { db } from "../db";
import { buecher } from "../db/schema";

type OpenLibraryDoc = {
  number_of_pages_median?: number;
};

export async function umfangNachschlagen(titel: string, autor: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      title: titel,
      author: autor,
      fields: "title,author_name,number_of_pages_median",
      limit: "5",
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { headers: { "User-Agent": "Alexandreia/1.0 (privates Buchprojekt)" } });

    if (!res.ok) {
      console.error(`[umfangNachschlagen] HTTP ${res.status} für "${titel}" von ${autor}:`, await res.text());
      return null;
    }

    const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
    const treffer = data.docs?.find(
      (doc) => typeof doc.number_of_pages_median === "number" && doc.number_of_pages_median > 0
    );

    // Kein Median-Wert für dieses Werk (z.B. unregelmässig editierte
    // Mehrbänder) — legitimer, erwarteter Fall, kein Fehler.
    if (!treffer?.number_of_pages_median) return null;

    return `${treffer.number_of_pages_median} Seiten`;
  } catch (err) {
    console.error("[umfangNachschlagen] Fehler für", `"${titel}" von ${autor}:`, err);
    return null;
  }
}
// Liefert den vorhandenen Umfang zurück, oder schlägt ihn nach und
// persistiert ihn (Cache-Writeback, damit derselbe Titel nicht bei jedem
// Aufruf erneut nachgeschlagen wird). Von vorschlaege() für jeden
// gewählten Kandidaten genutzt UND von den Bücherlisten-Screens (Wunsch-
// liste, Bibliothek) für alle angezeigten Einträge, nicht nur die
// aktuell vorgeschlagenen — sonst bekämen nur die paar gerade knappen
// Kategorien je eine Umfangsangabe.
export async function sicherstelleUmfang(
  buchId: string,
  titel: string,
  autor: string,
  vorhandenerUmfang: string | null | undefined
): Promise<string | null> {
  if (vorhandenerUmfang) return vorhandenerUmfang;
  const gefunden = await umfangNachschlagen(titel, autor);
  if (gefunden) {
    await db.update(buecher).set({ umfang: gefunden }).where(eq(buecher.id, buchId));
  }
  return gefunden;
}
