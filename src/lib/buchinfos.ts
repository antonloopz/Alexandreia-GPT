// src/lib/buchinfos.ts
//
// Automatische Ergänzung von Buchinfos (Beschreibung/Klappentext, Verlag,
// Erscheinungsjahr, Coverbild) für Wunschlisten-Einträge (09/2026, Pendenz
// "Automatische Ergänzung von Infos in der Wunschliste") — analog
// lib/umfang.ts über die kostenlose Open Library API (kein API-Key, kein
// Claude-Aufruf), damit sowohl neu hinzugefügte als auch längst bestehende
// Bücher automatisch befüllt werden, sobald die Wunschliste das nächste Mal
// gerendert wird (siehe sicherstelleBuchinfos() unten, aufgerufen aus
// app/buecherliste/page.tsx). Best-Effort: liefert null-Felder bei
// fehlendem Treffer statt zu raten — blockiert nie.
//
// Coverbild (Pendenz "prüfen ob Coverbilder möglich sind"): Open Library
// liefert für einen Suchtreffer optional ein cover_i (numerische Cover-ID),
// aus der sich eine feste, öffentliche Bild-URL bauen lässt — kein
// zusätzlicher API-Aufruf nötig.
//
// Beschreibung/Klappentext steht (falls vorhanden) NICHT im Suchtreffer,
// sondern erst auf der Open-Library-Works-Seite (ein Werk kann mehrere
// Editionen haben) — deshalb bei Treffer mit `key` ein zweiter Aufruf gegen
// die Works-API.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { buecher } from "../db/schema";
import { openLibraryDokumente, type OpenLibraryDoc } from "./umfang";

type OpenLibraryDocErweitert = OpenLibraryDoc & {
  first_publish_year?: number;
  publisher?: string[];
  cover_i?: number;
  key?: string;
};

export type Buchinfos = {
  beschreibung: string | null;
  verlag: string | null;
  erscheinungsjahr: number | null;
  coverUrl: string | null;
  externeReferenz: string | null;
};

const LEERE_BUCHINFOS: Buchinfos = {
  beschreibung: null,
  verlag: null,
  erscheinungsjahr: null,
  coverUrl: null,
  externeReferenz: null,
};

async function buchinfosSuchen(titel: string, autor: string): Promise<OpenLibraryDocErweitert | null> {
  const docs = (await openLibraryDokumente(
    titel,
    autor,
    "title,author_name,first_publish_year,publisher,cover_i,key",
    5
  )) as OpenLibraryDocErweitert[];
  return (
    docs.find((d) => d.first_publish_year || (d.publisher && d.publisher.length > 0) || d.cover_i || d.key) ?? null
  );
}

async function beschreibungNachschlagen(workKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://openlibrary.org${workKey}.json`, {
      headers: { "User-Agent": "Alexandreia/1.0 (privates Buchprojekt)" },
    });
    if (!res.ok) {
      console.error(`[beschreibungNachschlagen] HTTP ${res.status} für "${workKey}".`);
      return null;
    }
    const data = (await res.json()) as { description?: string | { value?: string } };
    if (!data.description) return null;
    return typeof data.description === "string" ? data.description : data.description.value ?? null;
  } catch (err) {
    console.error(`[beschreibungNachschlagen] Fehler für "${workKey}":`, err);
    return null;
  }
}

export async function buchinfosNachschlagen(titel: string, autor: string): Promise<Buchinfos> {
  const treffer = (autor ? await buchinfosSuchen(titel, autor) : null) ?? (await buchinfosSuchen(titel, ""));

  if (!treffer) {
    console.log(`[buchinfosNachschlagen] Kein Treffer für "${titel}"${autor ? ` von ${autor}` : ""}.`);
    return LEERE_BUCHINFOS;
  }

  const erscheinungsjahr = treffer.first_publish_year ?? null;
  const verlag = treffer.publisher?.[0] ?? null;
  const coverUrl = treffer.cover_i ? `https://covers.openlibrary.org/b/id/${treffer.cover_i}-L.jpg` : null;
  const externeReferenz = treffer.key ?? null;
  const beschreibung = externeReferenz ? await beschreibungNachschlagen(externeReferenz) : null;

  return { beschreibung, verlag, erscheinungsjahr, coverUrl, externeReferenz };
}

// Liefert die Buchinfos zurück und persistiert sie (Cache-Writeback) — analog
// sicherstelleUmfang() in lib/umfang.ts, aber mit EIGENEM Negativ-Cache-
// Zeitstempel (buchinfosGeprueftAm), weil es ein anderer API-Aufruf mit
// anderen Feldern ist. Rückgabewert wird vom aufrufenden after()-Hintergrund-
// Job aktuell nicht verwendet (die Seite zeigt den neuen Stand erst beim
// nächsten Aufruf), bleibt aber für spätere synchrone Nutzung (z.B. direkt
// beim Hinzufügen) verfügbar.
export async function sicherstelleBuchinfos(
  buchId: string,
  titel: string,
  autor: string,
  buchinfosGeprueftAm: Date | null | undefined
): Promise<Buchinfos | null> {
  if (buchinfosGeprueftAm) return null;
  const gefunden = await buchinfosNachschlagen(titel, autor);
  await db
    .update(buecher)
    .set({ ...gefunden, buchinfosGeprueftAm: new Date() })
    .where(eq(buecher.id, buchId));
  return gefunden;
}
