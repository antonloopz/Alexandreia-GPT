// src/lib/lernkarten.ts
//
// Vierter Pipeline-Schritt: leitet aus den bereits geprüften Kernaussagen
// eines Buchinhalts Lernkarten (Frage/Antwort) und Multiple-Choice-
// Quizfragen ab. Kein Web-Recherche-Bedarf (reine Ableitung aus bereits
// verifiziertem Text) und bewusst OHNE eigene KI-Prüfung — die inhaltliche
// Richtigkeit wurde schon in Abschnitt "Entwurf"+"Prüfung" abgesichert,
// hier zählt nur noch strukturelle Validität (die programmatisch geprüft
// wird, kein weiterer API-Call).
//
// Nicht zwingend 1:1 zu den Kernaussagen — eine reichhaltige Kernaussage
// kann mehrere Karten/Fragen hervorbringen (siehe Konzept).

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { buchinhalte, kernaussagen, lernkarten, quizfragen } from "../db/schema";
import { eq, asc } from "drizzle-orm";
import { jsonAusText } from "./json";

const MODELL = "claude-sonnet-5";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type AbleitungJSON = {
  eintraege: {
    kernaussage_index: number;
    lernkarten: { frage: string; antwort: string }[];
    quizfragen: {
      frage: string;
      optionen: string[];
      richtige_option_index: number;
    }[];
  }[];
};

export type LernkartenErgebnis = {
  lernkartenAnzahl: number;
  quizfragenAnzahl: number;
  uebersprungen: string[]; // strukturell ungültige Einträge, mit Begründung
};

export async function erstelleLernkartenUndQuiz(
  buchinhaltId: string,
  titel: string,
  autor: string
): Promise<LernkartenErgebnis> {
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

  const systemPrompt = `Du leitest aus bereits geprüften Kernaussagen eines Buchs für Alexandreia Lernkarten und Multiple-Choice-Quizfragen ab. Die inhaltliche Richtigkeit der Kernaussagen ist bereits abgesichert — deine Aufgabe ist reine Ableitung, keine neue Recherche.

Regeln:
- Pro Kernaussage mindestens eine Lernkarte und mindestens eine Quizfrage. Bei besonders reichhaltigen Kernaussagen gerne mehrere — aber nicht künstlich aufblähen, nur wenn der Inhalt es hergibt.
- Lernkarten: kurze, präzise Frage (frage) mit vollständiger, eigenständig verständlicher Antwort (antwort).
- Quizfragen: genau 4 Antwortoptionen, plausible Distraktoren (keine offensichtlichen Unsinnsantworten), die Position der richtigen Antwort (richtige_option_index, 0-basiert) über die Fragen hinweg variieren, nicht immer an derselben Stelle.
- Sprache: Deutsch.
- Antworte NUR mit einem validen JSON-Objekt in genau diesem Format, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "eintraege": [
    {
      "kernaussage_index": number,
      "lernkarten": [{ "frage": string, "antwort": string }],
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

  let lernkartenAnzahl = 0;
  let quizfragenAnzahl = 0;
  const uebersprungen: string[] = [];

  for (const eintrag of ableitung.eintraege) {
    const kernaussage = alleKernaussagen[eintrag.kernaussage_index];
    if (!kernaussage) {
      uebersprungen.push(`kernaussage_index ${eintrag.kernaussage_index} existiert nicht.`);
      continue;
    }

    for (const lk of eintrag.lernkarten) {
      if (!lk.frage?.trim() || !lk.antwort?.trim()) {
        uebersprungen.push(`Leere Lernkarte bei Kernaussage ${eintrag.kernaussage_index} übersprungen.`);
        continue;
      }
      await db.insert(lernkarten).values({
        kernaussageId: kernaussage.id,
        frage: lk.frage,
        antwort: lk.antwort,
      });
      lernkartenAnzahl++;
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

  // Buchinhalt-Lebenszyklus: "geprueft" (Entwurf+Prüfung bestanden) wird erst
  // jetzt, wo auch Lernkarten+Quiz existieren, zu "im_vorrat" — DAS ist der
  // Status, den Home/Vorschlag als "wirklich zeigbar" zählen.
  if (lernkartenAnzahl > 0 && quizfragenAnzahl > 0) {
    await db
      .update(buchinhalte)
      .set({ status: "im_vorrat" })
      .where(eq(buchinhalte.id, buchinhaltId));
  }

  return { lernkartenAnzahl, quizfragenAnzahl, uebersprungen };
}
