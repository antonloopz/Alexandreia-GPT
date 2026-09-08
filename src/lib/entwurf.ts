// src/lib/entwurf.ts
//
// Zweiter und dritter Pipeline-Schritt (Konzept: "Entwurf" + "Prüfung"):
// die KI erstellt für einen vorgeschlagenen Buchkandidaten einen Entwurf
// des Buchinhalts (mit aktiver Web-Recherche zur Absicherung), prüft
// diesen Entwurf danach selbst kritisch — und nur bei bestandener Prüfung
// landet er als Buchinhalt (Status "geprueft") in der Datenbank. Nicht
// bestandene Prüfung => verwerfen, kein Teil-Ergebnis übernehmen (siehe
// Konzept: "Verwerfen + Neugenerierung", nicht "mit niedrigerem
// Vertrauenshinweis übernehmen").
//
// Kostet echte API-Aufrufe (Claude Sonnet 5 + Web-Suche) — bewusst nicht
// automatisch aus vorschlag.ts heraus aufgerufen, sondern über das
// Testskript einzeln pro Buch angestossen.

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { buecher, buchinhalte, kernaussagen } from "../db/schema";
import { eq } from "drizzle-orm";
import { jsonAusText } from "./json";

const MODELL = "claude-sonnet-5";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Vertrauenshinweis = "verifiziert" | "eingeordnet";

type EntwurfJSON = {
  zusammenfassung: string;
  entstehungsgeschichte: string;
  autorenhintergrund: string | null;
  kernzitat_original: string | null;
  kernzitat_uebersetzung: string | null;
  kernaussagen: { text: string; erklaerung: string }[];
  vertrauenshinweise: {
    zusammenfassung: Vertrauenshinweis;
    entstehungsgeschichte: Vertrauenshinweis;
    autorenhintergrund: Vertrauenshinweis;
    kernzitat: Vertrauenshinweis | null;
  };
};

type PruefungJSON = {
  bestanden: boolean;
  probleme: string[];
};

async function letzterTextblock(message: Anthropic.Message): Promise<string> {
  const textBloecke = message.content.filter((b) => b.type === "text");
  const letzter = textBloecke[textBloecke.length - 1];
  if (!letzter || letzter.type !== "text") {
    throw new Error(
      `Keine Textantwort vom Modell erhalten (stop_reason: ${message.stop_reason}). ` +
        `Häufigste Ursache: max_tokens zu knapp bemessen für die Websuche-Ergebnisse — ` +
        `Antwort bricht vor der finalen JSON-Ausgabe ab.`
    );
  }
  return letzter.text;
}

export async function entwurfErstellen(
  titel: string,
  autor: string,
  kategorie: string,
  originalsprache: string
): Promise<EntwurfJSON> {
  const kernzitatErlaubt = kategorie === "literatur_klassiker";

  const systemPrompt = `Du erstellst Inhalte für Alexandreia, eine App, die täglich ein Buch mit Zusammenfassung, erklärten Kernaussagen, Entstehungsgeschichte und optional Autorenhintergrund vorstellt. Zielsprache für den gesamten Text ist Deutsch, unabhängig von der Originalsprache des Werks.

Nutze die Web-Suche aktiv, um Fakten (Entstehungsjahr, Kontext, ggf. Zitat) abzusichern, statt nur aus vorhandenem Wissen zu arbeiten.

Regeln:
- Zusammenfassungslänge richtet sich am Inhalt aus, keine feste Vorgabe — bei längeren Zusammenfassungen mit "## Zwischentitel" in Absätze gliedern statt einem durchgehenden Block.
- Kernaussagen: so viele wie das Buch tatsächlich hergibt (keine Zielzahl), jede mit kurzem Thesentitel (text) und erklärendem Fliesstext (erklaerung).
- Kernzitat: ${kernzitatErlaubt ? "dieses Werk ist ein literarischer Klassiker — liefere ein kulturell verankertes, wortgetreues Kernzitat in der Originalsprache UND in deutscher Übersetzung. Prüfe Wortlaut und Übersetzung gegen mindestens eine verlässliche Quelle und bleib bei EINER Schreibweise/Transliteration des Originaltitels, auch wenn mehrere kursieren." : "dieses Werk ist kein literarischer Klassiker — kernzitat_original und kernzitat_uebersetzung müssen null sein."}
- Für jedes Feld (zusammenfassung, entstehungsgeschichte, autorenhintergrund, kernzitat) einen Vertrauenshinweis: "verifiziert" (durch Recherche bestätigt) oder "eingeordnet" (plausibel eingeschätzt, aber nicht wortgetreu geprüft). WICHTIG: gibt es kein Kernzitat (kernzitat_original/kernzitat_uebersetzung = null), dann MUSS vertrauenshinweise.kernzitat ebenfalls null sein — niemals "verifiziert" oder "eingeordnet" für ein nicht vorhandenes Zitat.
- Antworte NUR mit einem validen JSON-Objekt in genau diesem Format, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "zusammenfassung": string,
  "entstehungsgeschichte": string,
  "autorenhintergrund": string | null,
  "kernzitat_original": string | null,
  "kernzitat_uebersetzung": string | null,
  "kernaussagen": [{ "text": string, "erklaerung": string }],
  "vertrauenshinweise": {
    "zusammenfassung": "verifiziert" | "eingeordnet",
    "entstehungsgeschichte": "verifiziert" | "eingeordnet",
    "autorenhintergrund": "verifiziert" | "eingeordnet",
    "kernzitat": "verifiziert" | "eingeordnet" | null
  }
}`;

  const message = await client.messages.create({
    model: MODELL,
    max_tokens: 12000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}. Kategorie: ${kategorie}. Originalsprache: ${originalsprache}.`,
      },
    ],
  });

  const text = await letzterTextblock(message);
  return jsonAusText(text) as EntwurfJSON;
}

export async function entwurfPruefen(
  titel: string,
  autor: string,
  entwurf: EntwurfJSON
): Promise<PruefungJSON> {
  const systemPrompt = `Du prüfst kritisch einen KI-generierten Buchinhalt-Entwurf für Alexandreia, bevor er live geht. Nutze die Web-Suche, um Fakten und ein eventuelles Zitat gegenzuprüfen.

Prüfkriterien:
- Ist ein eventuelles Kernzitat wortgetreu korrekt (Originalsprache + Übersetzung)?
- Sind historische/biografische Angaben (Entstehungsjahr, Kontext, Autorenfakten) korrekt?
- Ist der Text in sich kohärent und widerspruchsfrei (z.B. einheitliche Schreibweise von Titeln/Namen über alle Felder hinweg)?
- Ist die Länge der Zusammenfassung dem Inhalt angemessen (weder unnötig gekürzt noch aufgebläht)?
- Ist vertrauenshinweise.kernzitat null, wenn kein Kernzitat vorhanden ist (kernzitat_original/kernzitat_uebersetzung = null)? Ein Vertrauenshinweis für ein nicht vorhandenes Zitat ist ein Fehler.

Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "bestanden": boolean,
  "probleme": string[]
}

"probleme" ist eine leere Liste, wenn "bestanden" true ist. Sei streng — im Zweifel "bestanden": false.`;

  const message = await client.messages.create({
    model: MODELL,
    max_tokens: 6000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}.\n\nEntwurf (JSON):\n${JSON.stringify(entwurf, null, 2)}`,
      },
    ],
  });

  const text = await letzterTextblock(message);
  return jsonAusText(text) as PruefungJSON;
}

export type PipelineErgebnis =
  | { status: "gespeichert"; buchinhaltId: string; anzahlKernaussagen: number }
  | { status: "verworfen"; probleme: string[] };

export async function pipelineSchritt(buchId: string): Promise<PipelineErgebnis> {
  const [buch] = await db.select().from(buecher).where(eq(buecher.id, buchId));
  if (!buch) throw new Error(`Buch ${buchId} nicht gefunden.`);

  const entwurf = await entwurfErstellen(
    buch.titel,
    buch.autor,
    buch.kategorie,
    buch.originalsprache
  );

  const pruefung = await entwurfPruefen(buch.titel, buch.autor, entwurf);

  if (!pruefung.bestanden) {
    return { status: "verworfen", probleme: pruefung.probleme };
  }

  const [buchinhalt] = await db
    .insert(buchinhalte)
    .values({
      buchId: buch.id,
      zusammenfassung: entwurf.zusammenfassung,
      entstehungsgeschichte: entwurf.entstehungsgeschichte,
      autorenhintergrund: entwurf.autorenhintergrund ?? undefined,
      kernzitatOriginal: entwurf.kernzitat_original ?? undefined,
      kernzitatUebersetzung: entwurf.kernzitat_uebersetzung ?? undefined,
      status: "geprueft",
      vertrauenshinweise: entwurf.vertrauenshinweise,
    })
    .returning();

  for (let i = 0; i < entwurf.kernaussagen.length; i++) {
    const k = entwurf.kernaussagen[i];
    await db.insert(kernaussagen).values({
      buchinhaltId: buchinhalt.id,
      text: k.text,
      erklaerung: k.erklaerung,
      reihenfolge: i,
    });
  }

  return {
    status: "gespeichert",
    buchinhaltId: buchinhalt.id,
    anzahlKernaussagen: entwurf.kernaussagen.length,
  };
}
