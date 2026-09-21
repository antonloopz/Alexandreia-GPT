// src/lib/recherche.ts
//
// Vierter Baustein der Vorschlagslogik (Konzept: "Klassiker/Geheimtipp/
// Synergie"). Wird von vorschlag.ts aufgerufen, wenn eine Kategorie unter
// Mindestbestand ist und weder Wunschliste noch bestehender Recherche-Pool
// einen Kandidaten liefern. Recherchiert per Claude+Websuche EIN neues Buch
// und legt es sofort als `buecher`-Zeile an — anders als vorschlag.ts selbst
// ist dieser Schritt bewusst KEIN reiner Lesevorgang, weil ohne eine echte
// DB-Zeile kein buchId für pipelineSchritt() existieren würde.

import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { buecher, buchinhalte, gezeigteBuecher, wunschlisteneintraege } from "../db/schema";
import { jsonAusText } from "./json";
import { erstelleMitFortsetzung } from "./anfrage";
import { umfangNachschlagen } from "./umfang";
import type { Kategorie } from "./vorschlag";

const MODELL = "claude-sonnet-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type RechercheQuelle = "klassiker" | "geheimtipp" | "synergie";

type RechercheJSON = {
  titel: string;
  autor: string;
  originalsprache: string;
  begruendung: string;
};

// Extrahiert den GESAMTEN Textanteil der Modellantwort — nicht nur den
// letzten Textblock (Bug 09/2026, gleicher Fehler wie in entwurf.ts: bei
// aktivierter Websuche kann die Antwort aus mehreren Textblöcken bestehen,
// z.B. das komplette JSON in einem frühen Block, gefolgt von weiteren
// Tool-Aufrufen und einem kurzen abschliessenden Textblock. Nur den letzten
// zu nehmen lieferte dann bloss ein abgeschnittenes Fragment statt des
// tatsächlichen JSON).
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
  return textBloecke.map((b) => b.text).join("");
}

// Web-Search-Antworten hängen manchmal technische Zitations-Tags an
// (z.B. <cite index="4-1">...</cite>) — die landen sonst wortwörtlich im
// JSON-Text. Tag entfernen, umschlossenen Text behalten.
function ohneZitationsTags(text: string): string {
  return text.replace(/<\/?cite[^>]*>/g, "").trim();
}

// Rotation über die drei Quellen, anhand dessen, was bisher am seltensten
// gezeigt wurde. "synergie" nur möglich, wenn schon mindestens ein Buch
// gezeigt wurde (sonst gibt es nichts, woran anzuschliessen wäre).
async function naechsteQuelle(kontoId: string): Promise<RechercheQuelle> {
  const gezeigt = await db
    .select({ quelle: gezeigteBuecher.quelle })
    .from(gezeigteBuecher)
    .where(eq(gezeigteBuecher.kontoId, kontoId));

  const zaehler = { klassiker: 0, geheimtipp: 0, synergie: 0 };
  for (const row of gezeigt) {
    if (row.quelle in zaehler) zaehler[row.quelle as RechercheQuelle]++;
  }

  const kandidaten: RechercheQuelle[] =
    gezeigt.length === 0 ? ["klassiker", "geheimtipp"] : ["klassiker", "geheimtipp", "synergie"];

  kandidaten.sort((a, b) => zaehler[a] - zaehler[b]);
  return kandidaten[0];
}

export async function kandidatRecherchieren(
  kontoId: string,
  kategorie: Kategorie
): Promise<{
  id: string;
  titel: string;
  autor: string;
  quelle: RechercheQuelle;
  grund: string;
  umfang: string | null;
  umfangGeprueftAm: Date | null;
}> {
  const quelle = await naechsteQuelle(kontoId);

  const vorhandene = await db.select({ titel: buecher.titel, autor: buecher.autor }).from(buecher);
  const ausschluss = vorhandene.map((b) => `"${b.titel}" von ${b.autor}`).join("; ") || "keine";

  let anschlussKontext = "";
  if (quelle === "synergie") {
    const [letztes] = await db
      .select({ titel: buecher.titel, autor: buecher.autor, kategorie: buecher.kategorie })
      .from(gezeigteBuecher)
      .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
      .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
      .where(eq(gezeigteBuecher.kontoId, kontoId))
      .orderBy(desc(gezeigteBuecher.datumGezeigt))
      .limit(1);
    if (letztes) {
      anschlussKontext = `\nDas zuletzt gezeigte Buch war "${letztes.titel}" von ${letztes.autor} (Kategorie ${letztes.kategorie}). Schlage ein Buch vor, das inhaltlich/thematisch daran anschliesst — die Ziel-Kategorie für den neuen Vorschlag ist trotzdem "${kategorie}".`;
    }
  }

  const definition = {
    klassiker: "ein weithin anerkanntes, kanonisches Standardwerk dieser Kategorie",
    geheimtipp: "ein weniger bekanntes, aber inhaltlich starkes Werk dieser Kategorie",
    synergie: "ein Werk, das thematisch an ein bereits gezeigtes Buch anschliesst",
  }[quelle];

  const systemPrompt = `Du schlägst für Alexandreia, eine App mit täglichem Buchvorschlag, EIN einzelnes Buch für die Kategorie "${kategorie}" vor. Gesucht ist ${definition}.

Nutze die Websuche, um sicherzugehen, dass Titel/Autor korrekt sind und das Buch tatsächlich zur Kategorie passt.${anschlussKontext}

Bereits im Katalog vorhanden (NICHT erneut vorschlagen): ${ausschluss}

"begruendung" ist reiner Fliesstext ohne jedes Zitations-Markup (keine <cite>-Tags, keine eckigen Quellenverweise, keine Markdown-Links) — falls du auf eine Quelle gestossen bist, formuliere die Information einfach in normaler Sprache ein.

Antworte NUR mit einem validen JSON-Objekt, ohne Markdown-Codeblock, ohne Text davor oder danach:
{
  "titel": string,
  "autor": string,
  "originalsprache": string,
  "begruendung": string
}`;

  const message = await erstelleMitFortsetzung(client, {
    model: MODELL,
    max_tokens: 4000,
    system: systemPrompt,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: "Schlage jetzt ein Buch vor." }],
  });

  const text = await gesamtText(message);
  const vorschlag = jsonAusText(text) as RechercheJSON;

  if (!vorschlag.titel?.trim() || !vorschlag.autor?.trim()) {
    throw new Error("Recherche-Antwort unvollständig: Titel oder Autor fehlt.");
  }

  // umfangGeprueftAm gleich mit setzen — der Lookup ist hier bereits
  // gelaufen (erfolgreich oder nicht), ein sonst folgender
  // sicherstelleUmfang()-Aufruf (siehe vorschlag.ts) soll ihn nicht sofort
  // nochmal versuchen.
  const umfang = await umfangNachschlagen(vorschlag.titel, vorschlag.autor);

  const [neuesBuch] = await db
    .insert(buecher)
    .values({
      titel: vorschlag.titel,
      autor: vorschlag.autor,
      originalsprache: vorschlag.originalsprache || "unbekannt",
      kategorie,
      herkunft: quelle,
      umfang,
      umfangGeprueftAm: new Date(),
    })
    .returning();

  const begruendung = ohneZitationsTags(vorschlag.begruendung || "");

  // Sofort als Wunschlisten-Eintrag sichtbar machen (09/2026, Pendenz
  // "Wunschliste: Markierung ob Vorschlag von Claude oder Eintrag vom
  // Nutzer") — vorher lief das komplett an der Wunschliste vorbei, direkt
  // in buecher/gezeigteBuecher. Die Begründung landet gleich als Notiz mit,
  // damit sie beim Öffnen des Eintrags nachvollziehbar bleibt. Wichtig:
  // vorschlaege() darf diesen Eintrag NICHT mit einem echten
  // "eigene_liste"-Wunsch verwechseln — siehe der herkunft-Filter in
  // wunschlistenQuote().
  await db.insert(wunschlisteneintraege).values({
    kontoId,
    buchId: neuesBuch.id,
    herkunft: quelle,
    notiz: begruendung || null,
  });

  return {
    id: neuesBuch.id,
    titel: neuesBuch.titel,
    autor: neuesBuch.autor,
    quelle,
    grund: begruendung || `Per Recherche vorgeschlagen (${quelle}).`,
    umfang: neuesBuch.umfang,
    umfangGeprueftAm: neuesBuch.umfangGeprueftAm,
  };
}
