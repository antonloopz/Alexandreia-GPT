// src/lib/tags.ts
//
// Autotags (09/2026, Pendenz "Autotags zu Notizen und Büchern").
// Entscheid 21.09.2026: das Modell schlägt Tags vor und verwendet dabei
// bevorzugt das bestehende Vokabular; neue Tags nur, wenn nichts passt.
// Notizen erben die Tags ihres Buchs (keine eigenen Tags pro Notiz).
//
// Normalisierung ist der kritische Teil (siehe Pendenz "Vernetzung"):
// "Stoizismus" und "stoische Philosophie" müssen derselbe Tag sein, sonst
// entstehen Dubletten statt Verbindungen. Zwei Sicherungen:
//   1. Prompt: das Modell bekommt die ganze bestehende Liste und muss einen
//      passenden bestehenden Tag EXAKT übernehmen; für einen neuen Tag, der
//      nur ein Synonym eines bestehenden wäre, meldet es stattdessen den
//      bestehenden (Feld "synonym" mit seinem eigenen Begriff).
//   2. Code: jeder Vorschlag wird über slug() mit slug UND aliase aller
//      bestehenden Tags abgeglichen (Gross-/Kleinschreibung, Akzente,
//      Bindestriche egal). Meldet das Modell ein Synonym, wird die neue
//      Schreibweise als Alias beim bestehenden Tag hinterlegt — künftige
//      Vorschläge in dieser Form landen dann direkt dort.
//
// Granularität (Nachschärfung 21.09.2026 nach dem ersten Lauf: 60 von 76
// Tags hingen an nur einem Buch — Motive wie "Höhlengleichnis" oder
// "Vatermord" verbinden nichts): pro Buch 3–5 Tags, mindestens zwei breite
// (Denkschule/Fachgebiet/Epoche), höchstens ein spezifisches Kernkonzept.
//
// Die Vergabe ist in Stufe 3 (lib/fertigstellung.ts) optional wie die
// übrigen Ergänzungen: scheitert sie, wird das Buch trotzdem fertig und
// kann per src/scripts/tags-nachziehen.ts ergänzt werden.

import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { buchinhalte, buecher, buchTags, kernaussagen, kernaussageTags, tags } from "../db/schema";
import { jsonAusText } from "./json";
import { KATEGORIE_LABEL } from "./kategorien";

const MODELL = "claude-sonnet-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MIN_TAGS = 3;
export const MAX_TAGS = 5;

export type TagInfo = { id: string; name: string; slug: string };

// Normalisierter Schlüssel: klein, ohne Akzente (ä → a), nur a–z/0–9,
// Wörter mit "-" verbunden. "Kognitive Verzerrungen" → "kognitive-verzerrungen".
export function slug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type VokabularEintrag = { id: string; name: string; slug: string; aliase: string[]; anzahl: number };

export async function ladeVokabular(): Promise<VokabularEintrag[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      aliase: tags.aliase,
      anzahl: sql<number>`(select count(*)::int from ${buchTags} where ${buchTags.tagId} = ${tags.id})`,
    })
    .from(tags)
    .orderBy(asc(tags.name));
}

function findeImVokabular(vokabular: VokabularEintrag[], name: string): VokabularEintrag | undefined {
  const s = slug(name);
  if (!s) return undefined;
  return vokabular.find((v) => v.slug === s || v.aliase.includes(s));
}

// Kurzer Aufruf ohne Websuche, Antwort als JSON.
async function modellJson(prompt: string, maxTokens: number): Promise<unknown> {
  const antwort = await client.messages.create({
    model: MODELL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = antwort.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return jsonAusText(text);
}

type Vorschlag = { name: string; synonymVon?: string };

async function tagsVorschlagen(
  titel: string,
  autor: string,
  kategorie: string,
  zusammenfassung: string,
  kernaussagen: string[],
  vokabular: VokabularEintrag[]
): Promise<Vorschlag[]> {
  const liste = vokabular.length
    ? vokabular.map((v) => `- ${v.name} (${v.anzahl})`).join("\n")
    : "(noch keine — du legst die ersten Tags an)";

  const prompt = `Vergib ${MIN_TAGS} bis ${MAX_TAGS} Tags für das Buch "${titel}" von ${autor} (Hauptkategorie: ${KATEGORIE_LABEL[kategorie] ?? kategorie}).

Zweck der Tags: Sie VERBINDEN Bücher miteinander — über gemeinsame Denkschulen, Fachgebiete, Epochen und Themen, unterhalb der Hauptkategorie. Ein Tag, der voraussichtlich nie ein zweites Buch trifft, ist wertlos. Ein Tag muss aber etwas aussagen ("Verhaltensökonomie", "Stoizismus", "Kalter Krieg", "Gewohnheitsbildung" — nicht "Leben", "Menschen", "Wissen").

Mischung pro Buch:
- Mindestens ZWEI breite Tags: Denkschule/Strömung, Fachgebiet, Epoche/Kulturraum oder grosses Thema, zu dem es viele Bücher gibt (z.B. "Tugendethik", "Sozialpsychologie", "Antike", "Religionskritik", "Führung").
- Höchstens EIN spezifisches Kernkonzept des Buchs — und nur, wenn es ein etablierter Begriff ist, den auch andere Bücher behandeln (z.B. "Verlustaversion", "Theodizee", "Heldenreise").
- NICHT: einzelne Motive, Szenen, Gleichnisse, Figuren, Orte, Organisationen oder Werk-Begriffe eines einzigen Buchs (z.B. nicht "Höhlengleichnis", "Vatermord", "Seidenstraße", "Zahlensymbolik"). Ordne solche Inhalte dem breiteren Thema zu, zu dem sie gehören.
- Keine zwei Tags, die dasselbe meinen oder sich stark überschneiden (z.B. nicht "Heuristiken" UND "Kognitive Verzerrungen") — nimm den gebräuchlicheren.

Regeln:
- Deutsch, natürliche Schreibweise, Substantiv bzw. Fachbegriff, Singular wo sinnvoll, 1–3 Wörter.
- Nicht: die Hauptkategorie selbst, Titel, Autorenname, Gattung ("Roman", "Sachbuch"), Wertungen ("Klassiker", "lesenswert").
- Nur Tags, die klar aus dem Inhalt unten hervorgehen — lieber ${MIN_TAGS} treffende als ${MAX_TAGS} vage.
- BESTEHENDE TAGS ZUERST: Passt ein Tag aus der Liste unten, übernimm seinen Namen EXAKT (Zahl in Klammern = Anzahl Bücher, nicht mitschreiben).
- Ein neuer Tag nur, wenn kein bestehender dasselbe Konzept meint. Wäre dein Begriff nur ein Synonym, eine andere Schreibweise oder Wortform eines bestehenden Tags (z.B. "stoische Philosophie" zu "Stoizismus"), dann nimm den bestehenden Tag: "name" = bestehender Tag, "synonym" = dein Begriff.

Bestehende Tags:
${liste}

Inhalt des Buchs:
${zusammenfassung}

Kernaussagen:
${kernaussagen.map((k, i) => `${i + 1}. ${k}`).join("\n")}

Antworte ausschliesslich mit JSON, ohne Text davor oder danach:
{"tags": [{"name": "…"}, {"name": "<bestehender Tag>", "synonym": "<dein Begriff>"}]}`;

  const daten = (await modellJson(prompt, 2000)) as { tags?: { name?: unknown; synonym?: unknown }[] };
  if (!Array.isArray(daten?.tags)) throw new Error("Antwort enthält kein Feld 'tags'.");

  return daten.tags
    .filter((t) => typeof t?.name === "string" && t.name.trim())
    .map((t) => ({
      name: String(t.name).trim(),
      synonymVon: typeof t.synonym === "string" && t.synonym.trim() ? t.synonym.trim() : undefined,
    }));
}

export type TagVergabe = { tags: string[]; neu: string[]; aliaseErgaenzt: string[] };

// Vergibt Tags für ein Buch und speichert sie. Bestehende Zuordnungen des
// Buchs bleiben erhalten (ON CONFLICT DO NOTHING) — ein Aufrufer, der neu
// vergeben will, muss sie vorher selbst löschen.
export async function tagsVergeben(
  buchId: string,
  titel: string,
  autor: string,
  kategorie: string,
  zusammenfassung: string,
  kernaussagen: string[]
): Promise<TagVergabe> {
  const vokabular = await ladeVokabular();
  const vorschlaege = await tagsVorschlagen(titel, autor, kategorie, zusammenfassung, kernaussagen, vokabular);

  const kategorieSlugs = new Set([slug(kategorie), slug(KATEGORIE_LABEL[kategorie] ?? "")]);
  const gewaehlt = new Map<string, TagInfo>();
  const neu: string[] = [];
  const aliaseErgaenzt: string[] = [];

  for (const v of vorschlaege) {
    if (gewaehlt.size >= MAX_TAGS) break;
    const s = slug(v.name);
    if (!s || kategorieSlugs.has(s)) continue;

    let eintrag = findeImVokabular(vokabular, v.name);

    // Synonym zu einem bestehenden Tag: Schreibweise als Alias hinterlegen.
    if (eintrag && v.synonymVon) {
      const aliasSlug = slug(v.synonymVon);
      if (aliasSlug && aliasSlug !== eintrag.slug && !eintrag.aliase.includes(aliasSlug)) {
        eintrag.aliase = [...eintrag.aliase, aliasSlug];
        await db.update(tags).set({ aliase: eintrag.aliase }).where(eq(tags.id, eintrag.id));
        aliaseErgaenzt.push(`${v.synonymVon} → ${eintrag.name}`);
      }
    }

    if (!eintrag) {
      const [angelegt] = await db
        .insert(tags)
        .values({ name: v.name, slug: s })
        .onConflictDoNothing({ target: tags.slug })
        .returning({ id: tags.id, name: tags.name, slug: tags.slug, aliase: tags.aliase });
      if (angelegt) {
        neu.push(angelegt.name);
        eintrag = { ...angelegt, anzahl: 0 };
      } else {
        const [vorhanden] = await db
          .select({ id: tags.id, name: tags.name, slug: tags.slug, aliase: tags.aliase })
          .from(tags)
          .where(eq(tags.slug, s));
        if (!vorhanden) continue;
        eintrag = { ...vorhanden, anzahl: 0 };
      }
      vokabular.push(eintrag);
    }

    gewaehlt.set(eintrag.id, { id: eintrag.id, name: eintrag.name, slug: eintrag.slug });
  }

  if (gewaehlt.size === 0) throw new Error("Keine verwertbaren Tags vorgeschlagen.");

  await db
    .insert(buchTags)
    .values([...gewaehlt.keys()].map((tagId) => ({ buchId, tagId })))
    .onConflictDoNothing({ target: [buchTags.buchId, buchTags.tagId] });

  return { tags: [...gewaehlt.values()].map((t) => t.name), neu, aliaseErgaenzt };
}

// Tags pro Buch für Anzeige/Filter — alphabetisch.
export async function tagsFuerBuecher(buchIds: string[]): Promise<Map<string, TagInfo[]>> {
  const ergebnis = new Map<string, TagInfo[]>();
  const eindeutig = [...new Set(buchIds)];
  if (eindeutig.length === 0) return ergebnis;
  const zeilen = await db
    .select({ buchId: buchTags.buchId, id: tags.id, name: tags.name, slug: tags.slug })
    .from(buchTags)
    .innerJoin(tags, eq(buchTags.tagId, tags.id))
    .where(inArray(buchTags.buchId, eindeutig))
    .orderBy(asc(tags.name));
  for (const z of zeilen) {
    const liste = ergebnis.get(z.buchId) ?? [];
    liste.push({ id: z.id, name: z.name, slug: z.slug });
    ergebnis.set(z.buchId, liste);
  }
  return ergebnis;
}

export async function hatTags(buchId: string): Promise<boolean> {
  const [z] = await db.select({ tagId: buchTags.tagId }).from(buchTags).where(eq(buchTags.buchId, buchId)).limit(1);
  return Boolean(z);
}

// Verwandte Bücher (09/2026, Pendenz "Abschlussansicht 'Das bleibt
// hängen'", Querverbindungen — erster, einfacher Schritt vor der Pendenz
// "Vernetzung"): andere Bücher im Vorrat, sortiert nach Anzahl gemeinsamer
// Tags, bei Gleichstand alphabetisch. Nur Bücher mit mindestens einem
// gemeinsamen Tag.
export type VerwandtesBuch = {
  buchinhaltId: string;
  titel: string;
  autor: string;
  kategorie: string;
  gemeinsameTags: TagInfo[];
};

export async function verwandteBuecher(buchId: string, limit = 3): Promise<VerwandtesBuch[]> {
  const eigene = await db.select({ tagId: buchTags.tagId }).from(buchTags).where(eq(buchTags.buchId, buchId));
  if (eigene.length === 0) return [];

  const zeilen = await db
    .select({
      buchId: buecher.id,
      buchinhaltId: buchinhalte.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      tagId: tags.id,
      tagName: tags.name,
      tagSlug: tags.slug,
    })
    .from(buchTags)
    .innerJoin(tags, eq(buchTags.tagId, tags.id))
    .innerJoin(buecher, eq(buchTags.buchId, buecher.id))
    .innerJoin(buchinhalte, and(eq(buchinhalte.buchId, buecher.id), eq(buchinhalte.status, "im_vorrat")))
    .where(and(inArray(buchTags.tagId, eigene.map((e) => e.tagId)), ne(buchTags.buchId, buchId)));

  const proBuch = new Map<string, VerwandtesBuch>();
  for (const z of zeilen) {
    const eintrag = proBuch.get(z.buchId) ?? {
      buchinhaltId: z.buchinhaltId,
      titel: z.titel,
      autor: z.autor,
      kategorie: z.kategorie,
      gemeinsameTags: [],
    };
    if (!eintrag.gemeinsameTags.some((t) => t.id === z.tagId)) {
      eintrag.gemeinsameTags.push({ id: z.tagId, name: z.tagName, slug: z.tagSlug });
    }
    proBuch.set(z.buchId, eintrag);
  }

  return [...proBuch.values()]
    .sort((a, b) => b.gemeinsameTags.length - a.gemeinsameTags.length || a.titel.localeCompare(b.titel, "de"))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Kernaussagen → Konzepte (09/2026, Pendenz "Vernetzung")
// ---------------------------------------------------------------------------

export const MAX_TAGS_PRO_KERNAUSSAGE = 2;

// Ordnet jeder Kernaussage eines Buchinhalts 0–2 der Tags IHRES Buchs zu
// und ersetzt dabei bestehende Zuordnungen dieser Kernaussagen. Nur Tags
// des Buchs sind erlaubt — so bleibt das Vokabular klein und jede
// Kernaussage auf der Konzept-Seite ist über ihr Buch nachvollziehbar.
// Gibt die Anzahl Kernaussagen mit mindestens einem Tag zurück.
export async function kernaussagenZuordnen(
  buchId: string,
  buchinhaltId: string,
  titel: string,
  autor: string
): Promise<{ zugeordnet: number; gesamt: number }> {
  const buchTagListe = (await tagsFuerBuecher([buchId])).get(buchId) ?? [];
  const aussagen = await db
    .select({ id: kernaussagen.id, text: kernaussagen.text, erklaerung: kernaussagen.erklaerung })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId))
    .orderBy(asc(kernaussagen.reihenfolge));
  if (buchTagListe.length === 0 || aussagen.length === 0) return { zugeordnet: 0, gesamt: aussagen.length };

  const prompt = `Das Buch "${titel}" von ${autor} hat diese Konzept-Tags:
${buchTagListe.map((t) => `- ${t.name}`).join("\n")}

Ordne jeder Kernaussage unten 0 bis ${MAX_TAGS_PRO_KERNAUSSAGE} dieser Tags zu — nur Tags, die die Kernaussage WIRKLICH inhaltlich behandelt (nicht bloss, weil das ganze Buch so getaggt ist). 0 Tags ist ausdrücklich erlaubt. Verwende die Tag-Namen exakt wie oben, keine neuen.

Kernaussagen:
${aussagen.map((a, i) => `${i}. ${a.text}\n   ${a.erklaerung}`).join("\n\n")}

Antworte ausschliesslich mit JSON, ohne Text davor oder danach:
{"zuordnungen": [{"index": 0, "tags": ["…"]}]}`;

  const daten = (await modellJson(prompt, 2000)) as { zuordnungen?: { index?: unknown; tags?: unknown }[] };
  if (!Array.isArray(daten?.zuordnungen)) throw new Error("Antwort enthält kein Feld 'zuordnungen'.");

  const tagNachSlug = new Map(buchTagListe.map((t) => [t.slug, t]));
  const neu: { kernaussageId: string; tagId: string }[] = [];
  const mitTag = new Set<string>();
  for (const z of daten.zuordnungen) {
    const index = typeof z?.index === "number" ? z.index : Number(z?.index);
    const aussage = Number.isInteger(index) ? aussagen[index] : undefined;
    if (!aussage || !Array.isArray(z.tags)) continue;
    const gewaehlt = new Set<string>();
    for (const name of z.tags) {
      if (typeof name !== "string") continue;
      const tag = tagNachSlug.get(slug(name));
      if (!tag || gewaehlt.has(tag.id) || gewaehlt.size >= MAX_TAGS_PRO_KERNAUSSAGE) continue;
      gewaehlt.add(tag.id);
      neu.push({ kernaussageId: aussage.id, tagId: tag.id });
      mitTag.add(aussage.id);
    }
  }

  await db.delete(kernaussageTags).where(inArray(kernaussageTags.kernaussageId, aussagen.map((a) => a.id)));
  if (neu.length > 0) {
    await db.insert(kernaussageTags).values(neu).onConflictDoNothing({
      target: [kernaussageTags.kernaussageId, kernaussageTags.tagId],
    });
  }
  return { zugeordnet: mitTag.size, gesamt: aussagen.length };
}

export async function hatKernaussageTags(buchinhaltId: string): Promise<boolean> {
  const [z] = await db
    .select({ tagId: kernaussageTags.tagId })
    .from(kernaussageTags)
    .innerJoin(kernaussagen, eq(kernaussageTags.kernaussageId, kernaussagen.id))
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId))
    .limit(1);
  return Boolean(z);
}

// ---------------------------------------------------------------------------
// Konsolidierung (09/2026, Pendenz "Vernetzung") — ähnliche Tags
// zusammenführen, siehe src/scripts/tags-konsolidieren.ts
// ---------------------------------------------------------------------------

export type Zusammenfuehrung = { von: string; nach: string; begruendung: string };

// Das Modell sieht das ganze Vokabular (mit Büchern) und schlägt NUR echte
// Dubletten vor: Synonyme, andere Schreibweisen oder ein Tag, der
// praktisch denselben Begriff meint. Verwandte, aber verschiedene Konzepte
// bleiben getrennt — die Verbindung entsteht dort über gemeinsame Bücher.
export async function zusammenfuehrungenVorschlagen(): Promise<Zusammenfuehrung[]> {
  const vokabular = await ladeVokabular();
  if (vokabular.length < 2) return [];
  const buecherProTag = await db
    .select({ tagId: buchTags.tagId, titel: buecher.titel })
    .from(buchTags)
    .innerJoin(buecher, eq(buchTags.buchId, buecher.id));
  const titelVon = (tagId: string) => buecherProTag.filter((b) => b.tagId === tagId).map((b) => b.titel);

  const prompt = `Hier ist das Tag-Vokabular einer persönlichen Buch-Bibliothek, mit den Büchern pro Tag:

${vokabular.map((v) => `- ${v.name}: ${titelVon(v.id).join("; ") || "(keine Bücher)"}`).join("\n")}

Finde Tags, die ZUSAMMENGEFÜHRT werden sollten, weil sie dasselbe Konzept bezeichnen: Synonyme, andere Schreib- oder Wortformen, oder ein Begriff, der praktisch deckungsgleich mit einem anderen ist.

NICHT zusammenführen: verwandte, aber verschiedene Konzepte (z.B. "Stoizismus" und "Tugendethik", "Kognitionspsychologie" und "Verhaltensökonomie") und Ober-/Unterbegriffe — die verbinden sich bereits über gemeinsame Bücher. Im Zweifel NICHT zusammenführen.

Ziel ("nach") ist jeweils der gebräuchlichere bzw. breiter verwendete Tag, exakt wie oben geschrieben. Keine Ketten (ein Ziel darf nicht selbst "von" sein).

Antworte ausschliesslich mit JSON, ohne Text davor oder danach:
{"zusammenfuehrungen": [{"von": "…", "nach": "…", "begruendung": "…"}]}`;

  const daten = (await modellJson(prompt, 4000)) as {
    zusammenfuehrungen?: { von?: unknown; nach?: unknown; begruendung?: unknown }[];
  };
  if (!Array.isArray(daten?.zusammenfuehrungen)) throw new Error("Antwort enthält kein Feld 'zusammenfuehrungen'.");

  const bekannt = new Set(vokabular.map((v) => v.slug));
  const ergebnis: Zusammenfuehrung[] = [];
  const ziele = new Set<string>();
  const quellen = new Set<string>();
  for (const z of daten.zusammenfuehrungen) {
    if (typeof z?.von !== "string" || typeof z?.nach !== "string") continue;
    const von = slug(z.von);
    const nach = slug(z.nach);
    if (!bekannt.has(von) || !bekannt.has(nach) || von === nach) continue;
    if (quellen.has(von) || ziele.has(von) || quellen.has(nach)) continue; // keine Ketten
    quellen.add(von);
    ziele.add(nach);
    ergebnis.push({
      von: vokabular.find((v) => v.slug === von)!.name,
      nach: vokabular.find((v) => v.slug === nach)!.name,
      begruendung: typeof z.begruendung === "string" ? z.begruendung : "",
    });
  }
  return ergebnis;
}

// Führt Tag "von" in Tag "nach" zusammen: Bücher und Kernaussagen werden
// umgehängt, slug + aliase von "von" als aliase bei "nach" hinterlegt
// (künftige Vorschläge landen so direkt beim Ziel), dann "von" gelöscht.
export async function tagsZusammenfuehren(vonName: string, nachName: string): Promise<void> {
  const vokabular = await ladeVokabular();
  const von = findeImVokabular(vokabular, vonName);
  const nach = findeImVokabular(vokabular, nachName);
  if (!von || !nach) throw new Error(`Tag nicht gefunden: ${!von ? vonName : nachName}`);
  if (von.id === nach.id) return;

  const buecherVon = await db.select({ buchId: buchTags.buchId }).from(buchTags).where(eq(buchTags.tagId, von.id));
  if (buecherVon.length > 0) {
    await db
      .insert(buchTags)
      .values(buecherVon.map((b) => ({ buchId: b.buchId, tagId: nach.id })))
      .onConflictDoNothing({ target: [buchTags.buchId, buchTags.tagId] });
  }
  const aussagenVon = await db
    .select({ kernaussageId: kernaussageTags.kernaussageId })
    .from(kernaussageTags)
    .where(eq(kernaussageTags.tagId, von.id));
  if (aussagenVon.length > 0) {
    await db
      .insert(kernaussageTags)
      .values(aussagenVon.map((a) => ({ kernaussageId: a.kernaussageId, tagId: nach.id })))
      .onConflictDoNothing({ target: [kernaussageTags.kernaussageId, kernaussageTags.tagId] });
  }

  const aliase = [...new Set([...nach.aliase, von.slug, ...von.aliase])].filter((a) => a !== nach.slug);
  await db.update(tags).set({ aliase }).where(eq(tags.id, nach.id));
  await db.delete(buchTags).where(eq(buchTags.tagId, von.id));
  await db.delete(tags).where(eq(tags.id, von.id)); // kernaussage_tags: cascade
}
