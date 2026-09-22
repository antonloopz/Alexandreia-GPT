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
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Einordnungs-Block eines Buchinhalts (09/2026, Pendenz "Einordnungs-Block:
// Autorenposition, Evidenz, Interpretation trennen"). umfang "voll" bei
// Sachbuch-Kategorien (Argument/Beleg/Annahme/Schwachstelle + heute),
// "nur_heute" bei Literatur/Biografie/Geschichte (siehe
// src/lib/kategorieprofile.ts). heute ist null, wenn kein Urteil mit Quelle
// aus der Websuche belegt werden konnte — lieber weglassen als raten.
export type EinordnungUrteil = "belegt" | "umstritten" | "ueberholt" | "weiterhin_relevant";
export type Einordnung = {
  umfang: "voll" | "nur_heute";
  zentralesArgument: string | null;
  staerksterBeleg: string | null;
  zentraleAnnahme: string | null;
  offeneSchwachstelle: string | null;
  heute: {
    urteil: EinordnungUrteil;
    begruendung: string;
    quellen: { titel: string; url: string }[];
  } | null;
};

// Wissensstatus einer einzelnen Kernaussage (09/2026, Schicht
// "Wissensstatus" — siehe CLAUDE.md, Inhaltliches Grundprinzip): was die
// heutige Forschung zu genau dieser Aussage sagt. Ein Buch kann in Teilen
// gut belegt und in anderen überholt sein (z.B. Thinking, Fast and Slow:
// Prospect Theory vs. Priming). Nur mit Quelle gespeichert, sonst null.
export type WissensstatusWert = "belegt" | "umstritten" | "ueberholt" | "unklar";
export type Wissensstatus = {
  status: WissensstatusWert;
  begruendung: string;
  quellen: { titel: string; url: string }[];
};

// Protokoll der Prüfung (Stufe 2, 09/2026): welche Korrekturen die Prüfung
// vorgenommen hat und ob sie sich anwenden liessen. Macht nachvollziehbar,
// was die KI am Entwurf geändert hat (Transparenz zum epistemischen Status)
// und ist die Grundlage für eine spätere Pipeline-Anzeige.
export type Pruefprotokoll = {
  versuche: number;
  korrekturen: { feld: string; alt: string; neu: string; grund: string | null; angewendet: boolean }[];
  hinweise: string[];
  zuletztGeprueftAm: string;
};

// "Das bleibt hängen" auf dem Abschluss-Screen (09/2026, Pendenz
// "Abschlussansicht 'Das bleibt hängen'"): die 3 wichtigsten Ideen des
// Buchs + 1 offene Frage, in der Pipeline mit erzeugt.
export type BleibtHaengen = { ideen: string[]; offeneFrage: string };

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
  // 09/2026 (Pendenz "Technologie/Technik als 11. Hauptkategorie") —
  // danach bewusst keine weiteren Hauptkategorien, feinere Differenzierung
  // läuft über Tags.
  "technologie_technik",
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

// Wie wertvoll ein gelesenes Buch INHALTLICH war (09/2026, Buch-Bewertung
// Phase 1) — siehe gezeigteBuecher.buchBewertung. Bewusst nur drei Stufen.
export const buchBewertungEnum = pgEnum("buch_bewertung", [
  "schwach",
  "solide",
  "stark",
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
  // Open-Library-Werk-Referenz (z.B. "/works/OL12345W") — seit 09/2026
  // automatisch von sicherstelleBuchinfos() befüllt (lib/buchinfos.ts),
  // ursprünglich für Disambiguierung beim Wunschlisten-Abgleich vorgesehen.
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
  // Weitere Buchinfos (09/2026, Pendenz "Automatische Ergänzung von Infos
  // in der Wunschliste") — analog umfang/umfangGeprueftAm über Open Library
  // nachgeschlagen und gecacht, siehe lib/buchinfos.ts. Klappentext/
  // Beschreibung kommt (falls vorhanden) über die Open-Library-Works-API,
  // die übrigen Felder direkt aus dem Suchtreffer.
  beschreibung: text(),
  verlag: text(),
  erscheinungsjahr: integer(),
  // Coverbild-URL (Pendenz "prüfen ob Coverbilder möglich sind") — Open
  // Library stellt Cover kostenlos & ohne API-Key über eine feste
  // Bild-URL bereit (https://covers.openlibrary.org/b/id/<cover_i>-L.jpg),
  // sobald ein Suchtreffer ein cover_i liefert.
  coverUrl: text(),
  // Negativ-Cache für obige Felder, unabhängig von umfangGeprueftAm (eigener
  // Zeitpunkt, weil ein anderer API-Aufruf/andere Felder) — analog
  // umfangGeprueftAm, verhindert wiederholtes Nachschlagen ohne Treffer.
  buchinfosGeprueftAm: timestamp({ mode: "date" }),
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
  // Beide nullable: Buchinhalte von vor 09/2026 haben sie (noch) nicht —
  // die Screens blenden die Abschnitte dann einfach aus. Nachziehen über
  // src/scripts/ergaenzungen-nachziehen.ts.
  einordnung: jsonb().$type<Einordnung>(),
  bleibtHaengen: jsonb().$type<BleibtHaengen>(),
  pruefprotokoll: jsonb().$type<Pruefprotokoll>(),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const kernaussagen = pgTable("kernaussagen", {
  id: uuid().primaryKey().defaultRandom(),
  buchinhaltId: uuid()
    .notNull()
    .references(() => buchinhalte.id),
  text: text().notNull(),
  erklaerung: text().notNull(),
  // Konkretes Beispiel zur Kernaussage (09/2026, Pendenz "Aufbereitung:
  // kategorieabhängige Prompts") — Studie, Szene, Episode oder Anwendung je
  // nach Kategorie. Nullable: ältere Kernaussagen haben keins.
  beispiel: text(),
  // Siehe Typ Wissensstatus oben. Nullable: ohne belegte Quelle, bei
  // Literatur (Themen/Motive haben keinen Forschungsstand) und bei älteren
  // Kernaussagen.
  wissensstatus: jsonb().$type<Wissensstatus>(),
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

// Tags (09/2026, Pendenz "Autotags zu Notizen und Büchern") — feinere
// Einteilung unterhalb der 11 Hauptkategorien und Grundlage für die
// spätere Vernetzung über gemeinsame Konzepte. Vokabular wächst mit der
// Bibliothek: das Modell verwendet bevorzugt bestehende Tags und legt nur
// bei Bedarf neue an; lib/tags.ts gleicht neue Vorschläge über slug und
// aliase mit dem Bestand ab ("stoische Philosophie" → "Stoizismus"), damit
// keine Dubletten statt Verbindungen entstehen. Tags hängen am BUCH (nicht
// am Buchinhalt) — sie überleben so eine Neu-Aufbereitung. Notizen erben
// die Tags ihres Buchs (Entscheid 21.09.2026), keine eigene Tabelle.
export const tags = pgTable("tags", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  // Normalisierter Schlüssel (klein, ohne Akzente/Satzzeichen) — eindeutig.
  slug: text().notNull().unique(),
  // Weitere Schreibweisen/Synonyme als slugs, die auf diesen Tag zeigen.
  aliase: jsonb().$type<string[]>().notNull().default([]),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const buchTags = pgTable(
  "buch_tags",
  {
    buchId: uuid()
      .notNull()
      .references(() => buecher.id),
    tagId: uuid()
      .notNull()
      .references(() => tags.id),
  },
  (t) => [unique("buch_tags_buch_tag_key").on(t.buchId, t.tagId)]
);

// Welche Kernaussage zu welchem Konzept (Tag) gehört (09/2026, Pendenz
// "Vernetzung") — Grundlage der Konzept-Seite app/konzepte/[tag], die die
// Kernaussagen mehrerer Bücher zu einem Konzept nebeneinanderstellt. Das
// Modell ordnet jeder Kernaussage 0–2 der Tags IHRES Buchs zu
// (lib/tags.ts kernaussagenZuordnen). onDelete cascade auf beiden Seiten:
// werden Kernaussagen neu erzeugt (kernaussagen-regenerieren.ts) oder Tags
// zusammengeführt/gelöscht, verschwinden die Zuordnungen mit.
export const kernaussageTags = pgTable(
  "kernaussage_tags",
  {
    kernaussageId: uuid()
      .notNull()
      .references(() => kernaussagen.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [unique("kernaussage_tags_kernaussage_tag_key").on(t.kernaussageId, t.tagId)]
);

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
  // Wer den Eintrag angelegt hat (09/2026, Pendenz "Wunschliste: Markierung
  // ob Vorschlag von Claude oder Eintrag vom Nutzer") — "eigene_liste" für
  // jeden über das "+"-Formular selbst hinzugefügten Eintrag (Default,
  // deckt auch alle bisherigen Zeilen ab); klassiker/geheimtipp/synergie,
  // wenn recherche.ts das Buch selbst vorgeschlagen und angelegt hat.
  // Solche KI-Vorschläge werden vom Cron-Job NICHT automatisch produziert
  // (siehe app/api/cron/produzieren/route.ts) — sie warten hier, bis der
  // Nutzer selbst "Aufbereiten" klickt oder sie "bald"-priorisiert.
  herkunft: quelleEnum().notNull().default("eigene_liste"),
  erstelltAm: timestamp({ mode: "date" }).defaultNow().notNull(),
});

export const gezeigteBuecher = pgTable(
  "gezeigte_buecher",
  {
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
    // Buch-Feedback (09/2026, Buch-Bewertung Phase 1), gesetzt auf dem
    // Abschluss-Screen (app/abschluss/[id]/BuchBewertung.tsx, änderbar bei
    // jedem erneuten Besuch). Drei BEWUSST getrennte Angaben, weil "war das
    // Buch für mich wertvoll?" und "war die Aufbereitung gut?" verschiedene
    // Fragen sind: buchBewertung = Wert des Buchs selbst (null = noch nicht
    // bewertet); imOriginalLesen = Buch vollständig lesen wollen (ergibt
    // die Leseliste); aufbereitungSchwach = Aufbereitung (Zusammenfassung/
    // Kernaussagen/Quiz) später neu erzeugen. Hier statt in einer eigenen
    // Tabelle, weil diese Zeile dank des unique-Constraints unten schon
    // genau einmal je (Konto, Buchinhalt) existiert.
    buchBewertung: buchBewertungEnum(),
    imOriginalLesen: boolean().notNull().default(false),
    aufbereitungSchwach: boolean().notNull().default(false),
    // Erneuter Durchgang (09/2026, Pendenz "Gelesene Bücher wieder in den
    // Lauf aufnehmen"). Ein zweites "Zeigen" als neue Zeile verbietet der
    // unique-Constraint unten — deshalb wird DIESE Zeile umgewidmet:
    // - wiederImLaufSeit: gesetzt = Buch ist wieder im Lauf (Tagesauswahl-
    //   Kandidat bzw. zweiter Durchgang offen, in der Bibliothek unter
    //   "Bereit"). Geleert beim erneuten Abschluss oder "Aus dem Lauf".
    // - erneutGezeigtAm: Tag, an dem der neue Durchgang begann (Tagesauswahl
    //   oder direktes Öffnen, siehe sicherstelleGezeigt) — null, solange es
    //   noch wartet. datumGezeigt bleibt bewusst das ERSTE Zeigedatum
    //   (Historie, Streak).
    // - durchgaenge: abgeschlossene Durchgänge (1 = einmal gelesen).
    // abgeschlossenAm/Quiz-Ergebnis bleiben während des neuen Durchgangs
    // stehen (Entscheid 22.09.2026: bisheriger Durchgang bleibt gezählt) und
    // werden erst beim erneuten Abschluss überschrieben.
    wiederImLaufSeit: timestamp({ mode: "date" }),
    erneutGezeigtAm: date({ mode: "date" }),
    durchgaenge: integer().notNull().default(1),
  },
  (t) => [
    // Ein Buch wird einem Konto nur einmal "gezeigt" (Bug-Fix 09/2026,
    // Race Condition: naechstesBuchFuerHeute() und die Lesen-Seite konnten
    // beide gleichzeitig sicherstelleGezeigt() aufrufen — ohne Constraint
    // entstanden dabei zwei Zeilen fürs selbe Buch, weil der vorherige
    // SELECT-dann-INSERT-Ablauf die Race Condition nicht verhindern konnte).
    // sicherstelleGezeigt() (lib/tagesbuch.ts) verlässt sich jetzt auf genau
    // diesen Constraint (INSERT ... ON CONFLICT DO NOTHING). BEWUSST KEIN
    // zusätzliches unique je (kontoId, datumGezeigt) — an einem Tag können
    // mehrere "Bereit"-Bücher direkt geöffnet werden (app/lesen/[id]/
    // page.tsx), das ist gewolltes Verhalten, kein Bug.
    unique("gezeigte_buecher_konto_buchinhalt_key").on(t.kontoId, t.buchinhaltId),
  ]
);

export const repetitionselemente = pgTable(
  "repetitionselemente",
  {
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
  },
  (t) => [
    // Pro Konto höchstens EINE Zeile je Kernaussage bzw. je Notiz (09/2026,
    // Pendenz "Unique-Constraint auf repetitionselemente") — gleiche
    // Fehlerklasse wie bei gezeigteBuecher: das frühere SELECT-dann-INSERT
    // konnte bei zwei fast gleichzeitigen Bewertungen Duplikate anlegen. Die
    // Schreiblogik (lib/bewertung-speichern.ts, app/wiederholung/actions.ts,
    // app/notizen/actions.ts) verlässt sich jetzt auf diese Constraints
    // (ON CONFLICT). NULL zählt in Postgres als verschieden, deshalb stören
    // sich die Notiz-Zeilen (kernaussageId null) und Kernaussage-Zeilen
    // (notizId null) gegenseitig nicht. Vor dem push Duplikate bereinigen:
    // src/db/dedupe-repetitionselemente-2026-09-21.ts.
    unique("repetitionselemente_konto_kernaussage_key").on(t.kontoId, t.kernaussageId),
    unique("repetitionselemente_konto_notiz_key").on(t.kontoId, t.notizId),
  ]
);

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
