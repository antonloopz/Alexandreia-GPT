// src/db/schema.ts
//
// Datenschema für Alexandreia — folgt Konzeptdokument Abschnitt 11.
// Zwei Bereiche: geteilte Daten (der "Vorrat", einmal produziert) und
// kontobezogene Daten (pro Konto getrennt). Kontobezogen angelegt von
// Anfang an, auch wenn aktuell nur ein Konto existiert.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const kategorieEnum = pgEnum("kategorie", [
  "philosophie",
  "psychologie",
  "wirtschaft_business",
  "geschichte",
  "naturwissenschaft",
  "gesellschaft_politik",
  "biografie_memoir",
  "literatur_klassiker",
  "spiritualitaet_sinnfragen",
  "persoenliche_entwicklung",
]);

export const buchinhaltStatusEnum = pgEnum("buchinhalt_status", [
  "in_aufbereitung",
  "geprueft",
  "im_vorrat",
]);

export const quelleEnum = pgEnum("quelle", [
  "eigene_liste",
  "klassiker",
  "geheimtipp",
  "synergie",
]);

export const bewertungEnum = pgEnum("bewertung", [
  "nicht_gewusst",
  "unsicher",
  "gewusst",
]);

// Welches Textfeld einer buchinhalte-Zeile eine Hervorhebung betrifft (siehe
// notizen unten, Feature "Notiz-/Highlight-Funktion", 09/2026). Nur bei
// Hervorhebungen mit konkreter Textstelle gesetzt — eine freistehende Notiz
// (z.B. zu einer Kernaussage, ohne markierten Text) lässt es leer.
export const notizFeldEnum = pgEnum("notiz_feld", [
  "zusammenfassung",
  "entstehungsgeschichte",
  "autorenhintergrund",
  "kernzitat_original",
  "kernzitat_uebersetzung",
  // Hervorhebungen auf dem Kernaussagen-Screen (09/2026, Pendenz
  // "Hervorhebungen auch auf Kernaussagen erlauben") — zwei Varianten wie
  // bei kernzitat_original/-uebersetzung, da eine Kernaussage aus zwei
  // separat markierbaren Texten besteht (kurze Aussage + Erklärung).
  "kernaussage_text",
  "kernaussage_erklaerung",
]);

// ---------------------------------------------------------------------------
// Geteilt — der Vorrat
// ---------------------------------------------------------------------------

export const buecher = pgTable("buecher", {
  id: uuid().primaryKey().defaultRandom(),
  titel: text().notNull(),
  autor: text().notNull(),
  originalsprache: text().notNull(),
  kategorie: kategorieEnum().notNull(),
  // Google Books / Open Library ID oder URL, für Disambiguierung beim
  // Wunschlisten-Abgleich.
  externeReferenz: text(),
  // Nur gesetzt für recherchierte (nicht wunschlisten-basierte) Bücher —
  // legt fest, welche gezeigteBuecher.quelle beim tatsächlichen Zeigen
  // verwendet wird. null = aus der Wunschliste (immer "eigene_liste").
  herkunft: quelleEnum(),
  // Grobe Umfangsangabe (z.B. "412 Seiten"), per Google Books API
  // nachgeschlagen und einmalig gecacht — siehe lib/umfang.ts. null, bis
  // die erste Vorschlags-Anfrage sie nachgeschlagen (und gespeichert) hat,
  // oder wenn kein Treffer gefunden wurde.
  umfang: text(),
  // Zeitpunkt des letzten Nachschlage-VERSUCHS bei Open Library — UNABHÄNGIG
  // vom Ergebnis (siehe sicherstelleUmfang() in lib/umfang.ts). Verhindert,
  // dass ein Buch ohne Katalog-Treffer bei jedem erneuten Aufruf wieder
  // angefragt wird (Bug 09/2026: liess die Wunschliste bei vielen nicht
  // katalogisierten Büchern bei jedem Laden erneut alle nachschlagen). null
  // nur, solange noch NIE nachgeschlagen wurde.
  umfangGeprueftAm: timestamp({ mode: "date" }),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const buchinhalte = pgTable("buchinhalte", {
  id: uuid().primaryKey().defaultRandom(),
  buchId: uuid()
    .notNull()
    .references(() => buecher.id),
  zusammenfassung: text().notNull(),
  entstehungsgeschichte: text().notNull(),
  autorenhintergrund: text(),
  kernzitatOriginal: text(),
  kernzitatUebersetzung: text(),
  status: buchinhaltStatusEnum().notNull().default("in_aufbereitung"),
  // Vertrauenshinweis pro Feld. kernzitat ist explizit auch null zulässig
  // (Bücher ohne Kernzitat haben keinen Vertrauenshinweis dafür — siehe
  // entwurf.ts, dort wird das bewusst so erzwungen).
  vertrauenshinweise: jsonb().$type<{
    zusammenfassung: "verifiziert" | "eingeordnet";
    entstehungsgeschichte: "verifiziert" | "eingeordnet";
    autorenhintergrund: "verifiziert" | "eingeordnet";
    kernzitat: "verifiziert" | "eingeordnet" | null;
  }>(),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const kernaussagen = pgTable("kernaussagen", {
  id: uuid().primaryKey().defaultRandom(),
  buchinhaltId: uuid()
    .notNull()
    .references(() => buchinhalte.id),
  text: text().notNull(),
  erklaerung: text().notNull(),
  reihenfolge: integer().notNull(),
});

export const lernkarten = pgTable("lernkarten", {
  id: uuid().primaryKey().defaultRandom(),
  kernaussageId: uuid()
    .notNull()
    .references(() => kernaussagen.id),
  frage: text().notNull(),
  antwort: text().notNull(),
});

export const quizfragen = pgTable("quizfragen", {
  id: uuid().primaryKey().defaultRandom(),
  kernaussageId: uuid()
    .notNull()
    .references(() => kernaussagen.id),
  frage: text().notNull(),
  // 4 Antwortoptionen als Array, z.B. ["...", "...", "...", "..."]
  optionen: jsonb().$type<string[]>().notNull(),
  richtigeOptionIndex: integer().notNull(),
});

// ---------------------------------------------------------------------------
// Pro Konto
// ---------------------------------------------------------------------------

// Minimales Konto — Login/Einladung bewusst nicht gebaut (siehe Konzept),
// aber jede Zeile unten trägt schon einen konto_id-Bezug.
export const konten = pgTable("konten", {
  id: uuid().primaryKey().defaultRandom(),
  bezeichnung: text().notNull().default("Standard"),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const wunschlisteneintraege = pgTable("wunschlisteneintraege", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  // Erst Roh-Titel/Autor, bis der Datenbank-Abgleich ein `buch` gefunden hat
  rohTitel: text(),
  rohAutor: text(),
  buchId: uuid().references(() => buecher.id),
  notiz: text(),
  bald: boolean().notNull().default(false),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const gezeigteBuecher = pgTable("gezeigte_buecher", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  buchinhaltId: uuid()
    .notNull()
    .references(() => buchinhalte.id),
  datumGezeigt: date({ mode: "date" }).notNull(),
  quelle: quelleEnum().notNull(),
  // Gesetzt beim Erreichen von Abschluss (siehe app/abschluss/[id]/page.tsx)
  // — null solange das Buch noch nicht durchgearbeitet wurde. Home nutzt
  // das, um nach Abschluss nicht mehr das "heutige Buch" im Detail zu
  // zeigen, sondern einen kompakten "geschafft"-Zustand plus weitere,
  // bereits fertige Bücher zum Weiterlesen (siehe tagesbuch.ts).
  abgeschlossenAm: timestamp({ mode: "date" }),
  // Quiz-Ergebnis dieses Durchlaufs, einmalig zusammen mit abgeschlossenAm
  // gesetzt (siehe app/abschluss/[id]/page.tsx) — beide null, bis das Quiz
  // durchlaufen wurde. Fortschritt.tsx nutzt das für die Quiz-Trefferquote.
  quizRichtigAnzahl: integer(),
  quizGesamtAnzahl: integer(),
});

export const repetitionselemente = pgTable("repetitionselemente", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  // Genau eines von kernaussageId/notizId ist gesetzt: automatisch erzeugte
  // Lernkarten-Wiederholung (kernaussageId) ODER eine vom Nutzer selbst zur
  // Wiederholung hinzugefügte Hervorhebung/Notiz (notizId) — Pendenz
  // "Notizen/Hervorhebungen optional in die Wiederholung aufnehmen", 09/2026.
  // Beide nullable statt eines diskriminierenden Enums, da dasselbe Muster
  // bereits an anderer Stelle im Schema verwendet wird (z.B. notizen selbst).
  // onDelete cascade bei notizId, damit das Löschen einer Hervorhebung
  // (hervorhebungLoeschen) nicht an einer verbleibenden Wiederholungs-Zeile
  // scheitert.
  kernaussageId: uuid().references(() => kernaussagen.id),
  notizId: uuid().references(() => notizen.id, { onDelete: "cascade" }),
  naechsteFaelligkeit: date({ mode: "date" }).notNull(),
  // Index in die Intervallstufen 1/3/7/16/35 Tage
  intervallstufe: integer().notNull().default(0),
  letzteBewertung: bewertungEnum(),
  aktualisiertAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const notizen = pgTable("notizen", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  buchinhaltId: uuid().references(() => buchinhalte.id),
  kernaussageId: uuid().references(() => kernaussagen.id),
  // Welches Feld markiert wurde (siehe notizFeldEnum) — nur bei
  // Hervorhebungen gesetzt, nicht bei einer freistehenden Notiz.
  feld: notizFeldEnum(),
  // Die markierte Textstelle selbst, verbatim aus dem jeweiligen Feld —
  // nur bei Hervorhebungen gesetzt (Feature "Notiz-/Highlight-Funktion",
  // 09/2026: Text im Lesen-Screen markieren, optional mit Notiz).
  textAuszug: text(),
  // Die eigentliche Notiz. Optional bei einer reinen Hervorhebung ohne
  // Kommentar (dann null) — Pflicht inhaltlich bei einer freistehenden
  // Notiz ohne textAuszug, aber technisch trotzdem nullable, da beide
  // Fälle dieselbe Tabelle teilen.
  text: text(),
  obsidianExportiertAm: timestamp({ mode: "date" }),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const kontoeinstellungen = pgTable("kontoeinstellungen", {
  kontoId: uuid()
    .primaryKey()
    .references(() => konten.id),
  obsidianVaultName: text(),
  obsidianExportAktiv: boolean().notNull().default(true),
  // Optionale eigene Zielwerte pro Kategorie, überschreibt den Standard-Mix
  kategorieZielwerte: jsonb().$type<Record<string, number>>(),
});

// ---------------------------------------------------------------------------
// Relations (für komfortable `db.query...with` Joins)
// ---------------------------------------------------------------------------

export const buecherRelations = relations(buecher, ({ many }) => ({
  inhalte: many(buchinhalte),
}));

export const buchinhalteRelations = relations(buchinhalte, ({ one, many }) => ({
  buch: one(buecher, { fields: [buchinhalte.buchId], references: [buecher.id] }),
  kernaussagen: many(kernaussagen),
}));

export const kernaussagenRelations = relations(kernaussagen, ({ one, many }) => ({
  buchinhalt: one(buchinhalte, {
    fields: [kernaussagen.buchinhaltId],
    references: [buchinhalte.id],
  }),
  lernkarten: many(lernkarten),
  quizfragen: many(quizfragen),
  repetitionselemente: many(repetitionselemente),
}));

export const lernkartenRelations = relations(lernkarten, ({ one }) => ({
  kernaussage: one(kernaussagen, {
    fields: [lernkarten.kernaussageId],
    references: [kernaussagen.id],
  }),
}));

export const quizfragenRelations = relations(quizfragen, ({ one }) => ({
  kernaussage: one(kernaussagen, {
    fields: [quizfragen.kernaussageId],
    references: [kernaussagen.id],
  }),
}));

export const kontenRelations = relations(konten, ({ many, one }) => ({
  wunschliste: many(wunschlisteneintraege),
  gezeigteBuecher: many(gezeigteBuecher),
  repetitionselemente: many(repetitionselemente),
  notizen: many(notizen),
  einstellungen: one(kontoeinstellungen, {
    fields: [konten.id],
    references: [kontoeinstellungen.kontoId],
  }),
}));

// Event-Log für Quiz-Antworten (09/2026, Pendenz "Event-Log für
// Bewertungen/Quiz-Antworten (Fortschritt-Fix)") — löst den bisherigen
// Ansatz ab, bei dem gezeigteBuecher.quizRichtigAnzahl/quizGesamtAnzahl nur
// EIN Aggregat pro Buch speicherte (einmalig beim ersten Abschluss-Besuch
// gesetzt, siehe app/abschluss/[id]/page.tsx). Fortschritt.tsx bezog daraus
// die Quiz-Trefferquote — diese Tabelle protokolliert stattdessen JEDE
// einzelne Antwort als eigenes, unveränderliches Ereignis (eine Zeile pro
// beantworteter Frage, siehe app/quiz/[id]/actions.ts), inklusive
// wiederholter Durchläufe. gezeigteBuecher.quizRichtigAnzahl/
// quizGesamtAnzahl bleiben unverändert bestehen (Abschluss zeigt darüber
// weiterhin das Ergebnis DIESES einen Buchs) — nur Fortschritt liest jetzt
// von hier.
export const quizantworten = pgTable("quizantworten", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  buchinhaltId: uuid()
    .notNull()
    .references(() => buchinhalte.id),
  quizfrageId: uuid()
    .notNull()
    .references(() => quizfragen.id),
  richtig: boolean().notNull(),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

// Event-Log für Wiederholungs-Bewertungen (gleiche Pendenz wie oben) — löst
// den bisherigen Ansatz ab, bei dem Fortschritt.tsx für die Wochen-Balken
// nur repetitionselemente.aktualisiertAm zählte: dort wird pro Karte immer
// nur der LETZTE Bewertungszeitpunkt gespeichert (kein Verlauf), wodurch
// eine mehrfach in derselben Woche bewertete Karte untererfasst wurde. Diese
// Tabelle protokolliert stattdessen JEDE Bewertung als eigenes Ereignis,
// unabhängig vom aktuellen SRS-Zustand — die eigentliche Intervall-Logik
// (repetitionselemente.intervallstufe/naechsteFaelligkeit) bleibt
// unverändert, dies hier ist rein additiv für die Statistik.
export const bewertungsereignisse = pgTable("bewertungsereignisse", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  // Wie bei repetitionselemente: genau eines von kernaussageId/notizId ist
  // gesetzt, je nach Kartentyp.
  kernaussageId: uuid().references(() => kernaussagen.id),
  notizId: uuid().references(() => notizen.id, { onDelete: "cascade" }),
  bewertung: bewertungEnum().notNull(),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const repetitionselementeRelations = relations(repetitionselemente, ({ one }) => ({
  konto: one(konten, { fields: [repetitionselemente.kontoId], references: [konten.id] }),
  kernaussage: one(kernaussagen, {
    fields: [repetitionselemente.kernaussageId],
    references: [kernaussagen.id],
  }),
  notiz: one(notizen, {
    fields: [repetitionselemente.notizId],
    references: [notizen.id],
  }),
}));
