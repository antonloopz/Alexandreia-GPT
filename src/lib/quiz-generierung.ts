// src/lib/quiz-generierung.ts
//
// Vierter Pipeline-Schritt: leitet aus den bereits geprüften Kernaussagen
// eines Buchinhalts Multiple-Choice-Quizfragen ab. Kein Web-Recherche-
// Bedarf (reine Ableitung aus bereits verifiziertem Text) und bewusst OHNE
// eigene KI-Prüfung — die inhaltliche Richtigkeit wurde schon in Abschnitt
// "Entwurf"+"Prüfung" abgesichert, hier zählt nur noch strukturelle
// Validität (die programmatisch geprüft wird, kein weiterer API-Call).
//
// Nicht zwingend 1:1 zu den Kernaussagen — eine reichhaltige Kernaussage
// kann mehrere Quizfragen hervorbringen (siehe Konzept).
//
// 09/2026: ursprünglich leitete diese Datei (damals src/lib/lernkarten.ts)
// zusätzlich Lernkarten (Frage/Antwort) ab, aus denen ein eigener
// Bewertungsschritt nach den Kernaussagen die Wiederholung-Planung
// (repetitionselemente) speiste. Die Lernkarten wurden entfernt — das
// binäre Quiz-Ergebnis selbst treibt die Wiederholung jetzt direkt an
// (siehe app/quiz/[id]/actions.ts). Umbenannt + vereinfacht, keine
// inhaltliche Änderung an der Quizfragen-Ableitung selbst.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { buchinhalte, kernaussagen, quizfragen } from "../db/schema";
import { eq, asc } from "drizzle-orm";
import { jsonAusText } from "./json";

const MODELL = "claude-sonnet-5";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type AbleitungJSON = {
  eintraege: {
    kernaussage_index: number;
    quizfragen: {
      frage: string;
      optionen: string[];
      richtige_option_index: number;
    }[];
  }[];
};

export type QuizErgebnis = {
  quizfragenAnzahl: number;
  uebersprungen: string[]; // strukturell ungültige Einträge, mit Begründung
};

// Ein einzelner Versuch: ein Claude-Call + JSON-Parsing + strukturelle
// Validierung + Insert. Ausgelagert, damit erstelleQuizfragen() weiter
// unten bis zu zweimal aufrufen kann, ohne den kompletten Ablauf zu
// duplizieren.
async function versucheQuizfragen(
  titel: string,
  autor: string,
  alleKernaussagen: (typeof kernaussagen.$inferSelect)[],
  kernaussagenListe: string
): Promise<QuizErgebnis> {
  const systemPrompt = `Du leitest aus bereits geprüften Kernaussagen eines Buchs für Alexandreia Multiple-Choice-Quizfragen ab. Die inhaltliche Richtigkeit der Kernaussagen ist bereits abgesichert — deine Aufgabe ist reine Ableitung, keine neue Recherche.

Regeln:
- Pro Kernaussage mindestens eine Quizfrage. Bei besonders reichhaltigen Kernaussagen gerne mehrere — aber nicht künstlich aufblähen, nur wenn der Inhalt es hergibt.
- Quizfragen: genau 4 Antwortoptionen, plausible Distraktoren (keine offensichtlichen Unsinnsantworten), die Position der richtigen Antwort (richtige_option_index, 0-basiert) über die Fragen hinweg variieren, nicht immer an derselben Stelle.
- Sprache: Deutsch.
- Antworte NUR mit einem validen JSON-Objekt in genau diesem Format, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "eintraege": [
    {
      "kernaussage_index": number,
      "quizfragen": [{ "frage": string, "optionen": [string, string, string, string], "richtige_option_index": number }]
    }
  ]
}`;

  const message = await client.messages.create({
    model: MODELL,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}.\n\nKernaussagen:\n\n${kernaussagenListe}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Keine Textantwort vom Modell erhalten (stop_reason: ${message.stop_reason}).`);
  }

  const ableitung = jsonAusText(textBlock.text) as AbleitungJSON;

  let quizfragenAnzahl = 0;
  const uebersprungen: string[] = [];

  for (const eintrag of ableitung.eintraege) {
    const kernaussage = alleKernaussagen[eintrag.kernaussage_index];
    if (!kernaussage) {
      uebersprungen.push(`kernaussage_index ${eintrag.kernaussage_index} existiert nicht.`);
      continue;
    }

    for (const q of eintrag.quizfragen) {
      if (
        !q.frage?.trim() ||
        !Array.isArray(q.optionen) ||
        q.optionen.length !== 4 ||
        q.optionen.some((o) => !o?.trim()) ||
        q.richtige_option_index < 0 ||
        q.richtige_option_index > 3
      ) {
        uebersprungen.push(
          `Strukturell ungültige Quizfrage bei Kernaussage ${eintrag.kernaussage_index} übersprungen: "${q.frage}"`
        );
        continue;
      }
      await db.insert(quizfragen).values({
        kernaussageId: kernaussage.id,
        frage: q.frage,
        optionen: q.optionen,
        richtigeOptionIndex: q.richtige_option_index,
      });
      quizfragenAnzahl++;
    }
  }

  return { quizfragenAnzahl, uebersprungen };
}

export async function erstelleQuizfragen(
  buchinhaltId: string,
  titel: string,
  autor: string
): Promise<QuizErgebnis> {
  const alleKernaussagen = await db
    .select()
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId))
    .orderBy(asc(kernaussagen.reihenfolge));

  if (alleKernaussagen.length === 0) {
    throw new Error(`Keine Kernaussagen für Buchinhalt ${buchinhaltId} gefunden.`);
  }

  const kernaussagenListe = alleKernaussagen
    .map((k, i) => `${i}. ${k.text}\n   ${k.erklaerung}`)
    .join("\n\n");

  let ergebnis = await versucheQuizfragen(titel, autor, alleKernaussagen, kernaussagenListe);

  // Ein einzelner Claude-Call kann legitim (ohne dass etwas "kaputt" ist)
  // eine leere oder komplett strukturell ungültige Ableitung zurückgeben —
  // das ist kein Bug, sondern eine spec-abweichende Modellantwort, die
  // gelegentlich vorkommt. Ein automatischer zweiter, unabhängiger Versuch
  // (neuer API-Call, kein Wiederverwenden der ersten Antwort) räumt die
  // meisten dieser Fälle ohne manuelles Eingreifen aus dem Weg. Bleibt es
  // auch beim zweiten Versuch bei 0, ist das selten genug, dass wir nicht
  // endlos weiter retryen, sondern nur noch laut loggen und abbrechen.
  if (!(ergebnis.quizfragenAnzahl > 0)) {
    console.warn(
      `[quiz-generierung] Erster Versuch für Buchinhalt ${buchinhaltId} ("${titel}") ergab ${ergebnis.quizfragenAnzahl} Quizfragen — starte automatischen zweiten Versuch. Übersprungen: ${
        ergebnis.uebersprungen.length > 0 ? ergebnis.uebersprungen.join(" | ") : "leere eintraege-Liste"
      }`
    );

    const zweiterVersuch = await versucheQuizfragen(titel, autor, alleKernaussagen, kernaussagenListe);

    ergebnis = {
      quizfragenAnzahl: ergebnis.quizfragenAnzahl + zweiterVersuch.quizfragenAnzahl,
      uebersprungen: [...ergebnis.uebersprungen, ...zweiterVersuch.uebersprungen],
    };
  }

  const { quizfragenAnzahl, uebersprungen } = ergebnis;

  // Buchinhalt-Lebenszyklus: "geprueft" (Entwurf+Prüfung bestanden) wird erst
  // jetzt, wo auch Quizfragen existieren, zu "im_vorrat" — DAS ist der
  // Status, den Home/Vorschlag als "wirklich zeigbar" zählen.
  if (quizfragenAnzahl > 0) {
    await db
      .update(buchinhalte)
      .set({ status: "im_vorrat" })
      .where(eq(buchinhalte.id, buchinhaltId));
  } else {
    // Auch nach dem eingebauten Retry keine verwertbare Ableitung — bleibt
    // absichtlich bei "geprueft" stehen (siehe Kommentar oben), aber das
    // soll nicht stillschweigend passieren: greppbar in den Vercel-Logs,
    // damit so ein Fall auffällt, ohne dass jemand den Response-Body
    // mitgeschnitten haben muss.
    console.error(
      `[quiz-generierung] Feststeckend: Buchinhalt ${buchinhaltId} ("${titel}" von ${autor}) bleibt bei Status "geprueft" — auch nach zwei Versuchen nur ${quizfragenAnzahl} Quizfragen. Übersprungen: ${
        uebersprungen.length > 0 ? uebersprungen.join(" | ") : "leere eintraege-Liste"
      }`
    );
  }

  return { quizfragenAnzahl, uebersprungen };
}
