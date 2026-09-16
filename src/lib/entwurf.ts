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

// Gemeinsame Zusammenfassungs-Regel für entwurfErstellen() UND
// zusammenfassungNeuErstellen() (Nachzieh-Lauf über bereits produzierte
// Bücher, siehe unten) — an einer Stelle gepflegt, damit beide Prompts nie
// auseinanderlaufen.
const ZUSAMMENFASSUNG_REGEL =
  'Zusammenfassung: ausführlich und vertiefend, KEIN knapper Überblick oder ' +
  'Klappentext-Stil. Ziel ist, dass Leser:innen die zentralen Gedankengänge ' +
  'wirklich nachvollziehen, nicht nur ihren Titel kennen. Sachbücher/Ratgeber/' +
  'Philosophie/Wissenschaft: typischerweise 1800–3200 Wörter, gegliedert in ' +
  '3–6 mit "## Zwischentitel" betitelte Abschnitte, die je einen ' +
  'Argumentationsstrang, ein zentrales Konzept oder Experiment vertiefen ' +
  '(konkrete Beispiele/Studien/Begriffe benennen, nicht nur andeuten). ' +
  'Erzählende Werke (Romane, literarische Klassiker): volle Nacherzählung von ' +
  'Handlung, Figuren und Motiven, typischerweise 1000–1800 Wörter, ab ca. 400 ' +
  'Wörtern ebenfalls mit Zwischentiteln gliedern. Diese Bandbreiten sind ' +
  'Richtwerte, keine harte Grenze — ein Werk mit besonders viel Substanz darf ' +
  'auch länger ausfallen.';

// Bug 09/2026: bei aktiver Websuche hat das Modell teils seine interne
// Zitations-Markierung (z.B. `<cite index="12-3">...</cite>`) wörtlich in
// JSON-Textfelder mitgeschrieben, sichtbar bis in die App-Zusammenfassung.
// Diese Regel weist das Modell explizit an, das zu lassen; gesamtText()
// unten entfernt trotzdem zusätzlich per Regex jeden verbliebenen Rest
// (Absicherung, falls sich das Modell nicht immer daran hält).
const KEINE_ZITATIONS_TAGS_REGEL =
  'Schreibe reine Prosa ohne technische Zitations-Markierungen aus der ' +
  'Websuche (z.B. keine <cite>-Tags) — Quellenbelege fliessen inhaltlich in ' +
  'den Text ein, nie als HTML-ähnliches Markup.';

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

// Extrahiert den GESAMTEN Textanteil der Modellantwort — nicht nur den
// letzten Textblock (frühere Version, Bug 09/2026). Bei aktiver Websuche
// kann Claude seine Antwort in mehrere separate "text"-Blöcke aufteilen,
// unterbrochen von tool_use/tool_result-Blöcken (z.B. eine weitere Suche
// NACH dem eigentlichen JSON, gefolgt von ein paar abschliessenden Sätzen
// in einem neuen Textblock). Wer dann nur den letzten Block nimmt, bekommt
// bloss diesen kurzen, mitten im Satz beginnenden Rest — das JSON selbst
// steckte längst in einem früheren Block. Das sah lange wie ein
// Escaping-Bug in json.ts aus (die Vorschau im Parse-Fehler begann exakt
// mit so einem Satzfragment, z.B. ". Genau darin liegt…"), war aber dieser
// Architekturfehler hier: alle Textblöcke in Ankunftsreihenfolge
// aneinanderzuhängen ergibt wieder den vollständigen, zusammenhängenden
// Text (bei nur einem Block ist das ein No-Op, ändert also nichts an
// bisher schon funktionierenden Fällen).
async function gesamtText(message: Anthropic.Message): Promise<string> {
  const textBloecke = message.content.filter(
    (b): b is Extract<Anthropic.Message["content"][number], { type: "text" }> => b.type === "text"
  );
  if (textBloecke.length === 0) {
    throw new Error(
      `Keine Textantwort vom Modell erhalten (stop_reason: ${message.stop_reason}). ` +
        `Häufigste Ursache: max_tokens zu knapp bemessen für die Websuche-Ergebnisse — ` +
        `Antwort bricht vor der finalen JSON-Ausgabe ab.`
    );
  }
  const text = textBloecke.map((b) => b.text).join("");
  // Siehe KEINE_ZITATIONS_TAGS_REGEL oben — hier die Absicherung, falls das
  // Modell trotz Prompt-Anweisung doch ein <cite ...>...</cite> (oder einen
  // verwaisten <cite .../>-Rest) in einem Textfeld hinterlässt.
  return text.replace(/<cite[^>]*>[\s\S]*?<\/cite>/gi, "").replace(/<\/?cite\b[^>]*>/gi, "");
}

// Kernaussagen passen nicht bei jeder Kategorie gleich gut — ein Sach-/
// Ratgeberbuch hat oft klare, eigenständige Thesen, eine Biografie oder ein
// erzählendes Werk eher prägende Wendepunkte bzw. zentrale Motive statt
// Thesen (09/2026, Pendenz "Kernaussagen-Funktion überdenken: passt nicht
// für alle Kategorien"). Statt die Kategorie hart einer eigenen
// Datenstruktur zuzuordnen, bekommt das Modell hier nur eine andere
// Anleitung, WELCHE ART von Kernaussage zu dieser Kategorie passt — Schema
// (text + erklaerung) und Anzahl-Logik ("wie viele das Werk hergibt")
// bleiben für alle Kategorien identisch, nur der Inhalt passt sich an.
function kernaussagenAnleitung(kategorie: string): string {
  switch (kategorie) {
    case "biografie_memoir":
    case "geschichte":
      return (
        'Kernaussagen: die prägendsten Wendepunkte, Entscheidungen oder Erkenntnisse aus ' +
        'diesem Leben/dieser Epoche — KEINE erzwungenen abstrakten Thesen, wenn das Werk ' +
        'selbst keine liefert. "text": der Wendepunkt/die Entscheidung kurz benannt, ' +
        '"erklaerung": warum er/sie prägend war bzw. was daraus folgte. So viele wie das ' +
        'Werk tatsächlich hergibt (keine Zielzahl) — bei einer Biografie/Chronik ist eine ' +
        'kleinere Anzahl als bei einem Sachbuch normal und in Ordnung.'
      );
    case "literatur_klassiker":
      return (
        'Kernaussagen: die zentralen Themen/Motive des Werks — nicht wörtliche Thesen, da ' +
        'fiktional. "text": das Motiv/Thema kurz benannt, "erklaerung": wie es sich im ' +
        'Werk zeigt und warum es bedeutsam ist. So viele wie das Werk tatsächlich hergibt ' +
        '(keine Zielzahl).'
      );
    default:
      return (
        'Kernaussagen: so viele wie das Buch tatsächlich hergibt (keine Zielzahl), jede ' +
        'mit kurzem Thesentitel ("text") und erklärendem Fliesstext ("erklaerung") — echte ' +
        'inhaltliche Thesen/Erkenntnisse des Buchs, keine blossen Kapitelüberschriften.'
      );
  }
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
- ${ZUSAMMENFASSUNG_REGEL}
- ${KEINE_ZITATIONS_TAGS_REGEL}
- ${kernaussagenAnleitung(kategorie)}
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
    max_tokens: 16000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}. Kategorie: ${kategorie}. Originalsprache: ${originalsprache}.`,
      },
    ],
  });

  const text = await gesamtText(message);
  const entwurf = jsonAusText(text) as EntwurfJSON;
  pruefeEntwurfVollstaendigkeit(entwurf);
  return entwurf;
}

// Zusätzlich zur reinen JSON-Gültigkeit (siehe json.ts) hier eine inhaltliche
// Mindestprüfung: gültiges JSON ohne die erwarteten, nicht-leeren Felder
// würde sonst entweder an der DB-NOT-NULL-Regel mit einer kryptischen
// Fehlermeldung scheitern (zusammenfassung/entstehungsgeschichte) oder —
// schlimmer — als leerer, aber technisch gültiger Bucheintrag durchrutschen,
// falls das Modell z.B. "" statt eines echten Texts liefert. Lieber hier
// laut und klar scheitern, bevor überhaupt in die Datenbank geschrieben wird.
function pruefeEntwurfVollstaendigkeit(entwurf: EntwurfJSON): void {
  const fehlend: string[] = [];
  if (!entwurf.zusammenfassung?.trim()) fehlend.push("zusammenfassung");
  if (!entwurf.entstehungsgeschichte?.trim()) fehlend.push("entstehungsgeschichte");
  if (!Array.isArray(entwurf.kernaussagen) || entwurf.kernaussagen.length === 0) {
    fehlend.push("kernaussagen");
  } else if (entwurf.kernaussagen.some((k) => !k.text?.trim() || !k.erklaerung?.trim())) {
    fehlend.push("kernaussagen[].text/erklaerung");
  }
  if (fehlend.length > 0) {
    throw new Error(
      `Entwurf-Antwort unvollständig oder leer, fehlende Felder: ${fehlend.join(", ")}.`
    );
  }
}

// Regeneriert NUR die Zusammenfassung eines bereits vorhandenen Buchinhalts,
// mit derselben (09/2026 verschärften) Ausführlichkeits-Regel wie
// entwurfErstellen() oben — für den Nachzieh-Lauf über bereits produzierte
// Bücher (siehe src/scripts/zusammenfassungen-regenerieren.ts). Rührt
// bewusst NUR die Zusammenfassung an, nicht Entstehungsgeschichte/
// Autorenhintergrund/Kernzitat/Kernaussagen — sonst wären Lernkarten,
// Quizfragen und der Wiederholungs-Fortschritt, die an den bestehenden
// Kernaussagen hängen, unnötig gefährdet.
export async function zusammenfassungNeuErstellen(
  titel: string,
  autor: string,
  kategorie: string,
  originalsprache: string
): Promise<{ zusammenfassung: string; vertrauenshinweis: Vertrauenshinweis }> {
  const systemPrompt = `Du schreibst für Alexandreia die Zusammenfassung eines Buchs neu — ausführlicher und vertiefender als eine bisherige, zu knappe Fassung. Zielsprache für den Text ist Deutsch, unabhängig von der Originalsprache des Werks. Nutze die Web-Suche, um Inhalt und Argumentation abzusichern.

Regeln:
- ${ZUSAMMENFASSUNG_REGEL}
- ${KEINE_ZITATIONS_TAGS_REGEL}
- Vertrauenshinweis: "verifiziert" (durch Recherche bestätigt) oder "eingeordnet" (plausibel eingeschätzt, aber nicht wortgetreu geprüft).
- Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "zusammenfassung": string,
  "vertrauenshinweis": "verifiziert" | "eingeordnet"
}`;

  const message = await client.messages.create({
    model: MODELL,
    max_tokens: 12000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}. Kategorie: ${kategorie}. Originalsprache: ${originalsprache}.`,
      },
    ],
  });

  const text = await gesamtText(message);
  const ergebnis = jsonAusText(text) as { zusammenfassung: string; vertrauenshinweis: Vertrauenshinweis };

  if (!ergebnis.zusammenfassung?.trim()) {
    throw new Error(`Neue Zusammenfassung für "${titel}" leer oder ungültig.`);
  }

  return ergebnis;
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
- Ist die Zusammenfassung ausführlich und vertiefend genug (siehe Vorgabe im Entwurf: mehrere Abschnitte, konkrete Beispiele/Argumentationsstränge — keine knappe Überblicks- oder Klappentext-Fassung)? Zu kurz und oberflächlich ist ein Fehler. "Aufgebläht" gilt nur bei echten Wiederholungen oder Füllstoff ohne Substanz — reine Ausführlichkeit ist kein Mangel.
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

  const text = await gesamtText(message);
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
