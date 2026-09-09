// src/lib/kategorieerkennung.ts
//
// Automatische Kategorie-Erkennung für ein neu zur Wunschliste
// hinzugefügtes Buch (Konzept sah das als Google-Books-/KI-Abgleich vor —
// siehe app/buecherliste/neu/actions.ts, wo das bisher als "noch nicht
// gebaut" dokumentiert war). Reiner Klassifikations-Aufruf OHNE Websuche
// (Claude kennt die allermeisten Buchtitel/Autoren bereits aus dem
// Training) — dadurch schnell und deutlich günstiger als entwurf.ts/
// recherche.ts. Best-Effort: liefert null bei Netzwerk-/Parse-Fehler oder
// wenn das Modell keinen der zehn Codes trifft, damit die Server Action
// dann auf die manuelle Auswahl zurückfallen kann statt einen falschen
// Wert zu erzwingen.

import Anthropic from "@anthropic-ai/sdk";
import { jsonAusText } from "./json";
import { KATEGORIE_LABEL } from "./kategorien";
import type { Kategorie } from "./vorschlag";

const MODELL = "claude-sonnet-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLE_KATEGORIEN = Object.keys(KATEGORIE_LABEL) as Kategorie[];

type ErkennungJSON = { kategorie: string };

async function letzterTextblock(message: Anthropic.Message): Promise<string> {
  const textBloecke = message.content.filter((b) => b.type === "text");
  const letzter = textBloecke[textBloecke.length - 1];
  if (!letzter || letzter.type !== "text") {
    throw new Error(`Keine Textantwort vom Modell erhalten (stop_reason: ${message.stop_reason}).`);
  }
  return letzter.text;
}

export async function kategorieErkennen(titel: string, autor: string): Promise<Kategorie | null> {
  try {
    const optionen = ALLE_KATEGORIEN.map((k) => `${k} (${KATEGORIE_LABEL[k]})`).join(", ");
    const message = await client.messages.create({
      model: MODELL,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            `Buch: "${titel}"${autor ? ` von ${autor}` : ""}.\n\n` +
            `Welcher dieser zehn Kategorie-Codes passt am besten? ${optionen}\n\n` +
            `Antworte NUR mit JSON, ohne Text davor oder danach: {"kategorie": "<einer der Codes>"}`,
        },
      ],
    });

    const text = await letzterTextblock(message);
    const geparst = jsonAusText(text) as ErkennungJSON;
    const kategorie = geparst.kategorie as Kategorie;

    if (!ALLE_KATEGORIEN.includes(kategorie)) {
      console.error(`[kategorieErkennen] Unbekannter Kategorie-Code "${geparst.kategorie}" für "${titel}"`);
      return null;
    }
    return kategorie;
  } catch (err) {
    console.error(`[kategorieErkennen] Fehler für "${titel}" von "${autor}":`, err);
    return null;
  }
}
