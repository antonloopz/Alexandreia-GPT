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
});

export const repetitionselemente = pgTable("repetitionselemente", {
  id: uuid().primaryKey().defaultRandom(),
  kontoId: uuid()
    .notNull()
    .references(() => konten.id),
  kernaussageId: uuid()
    .notNull()
    .references(() => kernaussagen.id),
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
  text: text().notNull(),
  obsidianExportiertAm: timestamp({ mode: "date" }),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const kontoeinstellungen = pgTable("kontoeinstellungen", {
  kontoId: uuid()
    .primaryKey()
    .references(() => konten.id),
  obsidianVaultName: text(),
  obsidianExportAktiv: boolean().notNull().default(true),
  ankiExportAktiv: boolean().notNull().default(false),
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

export const repetitionselementeRelations = relations(repetitionselemente, ({ one }) => ({
  konto: one(konten, { fields: [repetitionselemente.kontoId], references: [konten.id] }),
  kernaussage: one(kernaussagen, {
    fields: [repetitionselemente.kernaussageId],
    references: [kernaussagen.id],
  }),
}));
