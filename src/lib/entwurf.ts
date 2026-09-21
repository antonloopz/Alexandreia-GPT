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
import {
  buecher,
  buchinhalte,
  kernaussagen,
  type BleibtHaengen,
  type Einordnung,
  type EinordnungUrteil,
  type Pruefprotokoll,
  type Wissensstatus,
  type WissensstatusWert,
} from "../db/schema";
import { asc, eq } from "drizzle-orm";
import { jsonAusText } from "./json";
import { erstelleMitFortsetzung } from "./anfrage";
import { kategorieProfil } from "./kategorieprofile";

const MODELL = "claude-sonnet-5";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Gemeinsame Zusammenfassungs-Regel für entwurfErstellen() UND
// zusammenfassungNeuErstellen() (Nachzieh-Lauf über bereits produzierte
// Bücher, siehe unten) — an einer Stelle gepflegt, damit beide Prompts nie
// auseinanderlaufen.
//
// 09/2026 (Pendenz "Zusammenfassung in drei Ebenen strukturieren"): statt
// eines einzigen, kapitelweise gegliederten Texts drei feste Ebenen, jede
// mit einer "# Überschrift" (erste Ebene) — "Worum geht es?" (2–4 Sätze),
// die Argumentationsstruktur des Autors und die ausführliche Darstellung.
// Bewusst weiterhin EIN Textfeld (buchinhalte.zusammenfassung), keine neuen
// Spalten: Hervorhebungen (notizen.textAuszug), Teaser und Wortanzahl
// funktionieren so unverändert weiter, alte Zusammenfassungen ohne "#"-
// Überschriften bleiben lesbar (siehe parseZusammenfassung() in
// app/lesen/[id]/page.tsx).
//
// Ebene 2 heisst je nach Kategorie anders — ein Roman hat keine
// "Argumentation" im Sinne eines Sachbuchs, eine Biografie eher tragende
// Zusammenhänge als eine These. Die Drei-Ebenen-Logik bleibt gleich, nur
// Titel und Anleitung passen sich an — beides kommt seit 09/2026 aus dem
// zentralen Kategorie-Profil (src/lib/kategorieprofile.ts).
//
// Trennung Autor/Alexandreia: alles ausserhalb markierter Einordnungs-
// Absätze gibt ausschliesslich die Position des Autors wieder. Eigene
// Deutung/Kritik steht nur in Absätzen mit dem Präfix "> Einordnung:", die
// der Lesen-Screen optisch abgesetzt darstellt. Belegte Urteile wie
// "umstritten"/"überholt" sind NICHT Teil dieser Regel (Pendenz
// "Einordnungs-Block") — hier nur der dafür vorgesehene Platz.
const EINORDNUNG_PRAEFIX = "> Einordnung:";

// Grundsatz (Entscheid 21.09.2026, siehe CLAUDE.md "Inhaltliches
// Grundprinzip"): die KI darf komprimieren, aber nie den epistemischen
// Status einer Information verändern. Gilt für Entwurf (Stufe 1), wird in
// der Prüfung (Stufe 2) kontrolliert und gilt auch für Stufe 3.
const EPISTEMIK_REGEL =
  'Du darfst Informationen verdichten, aber nie ihren epistemischen Status verändern. Vorbehalte ' +
  'des Autors bleiben erhalten (aus "könnte", "deutet darauf hin" wird kein "ist"); die ' +
  'Beweisgrundlage bleibt erkennbar (eine Einzelstudie, Anekdote oder Vermutung wird nicht zur ' +
  'gesicherten Tatsache); Meinungen und Wertungen des Autors bleiben ihm zugeschrieben; keine ' +
  'Zahlen, Studien, Namen, Details oder wörtlichen Zitate ergänzen, die du nicht belegen kannst — ' +
  'lieber allgemeiner formulieren; nichts zuspitzen oder übertreiben.';

function zusammenfassungRegel(kategorie: string): string {
  const profil = kategorieProfil(kategorie);
  const ebene2 = profil.ebene2;
  return (
    `Schwerpunkt dieser Kategorie: ${profil.schwerpunkt} — darauf achten Zusammenfassung und ` +
    'Kernaussagen besonders.\n' +
    'Zusammenfassung: in GENAU drei Ebenen, jede eingeleitet durch eine Überschrift erster ' +
    'Ebene auf eigener Zeile, exakt in dieser Reihenfolge und mit exakt diesen Titeln:\n' +
    '  1. "# Worum geht es?" — 2–4 Sätze: Thema, Kernfrage und Hauptanliegen des Werks. ' +
    'Nüchtern, kein Klappentext- oder Werbeton, keine Einordnung.\n' +
    `  2. "# ${ebene2.titel}" — ${ebene2.anleitung} Typischerweise 250–500 Wörter, ohne ` +
    '"##"-Zwischentitel.\n' +
    '  3. "# Zusammenfassung" — ausführlich und vertiefend, KEIN knapper Überblick. Ziel ist, ' +
    'dass Leser:innen die zentralen Gedankengänge wirklich nachvollziehen. Sachbücher/' +
    'Ratgeber/Philosophie/Wissenschaft: typischerweise 1500–2800 Wörter, gegliedert in 3–6 ' +
    'mit "## Zwischentitel" betitelte Abschnitte, die je einen Argumentationsstrang, ein ' +
    'zentrales Konzept oder Experiment vertiefen (konkrete Beispiele/Studien/Begriffe ' +
    'benennen, nicht nur andeuten). Die Gliederung folgt der Argumentationsstruktur, NICHT ' +
    'den Kapiteln des Buchs — keine Kapitel-für-Kapitel-Zusammenfassung. Erzählende Werke ' +
    '(Romane, literarische Klassiker): volle Nacherzählung von Handlung und Figuren, ' +
    'typischerweise 900–1600 Wörter, ebenfalls mit "##"-Zwischentiteln. Die Bandbreiten ' +
    'sind Richtwerte, keine harte Grenze.\n' +
    'Trennung Autor/Alexandreia: Alles ausserhalb von Einordnungs-Absätzen gibt AUSSCHLIESSLICH ' +
    'die Position des Autors bzw. den Inhalt des Werks wieder — mit klarer Zuschreibung ' +
    '("X argumentiert", "laut X", "X zufolge"), Behauptungen des Autors nie als Tatsachen in ' +
    `eigener Stimme. Eigene Deutung, Kritik oder Kontextualisierung nur in separaten Absätzen, ` +
    `die mit "${EINORDNUNG_PRAEFIX} " beginnen (ein Absatz, eine Zeile). Nie in "Worum geht ` +
    'es?". Sparsam: höchstens EINE Einordnung pro Ebene und insgesamt höchstens drei — nur ' +
    'dort, wo sie wirklich etwas hinzufügt (z.B. eine wesentliche Gegenposition oder den ' +
    'Stand der Forschung). Jede Einordnung bringt einen NEUEN Gedanken: keine Wiederholung ' +
    'derselben Referenz (z.B. dasselbe Vorbild-Werk) oder derselben Wertung (z.B. mehrfach ' +
    '"umstritten") in mehreren Einordnungen. Ohne solide Grundlage lieber weglassen als raten; ' +
    'null Einordnungen sind völlig in Ordnung.'
  );
}

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
  kernaussagen: KernaussageJSON[];
  vertrauenshinweise: {
    zusammenfassung: Vertrauenshinweis;
    entstehungsgeschichte: Vertrauenshinweis;
    autorenhintergrund: Vertrauenshinweis;
    kernzitat: Vertrauenshinweis | null;
  };
};

type KernaussageJSON = { text: string; erklaerung: string; beispiel?: string | null };

type EinordnungJSON = {
  zentrales_argument?: string | null;
  staerkster_beleg?: string | null;
  zentrale_annahme?: string | null;
  offene_schwachstelle?: string | null;
  heute?: {
    urteil?: string;
    begruendung?: string;
    quellen?: { titel?: string; url?: string }[];
  } | null;
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
// Anleitung, WELCHE ART von Kernaussage zu dieser Kategorie passt — das
// Schema (text + erklaerung + seit 09/2026 beispiel) bleibt für alle
// Kategorien identisch, nur der Inhalt passt sich an. Art und Beispiel
// kommen aus dem Kategorie-Profil (src/lib/kategorieprofile.ts).
function kernaussagenAnleitung(kategorie: string): string {
  const profil = kategorieProfil(kategorie);
  return (
    `Kernaussagen: ${profil.kernaussagen} Richtwert 5–12 pro Buch — so viele, wie das Werk ` +
    'tatsächlich hergibt (eine schmale Biografie/Chronik darf am unteren Rand liegen, nichts ' +
    'künstlich aufblähen). Zu JEDER Kernaussage ein "beispiel": ' +
    `${profil.beispiel}; 1–3 Sätze, konkret und aus dem Buch bzw. gut belegt — nichts erfinden ` +
    '(keine erfundenen Studien, Zahlen oder wörtlichen Zitate).'
  );
}

// Einordnungs-Block (09/2026, Pendenz "Einordnungs-Block"): getrennt von der
// Zusammenfassung, aus Sicht von Alexandreia. Umfang je Kategorie (siehe
// kategorieprofile.ts). "heute" nur mit Quelle aus der Websuche — der
// Prüfschritt kontrolliert das und entfernt ein unbelegtes Urteil.
function einordnungRegel(kategorie: string): string {
  const profil = kategorieProfil(kategorie);
  const vollTeil =
    profil.einordnung === "voll"
      ? 'Einordnung ("einordnung"), getrennt von der Zusammenfassung und aus Sicht von ' +
        'Alexandreia: "zentrales_argument" (das tragende Argument des Buchs), ' +
        '"staerkster_beleg" (der überzeugendste Beleg, den der Autor anführt), ' +
        '"zentrale_annahme" (die wichtigste, oft unausgesprochene Voraussetzung), ' +
        '"offene_schwachstelle" (die gewichtigste Schwäche oder offene Frage — fair, nicht ' +
        'polemisch). Jeweils 1–3 Sätze.'
      : 'Einordnung ("einordnung"): für diese Kategorie NUR "heute" — zentrales_argument, ' +
        'staerkster_beleg, zentrale_annahme und offene_schwachstelle müssen null sein.';
  return (
    vollTeil +
    ' "heute": wie das Werk aus heutiger Sicht dasteht. "urteil" genau eines von: "belegt" ' +
    '(zentrale Aussagen durch spätere Forschung gestützt), "umstritten" (ernsthafte, ' +
    'dokumentierte Gegenpositionen), "ueberholt" (wesentliche Aussagen widerlegt oder ersetzt), ' +
    '"weiterhin_relevant" (anhaltende Rezeption und Bedeutung — bei Literatur, Biografie und ' +
    'Geschichte meist das passende). "begruendung": 2–4 Sätze. "quellen": 1–3 Quellen, die du ' +
    'in DIESER Websuche tatsächlich gefunden hast (Titel + exakte URL aus den Suchergebnissen) ' +
    'und die das Urteil stützen. Nie eine URL erfinden oder aus dem Gedächtnis ergänzen. Ohne ' +
    'solche Quelle: "heute": null — lieber weglassen als raten.'
  );
}

const BLEIBT_HAENGEN_REGEL =
  '"bleibt_haengen": "ideen" — genau 3 Sätze: die drei Ideen des Buchs, die man sich merken ' +
  'sollte, je ein prägnanter, verdichteter Satz (keine blosse Wiederholung der Kernaussagen-' +
  'Titel); "offene_frage" — eine offene, zum Weiterdenken anregende Frage, die das Buch aufwirft ' +
  'oder offenlässt.';

const EINORDNUNG_JSON_FORMAT = `{
    "zentrales_argument": string | null,
    "staerkster_beleg": string | null,
    "zentrale_annahme": string | null,
    "offene_schwachstelle": string | null,
    "heute": {
      "urteil": "belegt" | "umstritten" | "ueberholt" | "weiterhin_relevant",
      "begruendung": string,
      "quellen": [{ "titel": string, "url": string }]
    } | null
  }`;

const BLEIBT_HAENGEN_JSON_FORMAT = `{ "ideen": [string, string, string], "offene_frage": string }`;

const URTEILE: EinordnungUrteil[] = ["belegt", "umstritten", "ueberholt", "weiterhin_relevant"];

function textOderNull(wert: unknown): string | null {
  return typeof wert === "string" && wert.trim() ? wert.trim() : null;
}

// Nur Quellen mit echter http(s)-URL, höchstens `max` Stück.
function normalisiereQuellen(roh: unknown, max: number): { titel: string; url: string }[] {
  return (Array.isArray(roh) ? roh : [])
    .map((q: { titel?: unknown; url?: unknown } | null) => ({
      titel: textOderNull(q?.titel) ?? "",
      url: textOderNull(q?.url) ?? "",
    }))
    .filter((q) => /^https?:\/\//.test(q.url))
    .slice(0, max)
    .map((q) => ({ titel: q.titel || q.url, url: q.url }));
}

// Bringt die (optionalen) neuen Felder aus der Modellantwort in die
// gespeicherte Form — tolerant statt strikt: fehlt oder ist eines davon
// unbrauchbar, wird es null gespeichert, statt den ganzen (teuren) Entwurf
// zu verwerfen. Die Screens blenden fehlende Abschnitte einfach aus.
export function normalisiereEinordnung(
  roh: EinordnungJSON | null | undefined,
  kategorie: string
): Einordnung | null {
  if (!roh || typeof roh !== "object") return null;
  const umfang = kategorieProfil(kategorie).einordnung;
  const voll = umfang === "voll";

  let heute: Einordnung["heute"] = null;
  const h = roh.heute;
  if (h && typeof h === "object" && URTEILE.includes(h.urteil as EinordnungUrteil)) {
    const quellen = normalisiereQuellen(h.quellen, 3);
    const begruendung = textOderNull(h.begruendung);
    // Ohne mindestens eine echte Quelle kein Urteil (siehe einordnungRegel).
    if (quellen.length > 0 && begruendung) {
      heute = { urteil: h.urteil as EinordnungUrteil, begruendung, quellen };
    }
  }

  const einordnung: Einordnung = {
    umfang,
    zentralesArgument: voll ? textOderNull(roh.zentrales_argument) : null,
    staerksterBeleg: voll ? textOderNull(roh.staerkster_beleg) : null,
    zentraleAnnahme: voll ? textOderNull(roh.zentrale_annahme) : null,
    offeneSchwachstelle: voll ? textOderNull(roh.offene_schwachstelle) : null,
    heute,
  };
  const leer =
    !einordnung.heute &&
    !einordnung.zentralesArgument &&
    !einordnung.staerksterBeleg &&
    !einordnung.zentraleAnnahme &&
    !einordnung.offeneSchwachstelle;
  return leer ? null : einordnung;
}

export function normalisiereBleibtHaengen(
  roh: { ideen?: string[]; offene_frage?: string } | null | undefined
): BleibtHaengen | null {
  if (!roh || typeof roh !== "object") return null;
  const ideen = (Array.isArray(roh.ideen) ? roh.ideen : [])
    .map(textOderNull)
    .filter((i): i is string => i !== null)
    .slice(0, 3);
  const offeneFrage = textOderNull(roh.offene_frage);
  if (ideen.length === 0 || !offeneFrage) return null;
  return { ideen, offeneFrage };
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

Grundsatz: ${EPISTEMIK_REGEL}

Regeln:
- ${zusammenfassungRegel(kategorie)}
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
  "kernaussagen": [{ "text": string, "erklaerung": string, "beispiel": string }],
  "vertrauenshinweise": {
    "zusammenfassung": "verifiziert" | "eingeordnet",
    "entstehungsgeschichte": "verifiziert" | "eingeordnet",
    "autorenhintergrund": "verifiziert" | "eingeordnet",
    "kernzitat": "verifiziert" | "eingeordnet" | null
  }
}`;

  const message = await erstelleMitFortsetzung(client, {
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
  const systemPrompt = `Du schreibst für Alexandreia die Zusammenfassung eines Buchs neu — in der vorgegebenen Drei-Ebenen-Struktur und vertiefend, anstelle einer bisherigen Fassung. Zielsprache für den Text ist Deutsch, unabhängig von der Originalsprache des Werks. Nutze die Web-Suche, um Inhalt und Argumentation abzusichern.

Grundsatz: ${EPISTEMIK_REGEL}

Regeln:
- ${zusammenfassungRegel(kategorie)}
- ${KEINE_ZITATIONS_TAGS_REGEL}
- Vertrauenshinweis: "verifiziert" (durch Recherche bestätigt) oder "eingeordnet" (plausibel eingeschätzt, aber nicht wortgetreu geprüft).
- Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "zusammenfassung": string,
  "vertrauenshinweis": "verifiziert" | "eingeordnet"
}`;

  const message = await erstelleMitFortsetzung(client, {
    model: MODELL,
    max_tokens: 16000,
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

// Regeneriert NUR die Kernaussagen eines bereits vorhandenen Buchinhalts,
// mit dem (09/2026 kategoriespezifisch gewordenen) kernaussagenAnleitung()
// von oben — für den Nachzieh-Lauf über bereits produzierte, aber noch NIE
// gelesene Bücher (siehe src/scripts/kernaussagen-regenerieren.ts, Pendenz
// "Kernaussagen-Funktion überdenken: passt nicht für alle Kategorien").
// Bewusst nur für UNGELESENE Bücher gedacht: Lernkarten, Quizfragen,
// Wiederholungs-Fortschritt und Notizen/Hervorhebungen hängen per
// Fremdschlüssel an den bestehenden Kernaussagen — bei einem bereits
// gelesenen Buch wäre das Ersetzen entweder blockiert (FK-Fehler) oder
// würde echten Nutzer-Fortschritt zerstören. Das Skript, das diese Funktion
// aufruft, prüft das vorab (kein gezeigteBuecher-Eintrag).
export async function kernaussagenNeuErstellen(
  titel: string,
  autor: string,
  kategorie: string
): Promise<{ kernaussagen: KernaussageJSON[] }> {
  const systemPrompt = `Du erstellst für Alexandreia NUR die Kernaussagen eines Buchs neu — die bisherige Fassung passte nicht zur Kategorie dieses Werks. Zielsprache Deutsch, unabhängig von der Originalsprache des Werks. Nutze die Web-Suche, um Inhalt und Fakten abzusichern.

Grundsatz: ${EPISTEMIK_REGEL}

Regeln:
- ${kernaussagenAnleitung(kategorie)}
- ${KEINE_ZITATIONS_TAGS_REGEL}
- Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "kernaussagen": [{ "text": string, "erklaerung": string, "beispiel": string }]
}`;

  const message = await erstelleMitFortsetzung(client, {
    model: MODELL,
    max_tokens: 16000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}. Kategorie: ${kategorie}.`,
      },
    ],
  });

  const text = await gesamtText(message);
  const ergebnis = jsonAusText(text) as { kernaussagen: KernaussageJSON[] };

  if (!Array.isArray(ergebnis.kernaussagen) || ergebnis.kernaussagen.length === 0) {
    throw new Error(`Neue Kernaussagen für "${titel}" leer oder ungültig.`);
  }
  if (ergebnis.kernaussagen.some((k) => !k.text?.trim() || !k.erklaerung?.trim())) {
    throw new Error(`Neue Kernaussagen für "${titel}" enthalten leere text/erklaerung-Felder.`);
  }

  return ergebnis;
}

// ===========================================================================
// Stufe 3: Synthese + Wissensstatus (09/2026, siehe src/lib/fertigstellung.ts)
// ===========================================================================

type WissensstatusJSON = {
  index?: number;
  status?: string;
  begruendung?: string;
  quellen?: { titel?: string; url?: string }[];
};

const WISSENSSTATUS_WERTE: WissensstatusWert[] = ["belegt", "umstritten", "ueberholt", "unklar"];

function normalisiereWissensstatus(roh: WissensstatusJSON | null | undefined): Wissensstatus | null {
  if (!roh || typeof roh !== "object") return null;
  if (!WISSENSSTATUS_WERTE.includes(roh.status as WissensstatusWert)) return null;
  const begruendung = textOderNull(roh.begruendung);
  const quellen = normalisiereQuellen(roh.quellen, 2);
  // Nur mit echter Quelle (Grundsatz: Wissensstatus nie ohne Beleg).
  if (!begruendung || quellen.length === 0) return null;
  return { status: roh.status as WissensstatusWert, begruendung, quellen };
}

function wissensstatusRegel(kategorie: string): string {
  if (!kategorieProfil(kategorie).wissensstatus) {
    return '"wissensstatus": für diese Kategorie eine leere Liste [] (Themen und Motive eines literarischen Werks haben keinen Forschungsstand).';
  }
  return (
    '"wissensstatus": für die Kernaussagen (per "index" aus der Liste unten), wie die heutige ' +
    'Forschung zu GENAU dieser Aussage steht — nicht zum Buch insgesamt. "status" genau eines von: ' +
    '"belegt" (durch spätere Forschung gestützt), "umstritten" (ernsthafte, dokumentierte ' +
    'Gegenbefunde oder Debatte), "ueberholt" (widerlegt, z.B. gescheiterte Replikation), "unklar" ' +
    '(Forschungslage uneinheitlich oder dünn). "begruendung": 1–2 Sätze. "quellen": 1–2 Quellen, ' +
    'die du in DIESER Websuche tatsächlich gefunden hast (Titel + exakte URL). Weglassen (kein ' +
    'Eintrag) bei Aussagen, die keine überprüfbare Tatsachenbehauptung sind (Wertungen, ' +
    'Handlungsempfehlungen, persönliche Erfahrungen des Autors) oder zu denen du keine Quelle ' +
    'findest — nicht jede Kernaussage braucht einen Eintrag.'
  );
}

export type Ergaenzungen = {
  einordnung: Einordnung | null;
  bleibtHaengen: BleibtHaengen | null;
  // Index = Position der Kernaussage in der übergebenen Liste (reihenfolge).
  wissensstatus: { index: number; wissensstatus: Wissensstatus }[];
  hinweise: string[];
};

// Stufe 3 der Pipeline (und Nachzieh-Lauf für den Bestand, siehe
// src/scripts/ergaenzungen-nachziehen.ts): ergänzt einen vorhandenen
// Buchinhalt um die Schichten "Synthese" (Einordnung, "Das bleibt hängen")
// und "Wissensstatus" (heute pro Buch + pro Kernaussage). Rührt die Schicht
// "Original" nicht an (Zusammenfassung, Kernaussagentexte, Quiz,
// Fortschritt bleiben) — deshalb auch für bereits gelesene Bücher
// geeignet. Alle Urteile mit Quelle werden danach in EINEM zweiten Aufruf
// gegen ihre Quellen geprüft; nicht belegte werden entfernt.
export async function ergaenzungenErstellen(
  titel: string,
  autor: string,
  kategorie: string,
  zusammenfassung: string,
  kernaussagenListe: { text: string; erklaerung: string }[]
): Promise<Ergaenzungen> {
  const systemPrompt = `Du ergänzt für Alexandreia einen bereits aufbereiteten Buchinhalt um Synthese und Wissensstatus. Zielsprache Deutsch. Nutze die Websuche für die Einordnung aus heutiger Sicht (Rezeption, Forschungsstand, Replikationen).

Grundsatz: ${EPISTEMIK_REGEL}

Regeln:
- ${einordnungRegel(kategorie)}
- ${BLEIBT_HAENGEN_REGEL}
- ${wissensstatusRegel(kategorie)}
- Passe alles zur untenstehenden, bereits vorhandenen Zusammenfassung und den Kernaussagen — keine Widersprüche dazu.
- ${KEINE_ZITATIONS_TAGS_REGEL}
- Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "einordnung": ${EINORDNUNG_JSON_FORMAT},
  "bleibt_haengen": ${BLEIBT_HAENGEN_JSON_FORMAT},
  "wissensstatus": [{ "index": number, "status": "belegt" | "umstritten" | "ueberholt" | "unklar", "begruendung": string, "quellen": [{ "titel": string, "url": string }] }]
}`;

  const liste = kernaussagenListe.map((k, i) => `${i}. ${k.text}\n   ${k.erklaerung}`).join("\n\n");

  const message = await erstelleMitFortsetzung(client, {
    model: MODELL,
    max_tokens: 16000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
    messages: [
      {
        role: "user",
        content:
          `Buch: "${titel}" von ${autor}. Kategorie: ${kategorie}.\n\n` +
          `Kernaussagen:\n\n${liste}\n\nVorhandene Zusammenfassung:\n\n${zusammenfassung}`,
      },
    ],
  });

  const roh = jsonAusText(await gesamtText(message)) as {
    einordnung?: EinordnungJSON | null;
    bleibt_haengen?: { ideen?: string[]; offene_frage?: string } | null;
    wissensstatus?: WissensstatusJSON[] | null;
  };

  let einordnung = normalisiereEinordnung(roh.einordnung, kategorie);
  const bleibtHaengen = normalisiereBleibtHaengen(roh.bleibt_haengen);
  let wissensstatus = kategorieProfil(kategorie).wissensstatus
    ? (Array.isArray(roh.wissensstatus) ? roh.wissensstatus : [])
        .map((w) => ({ index: w?.index, wissensstatus: normalisiereWissensstatus(w) }))
        .filter(
          (w): w is { index: number; wissensstatus: Wissensstatus } =>
            typeof w.index === "number" &&
            Number.isInteger(w.index) &&
            w.index >= 0 &&
            w.index < kernaussagenListe.length &&
            w.wissensstatus !== null
        )
        // doppelte Indizes: nur den ersten behalten
        .filter((w, i, alle) => alle.findIndex((x) => x.index === w.index) === i)
    : [];

  const hinweise: string[] = [];

  // Alle Urteile mit Quelle in einem Aufruf gegen ihre Quellen prüfen.
  const urteile = [
    ...(einordnung?.heute ? [{ id: "heute", aussage: "Das Buch insgesamt", ...einordnung.heute }] : []),
    ...wissensstatus.map((w) => ({
      id: `k${w.index}`,
      aussage: kernaussagenListe[w.index].text,
      urteil: w.wissensstatus.status,
      begruendung: w.wissensstatus.begruendung,
      quellen: w.wissensstatus.quellen,
    })),
  ];
  if (urteile.length > 0) {
    const nichtBelegt = new Set(await urteilePruefen(titel, autor, urteile));
    if (nichtBelegt.has("heute") && einordnung) {
      einordnung = normalisiereEinordnung({ ...roh.einordnung, heute: null }, kategorie);
      hinweise.push("Einordnung 'heute' entfernt (Quelle stützt das Urteil nicht).");
    }
    const vorher = wissensstatus.length;
    wissensstatus = wissensstatus.filter((w) => !nichtBelegt.has(`k${w.index}`));
    if (wissensstatus.length < vorher) {
      hinweise.push(`${vorher - wissensstatus.length} Wissensstatus-Urteil(e) entfernt (nicht belegt).`);
    }
  }

  return { einordnung, bleibtHaengen, wissensstatus, hinweise };
}

// Prüft Urteile (Einordnung "heute" + Wissensstatus pro Kernaussage) gegen
// ihre Quellen. Gibt die IDs der NICHT belegten Urteile zurück. Scheitert
// die Prüfung selbst (z.B. unbrauchbare Antwort), gelten vorsichtshalber
// alle als nicht belegt — lieber weglassen als ungeprüft zeigen.
async function urteilePruefen(
  titel: string,
  autor: string,
  urteile: { id: string; aussage: string; urteil: string; begruendung: string; quellen: { titel: string; url: string }[] }[]
): Promise<string[]> {
  try {
    const message = await erstelleMitFortsetzung(client, {
      model: MODELL,
      max_tokens: 12000,
      system:
        "Du prüfst für Alexandreia Urteile darüber, wie Aussagen eines Buchs aus heutiger Sicht dastehen. " +
        "Prüfe per Websuche, ob die angegebenen Quellen existieren und das jeweilige Urteil samt Begründung " +
        "tatsächlich stützen. Sei streng — im Zweifel nicht belegt. Antworte NUR mit JSON, ohne Text davor " +
        'oder danach: {"nicht_belegt": [<IDs der Urteile, die NICHT belegt sind>]}',
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [
        {
          role: "user",
          content: `Buch: "${titel}" von ${autor}.\n\nUrteile (JSON):\n${JSON.stringify(urteile, null, 2)}`,
        },
      ],
    });
    const ergebnis = jsonAusText(await gesamtText(message)) as { nicht_belegt?: unknown };
    return Array.isArray(ergebnis.nicht_belegt) ? ergebnis.nicht_belegt.map(String) : [];
  } catch (err) {
    console.error(`[urteilePruefen] "${titel}": Prüfung fehlgeschlagen, alle Urteile verworfen:`, err);
    return urteile.map((u) => u.id);
  }
}

// ===========================================================================
// Stufe 2: Prüfung + Korrektur (09/2026)
// ===========================================================================
//
// Vorher verwarf die Prüfung den ganzen Entwurf bei jedem Fehler — auch bei
// Kleinigkeiten (Testläufe 21.09.: ein doppelt geschriebener Name, "ungebildet"
// statt "ohne höhere Bildung"), d.h. 3–4 Minuten bezahlte Arbeit weg und am
// nächsten Tag ein komplett neuer Entwurf mit neuen Zufallsfehlern. Jetzt:
// leichte Fehler liefert die Prüfung als gezielte Textersetzungen (alt → neu),
// die programmatisch angewendet werden; nur schwere Fehler verwerfen.

const KORREKTUR_FELDER = [
  "zusammenfassung",
  "entstehungsgeschichte",
  "autorenhintergrund",
  "kernzitat_original",
  "kernzitat_uebersetzung",
  "kernaussage",
] as const;

type KorrekturJSON = {
  feld?: string;
  index?: number;
  teil?: "text" | "erklaerung" | "beispiel";
  alt?: string;
  neu?: string;
  grund?: string;
};

type PruefungJSON = {
  schwere_fehler?: string[];
  korrekturen?: KorrekturJSON[];
};

export async function entwurfPruefen(titel: string, autor: string, entwurf: EntwurfJSON): Promise<PruefungJSON> {
  const systemPrompt = `Du prüfst kritisch einen KI-generierten Buchinhalt-Entwurf für Alexandreia, bevor er live geht. Nutze die Web-Suche, um Fakten und ein eventuelles Zitat gegenzuprüfen.

Grundsatz, den der Entwurf einhalten muss: ${EPISTEMIK_REGEL}

Prüfkriterien:
- Ist ein eventuelles Kernzitat wortgetreu korrekt (Originalsprache + Übersetzung)?
- Sind historische/biografische Angaben (Entstehungsjahr, Kontext, Autorenfakten) korrekt?
- Epistemischer Status: Wurde irgendwo ein Vorbehalt des Autors weggelassen, eine Einzelstudie/Vermutung als gesicherte Tatsache dargestellt, eine Autorenmeinung ohne Zuschreibung als Tatsache formuliert, oder eine Zahl/Studie/Person/ein Zitat ergänzt, das sich nicht belegen lässt? Übertreibungen und Zuspitzungen gegenüber den Quellen zählen ebenfalls.
- Ist der Text in sich kohärent und widerspruchsfrei (z.B. einheitliche Schreibweise von Titeln/Namen, keine Tipp- oder Redaktionsfehler)?
- Ist die Zusammenfassung ausführlich und vertiefend genug (mehrere Abschnitte, konkrete Argumentationsstränge — keine knappe Klappentext-Fassung)?
- Hat die Zusammenfassung genau drei Ebenen mit "# "-Überschriften in der vorgegebenen Reihenfolge ("# Worum geht es?" mit 2–4 Sätzen, danach die Argumentations-/Deutungsebene, zuletzt "# Zusammenfassung"), gegliedert nach Argumentationssträngen statt Kapiteln?
- Eigene Deutung/Kritik steht NUR in Absätzen mit "${EINORDNUNG_PRAEFIX}" (höchstens eine pro Ebene, drei insgesamt, keine Wiederholungen, keine in "Worum geht es?")?
- Sind die "beispiel"-Angaben der Kernaussagen konkret, zum Buch passend und belegt? (Ein fehlendes Beispiel ist kein Fehler.)
- Ist vertrauenshinweise.kernzitat null, wenn kein Kernzitat vorhanden ist?

Einteilung der Fehler:
- LEICHT (Normalfall): alles, was sich durch gezielte Textersetzungen beheben lässt — falsche Angaben, Übertreibungen, verlorene Vorbehalte, nicht belegte Zahlen/Details, Tippfehler, ein ungenaues Zitat (durch das korrekte ersetzen, oder kernzitat_original UND kernzitat_uebersetzung komplett streichen), ein erfundenes Beispiel (durch ein belegtes ersetzen oder streichen). Liefere dafür "korrekturen": "alt" ist ein WÖRTLICHER Ausschnitt aus dem jeweiligen Feld (exakt kopiert, so kurz wie möglich, aber eindeutig — er muss genau einmal im Feld vorkommen), "neu" der Ersatz ("" = streichen). Für Kernaussagen: "feld": "kernaussage", "index" (0-basiert) und "teil" ("text" | "erklaerung" | "beispiel"). WICHTIG: Der Text muss nach JEDER Ersetzung grammatisch vollständig und flüssig bleiben. Beim Streichen deshalb immer ganze Sätze samt Satzzeichen als "alt" angeben — oder den betroffenen Satz als Ganzes in korrigierter Form als "neu" liefern. Nie nur einen Satzteil streichen, der den Satz zerbricht (z.B. ein Nebensatz, ein Satzglied nach einem Komma).
- SCHWER (nur dann "schwere_fehler"): die Struktur fehlt (keine drei Ebenen), die Zusammenfassung ist grundlegend zu knapp, oder der Inhalt stellt das Buch so grundlegend falsch dar, dass wenige gezielte Ersetzungen nicht reichen.

Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:

{
  "schwere_fehler": string[],
  "korrekturen": [{ "feld": ${KORREKTUR_FELDER.map((f) => `"${f}"`).join(" | ")}, "index": number | null, "teil": "text" | "erklaerung" | "beispiel" | null, "alt": string, "neu": string, "grund": string }]
}

Beide Listen sind leer, wenn der Entwurf fehlerfrei ist. Sei gründlich — jeden gefundenen leichten Fehler als Korrektur liefern.`;

  const message = await erstelleMitFortsetzung(client, {
    model: MODELL,
    max_tokens: 16000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `Buch: "${titel}" von ${autor}.\n\nEntwurf (JSON):\n${JSON.stringify(entwurf, null, 2)}`,
      },
    ],
  });

  return jsonAusText(await gesamtText(message)) as PruefungJSON;
}

// Ersetzt `alt` durch `neu` in `text`, wenn `alt` GENAU EINMAL vorkommt.
// Zweiter Versuch mit toleranter Suche (beliebiger Leerraum, gerade vs.
// typografische Anführungszeichen), weil das Modell beim Zitieren eines
// Ausschnitts gelegentlich Leerzeichen/Zeilenumbrüche oder Anführungs-
// zeichen normalisiert. null = nicht (eindeutig) anwendbar.
function ersetzeEindeutig(text: string, alt: string, neu: string): string | null {
  if (!alt) return null;
  const exakt = text.split(alt).length - 1;
  if (exakt === 1) return text.replace(alt, () => neu);
  if (exakt > 1) return null;

  const muster = alt
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/["„“”]/g, '["„“”]')
    .replace(/['‚‘’]/g, "['‚‘’]");
  const regex = new RegExp(muster, "g");
  const treffer = text.match(regex);
  if (!treffer || treffer.length !== 1) return null;
  return text.replace(regex, () => neu);
}

// Räumt Satzzeichen-Reste auf, die beim Streichen eines Satzteils übrig
// bleiben können (Bug 09/2026, Testlauf "Die Brüder Karamasow": aus
// "… Gewicht bei; er betrachtete … als dieses." wurde "… Gewicht bei; .").
// Der Prüf-Prompt verlangt zwar, nur ganze Sätze zu streichen — das hier
// ist die Absicherung, falls sich das Modell nicht daran hält. Bewusst nur
// eindeutige Muster, damit kein legitimer Text verändert wird.
export function bereinigeNachStreichung(text: string): string {
  return text
    .replace(/[ \t]*[;,:][ \t]*\./g, ".") // "bei; ." / "bei, ." → "bei."
    .replace(/(?<!\.)\.[ \t]+\.(?!\.)/g, ".") // ". ." → "."
    .replace(/,[ \t]*,/g, ",") // ", ," → ","
    .replace(/\([ \t]*\)/g, "") // leere Klammern
    .replace(/[ \t]+([,;:!?]|\.(?!\.))/g, "$1") // Leerzeichen vor Satzzeichen (nicht vor "...")
    .replace(/[ \t]{2,}/g, " ") // doppelte Leerzeichen (Zeilenumbrüche bleiben)
    .replace(/[ \t]+\n/g, "\n"); // Leerzeichen am Zeilenende
}

export type PruefErgebnis =
  | { status: "geprueft"; korrekturenAngewendet: number; hinweise: string[] }
  | { status: "erneut_pruefen"; korrekturenAngewendet: number; hinweise: string[] }
  | { status: "verworfen"; probleme: string[] };

// Höchstzahl Prüfdurchgänge pro Entwurf: bleiben nach einem Durchgang
// Korrekturen, die sich nicht eindeutig anwenden liessen, wird der
// (teilkorrigierte) Entwurf beim nächsten Stufe-2-Lauf erneut geprüft —
// danach geht er mit Hinweis im Prüfprotokoll trotzdem weiter.
const MAX_PRUEFVERSUCHE = 2;

// Stufe 2: prüft einen gespeicherten Entwurf (Status "in_aufbereitung"),
// wendet leichte Korrekturen direkt an und setzt den Status auf "geprueft".
// Bei schweren Fehlern wird der Entwurf gelöscht — das Buch ist danach
// wieder frei für einen neuen Anlauf (Wunschliste/Cron).
export async function entwurfPruefenUndKorrigieren(buchinhaltId: string): Promise<PruefErgebnis> {
  const [zeile] = await db
    .select({
      titel: buecher.titel,
      autor: buecher.autor,
      zusammenfassung: buchinhalte.zusammenfassung,
      entstehungsgeschichte: buchinhalte.entstehungsgeschichte,
      autorenhintergrund: buchinhalte.autorenhintergrund,
      kernzitatOriginal: buchinhalte.kernzitatOriginal,
      kernzitatUebersetzung: buchinhalte.kernzitatUebersetzung,
      vertrauenshinweise: buchinhalte.vertrauenshinweise,
      pruefprotokoll: buchinhalte.pruefprotokoll,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, buchinhaltId));
  if (!zeile) throw new Error(`Buchinhalt ${buchinhaltId} nicht gefunden.`);

  const aussagen = await db
    .select({ id: kernaussagen.id, text: kernaussagen.text, erklaerung: kernaussagen.erklaerung, beispiel: kernaussagen.beispiel })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId))
    .orderBy(asc(kernaussagen.reihenfolge));

  const vh = zeile.vertrauenshinweise ?? {
    zusammenfassung: "eingeordnet" as const,
    entstehungsgeschichte: "eingeordnet" as const,
    autorenhintergrund: "eingeordnet" as const,
    kernzitat: null,
  };

  const entwurf: EntwurfJSON = {
    zusammenfassung: zeile.zusammenfassung,
    entstehungsgeschichte: zeile.entstehungsgeschichte,
    autorenhintergrund: zeile.autorenhintergrund,
    kernzitat_original: zeile.kernzitatOriginal,
    kernzitat_uebersetzung: zeile.kernzitatUebersetzung,
    kernaussagen: aussagen.map((a) => ({ text: a.text, erklaerung: a.erklaerung, beispiel: a.beispiel })),
    vertrauenshinweise: vh,
  };

  const pruefung = await entwurfPruefen(zeile.titel, zeile.autor, entwurf);
  const schwere = (pruefung.schwere_fehler ?? []).filter((f) => typeof f === "string" && f.trim());

  if (schwere.length > 0) {
    await db.delete(kernaussagen).where(eq(kernaussagen.buchinhaltId, buchinhaltId));
    await db.delete(buchinhalte).where(eq(buchinhalte.id, buchinhaltId));
    return { status: "verworfen", probleme: schwere };
  }

  // Korrekturen auf eine Arbeitskopie anwenden.
  const felder: Record<string, string | null> = {
    zusammenfassung: entwurf.zusammenfassung,
    entstehungsgeschichte: entwurf.entstehungsgeschichte,
    autorenhintergrund: entwurf.autorenhintergrund,
    kernzitat_original: entwurf.kernzitat_original,
    kernzitat_uebersetzung: entwurf.kernzitat_uebersetzung,
  };
  const ka = aussagen.map((a) => ({ ...a }));
  const protokoll: Pruefprotokoll["korrekturen"] = [];
  const hinweise: string[] = [];

  for (const k of pruefung.korrekturen ?? []) {
    const alt = typeof k?.alt === "string" ? k.alt : "";
    const neu = typeof k?.neu === "string" ? k.neu : "";
    const grund = textOderNull(k?.grund);
    let angewendet = false;
    let feldName = String(k?.feld ?? "?");

    if (k?.feld === "kernaussage") {
      const ziel = typeof k.index === "number" ? ka[k.index] : undefined;
      const teil = k.teil;
      feldName = `kernaussage[${k.index}].${teil}`;
      if (ziel && (teil === "text" || teil === "erklaerung" || teil === "beispiel")) {
        const ergebnis = ersetzeEindeutig(ziel[teil] ?? "", alt, neu);
        // Titel und Erklärung einer Kernaussage dürfen nicht leer werden.
        if (ergebnis !== null && (teil === "beispiel" || ergebnis.trim())) {
          if (teil === "beispiel") ziel.beispiel = ergebnis.trim() || null;
          else ziel[teil] = ergebnis;
          angewendet = true;
        }
      }
    } else if (k?.feld && k.feld in felder) {
      const wert = felder[k.feld];
      const ergebnis = wert === null ? null : ersetzeEindeutig(wert, alt, neu);
      const darfLeer = k.feld !== "zusammenfassung" && k.feld !== "entstehungsgeschichte";
      if (ergebnis !== null && (darfLeer || ergebnis.trim())) {
        felder[k.feld] = ergebnis.trim() ? ergebnis : null;
        angewendet = true;
      }
    }

    protokoll.push({ feld: feldName, alt, neu, grund, angewendet });
    if (!angewendet) hinweise.push(`Korrektur nicht anwendbar (${feldName}): "${alt.slice(0, 80)}"`);
  }

  // Satzzeichen-Reste in allen durch Korrekturen geänderten Texten aufräumen.
  for (const feld of Object.keys(felder)) {
    const wert = felder[feld];
    if (wert !== null && wert !== (entwurf as unknown as Record<string, string | null>)[feld]) {
      felder[feld] = bereinigeNachStreichung(wert);
    }
  }
  for (let i = 0; i < ka.length; i++) {
    const a = ka[i];
    const o = aussagen[i];
    if (a.text !== o.text) a.text = bereinigeNachStreichung(a.text);
    if (a.erklaerung !== o.erklaerung) a.erklaerung = bereinigeNachStreichung(a.erklaerung);
    if (a.beispiel && a.beispiel !== o.beispiel) a.beispiel = bereinigeNachStreichung(a.beispiel) || null;
  }

  // Kernzitat: nur vollständig (Original + Übersetzung) oder gar nicht.
  let vertrauenshinweise = vh;
  if (!felder.kernzitat_original || !felder.kernzitat_uebersetzung) {
    felder.kernzitat_original = null;
    felder.kernzitat_uebersetzung = null;
    vertrauenshinweise = { ...vh, kernzitat: null };
  }

  const bisher = zeile.pruefprotokoll;
  const versuche = (bisher?.versuche ?? 0) + 1;
  const offen = protokoll.some((p) => !p.angewendet);
  const nochmal = offen && versuche < MAX_PRUEFVERSUCHE;
  if (offen && !nochmal) hinweise.push("Nicht anwendbare Korrekturen bleiben offen (Höchstzahl Prüfdurchgänge erreicht).");

  const pruefprotokoll: Pruefprotokoll = {
    versuche,
    korrekturen: [...(bisher?.korrekturen ?? []), ...protokoll],
    hinweise: [...(bisher?.hinweise ?? []), ...hinweise],
    zuletztGeprueftAm: new Date().toISOString(),
  };

  await db
    .update(buchinhalte)
    .set({
      zusammenfassung: felder.zusammenfassung ?? zeile.zusammenfassung,
      entstehungsgeschichte: felder.entstehungsgeschichte ?? zeile.entstehungsgeschichte,
      autorenhintergrund: felder.autorenhintergrund,
      kernzitatOriginal: felder.kernzitat_original,
      kernzitatUebersetzung: felder.kernzitat_uebersetzung,
      vertrauenshinweise,
      pruefprotokoll,
      status: nochmal ? "in_aufbereitung" : "geprueft",
    })
    .where(eq(buchinhalte.id, buchinhaltId));

  for (let i = 0; i < ka.length; i++) {
    const a = ka[i];
    const original = aussagen[i];
    if (a.text !== original.text || a.erklaerung !== original.erklaerung || a.beispiel !== original.beispiel) {
      await db
        .update(kernaussagen)
        .set({ text: a.text, erklaerung: a.erklaerung, beispiel: a.beispiel })
        .where(eq(kernaussagen.id, a.id));
    }
  }

  const angewendet = protokoll.filter((p) => p.angewendet).length;
  return nochmal
    ? { status: "erneut_pruefen", korrekturenAngewendet: angewendet, hinweise }
    : { status: "geprueft", korrekturenAngewendet: angewendet, hinweise };
}

// ===========================================================================
// Stufe 1: Entwurf (09/2026)
// ===========================================================================

export type PipelineErgebnis = { status: "entworfen"; buchinhaltId: string; anzahlKernaussagen: number };

// Stufe 1: erstellt den Entwurf (Schicht "Original") und speichert ihn mit
// Status "in_aufbereitung" — noch nicht sichtbar. Prüfung + Korrektur folgt
// in Stufe 2 (entwurfPruefenUndKorrigieren, app/api/cron/pruefen), Synthese,
// Wissensstatus und Quiz in Stufe 3 (src/lib/fertigstellung.ts).
export async function pipelineSchritt(buchId: string): Promise<PipelineErgebnis> {
  const [buch] = await db.select().from(buecher).where(eq(buecher.id, buchId));
  if (!buch) throw new Error(`Buch ${buchId} nicht gefunden.`);

  const entwurf = await entwurfErstellen(buch.titel, buch.autor, buch.kategorie, buch.originalsprache);

  const [buchinhalt] = await db
    .insert(buchinhalte)
    .values({
      buchId: buch.id,
      zusammenfassung: entwurf.zusammenfassung,
      entstehungsgeschichte: entwurf.entstehungsgeschichte,
      autorenhintergrund: entwurf.autorenhintergrund ?? undefined,
      kernzitatOriginal: entwurf.kernzitat_original ?? undefined,
      kernzitatUebersetzung: entwurf.kernzitat_uebersetzung ?? undefined,
      status: "in_aufbereitung",
      vertrauenshinweise: entwurf.vertrauenshinweise,
    })
    .returning();

  for (let i = 0; i < entwurf.kernaussagen.length; i++) {
    const k = entwurf.kernaussagen[i];
    await db.insert(kernaussagen).values({
      buchinhaltId: buchinhalt.id,
      text: k.text,
      erklaerung: k.erklaerung,
      beispiel: textOderNull(k.beispiel),
      reihenfolge: i,
    });
  }

  return { status: "entworfen", buchinhaltId: buchinhalt.id, anzahlKernaussagen: entwurf.kernaussagen.length };
}
