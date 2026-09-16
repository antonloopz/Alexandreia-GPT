// src/lib/obsidian.ts
//
// Obsidian-Export für Notizen (09/2026, Pendenz "Obsidian-Export für
// Notizen fertigstellen") — Schema hatte bereits notizen.obsidianExportiertAm
// und kontoeinstellungen.obsidianVaultName/obsidianExportAktiv vorgesehen,
// aber keine tatsächliche Export-Logik dahinter (nur der Ein/Aus-Schalter in
// app/einstellungen/actions.ts).
//
// Format-Entscheid (Rückfrage an den Nutzer, 09/2026): eine Markdown-Datei
// PRO BUCH (nicht pro einzelner Notiz) — entspricht dem üblichen "ein Buch =
// eine Notiz"-Muster in Obsidian. Ausgeliefert wird ein ZIP mit allen
// fälligen Buch-Dateien (Route Handler, siehe app/einstellungen/obsidian-
// export/route.ts — eine Server Action kann keinen Datei-Download liefern).
//
// "Fällig" = inkrementell auf BUCH-Ebene, nicht auf Notiz-Ebene: ein Buch
// wird nur neu in die ZIP aufgenommen, wenn mindestens eine seiner Notizen
// noch nie exportiert wurde (obsidianExportiertAm IS NULL). Die erzeugte
// Datei enthält dann aber IMMER ALLE Notizen des Buchs (nicht nur die
// neuen) — sonst würde ein späterer Export dieselbe Buch-Datei im Vault
// fragmentieren statt zu ersetzen. Die App bleibt die Quelle der Wahrheit;
// die Obsidian-Datei ist ein regenerierter Spiegel und wird bei jedem
// weiteren Export ERSETZT — das steht auch im Dateikopf, damit direkt in
// Obsidian nachgetragene Ergänzungen nicht versehentlich überschrieben
// werden, ohne dass der Nutzer gewarnt wurde.

import JSZip from "jszip";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { buchinhalte, buecher, kernaussagen, kontoeinstellungen, notizen } from "../db/schema";
import { KATEGORIE_LABEL } from "./kategorien";
import { FELD_LABEL, type NotizFeld } from "./notizen";

type ExportNotiz = {
  id: string;
  feld: NotizFeld;
  textAuszug: string;
  text: string | null;
  kernaussageId: string | null;
  erstelltAm: Date;
};

type ExportBuch = {
  buchinhaltId: string;
  titel: string;
  autor: string;
  kategorie: string;
  notizen: ExportNotiz[];
};

// Reihenfolge der Feld-Gruppen in der erzeugten Datei — entspricht der
// Reihenfolge, in der die Felder im Lesen-Screen vorkommen.
const FELD_REIHENFOLGE: NotizFeld[] = [
  "zusammenfassung",
  "entstehungsgeschichte",
  "autorenhintergrund",
  "kernzitat_original",
  "kernzitat_uebersetzung",
  "kernaussage_text",
  "kernaussage_erklaerung",
];

function sanitizeDateiname(titel: string): string {
  const bereinigt = titel
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return bereinigt.length > 0 ? bereinigt : "Ohne Titel";
}

function frontmatterEscape(wert: string): string {
  return wert.replace(/"/g, '\\"');
}

function datumKurz(datum: Date): string {
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(datum);
}

function notizAbschnitt(notiz: ExportNotiz): string {
  const zeilen = [`> ${notiz.textAuszug.replace(/\n/g, "\n> ")}`];
  if (notiz.text) zeilen.push("", notiz.text);
  zeilen.push("", `*Erfasst am ${datumKurz(notiz.erstelltAm)}*`);
  return zeilen.join("\n");
}

async function kernaussageTexte(buchinhaltId: string): Promise<Map<string, { text: string; reihenfolge: number }>> {
  const zeilen = await db
    .select({ id: kernaussagen.id, text: kernaussagen.text, reihenfolge: kernaussagen.reihenfolge })
    .from(kernaussagen)
    .where(eq(kernaussagen.buchinhaltId, buchinhaltId));
  return new Map(zeilen.map((z) => [z.id, { text: z.text, reihenfolge: z.reihenfolge }]));
}

async function buchMarkdownInhalt(buch: ExportBuch, exportiertAm: Date): Promise<string> {
  const kategorieLabel = KATEGORIE_LABEL[buch.kategorie] ?? buch.kategorie;
  const kopf = [
    "---",
    `titel: "${frontmatterEscape(buch.titel)}"`,
    `autor: "${frontmatterEscape(buch.autor)}"`,
    `kategorie: "${frontmatterEscape(kategorieLabel)}"`,
    `exportiert: ${exportiertAm.toISOString()}`,
    "tags: [alexandreia]",
    "---",
    "",
    "> [!info] Diese Datei wird von Alexandreia automatisch erzeugt und beim nächsten Export ERSETZT. Eigene Ergänzungen bitte in einer separaten, verlinkten Notiz vornehmen — sie würden hier sonst überschrieben.",
    "",
    `# ${buch.titel}`,
    `*${buch.autor} · ${kategorieLabel}*`,
  ];

  const brauchtKernaussagen = buch.notizen.some((n) => n.feld === "kernaussage_text" || n.feld === "kernaussage_erklaerung");
  const kernaussagenMap = brauchtKernaussagen
    ? await kernaussageTexte(buch.buchinhaltId)
    : new Map<string, { text: string; reihenfolge: number }>();

  const abschnitte: string[] = [];
  for (const feld of FELD_REIHENFOLGE) {
    const treffer = buch.notizen.filter((n) => n.feld === feld);
    if (treffer.length === 0) continue;

    abschnitte.push(`## ${FELD_LABEL[feld]}`);

    if (feld === "kernaussage_text" || feld === "kernaussage_erklaerung") {
      // Nach Kernaussage gruppieren (mehrere Kernaussagen desselben Buchs
      // sonst nicht unterscheidbar), sortiert nach deren Reihenfolge im Buch.
      const gruppen = new Map<string, ExportNotiz[]>();
      for (const n of treffer) {
        const schluessel = n.kernaussageId ?? "";
        if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
        gruppen.get(schluessel)!.push(n);
      }
      const sortiert = [...gruppen.entries()].sort((a, b) => {
        const ra = kernaussagenMap.get(a[0])?.reihenfolge ?? 999;
        const rb = kernaussagenMap.get(b[0])?.reihenfolge ?? 999;
        return ra - rb;
      });
      for (const [kernaussageId, notes] of sortiert) {
        const kernaussageText = kernaussagenMap.get(kernaussageId)?.text;
        if (kernaussageText) abschnitte.push(`### ${kernaussageText}`);
        for (const n of notes) abschnitte.push(notizAbschnitt(n));
      }
    } else {
      for (const n of treffer) abschnitte.push(notizAbschnitt(n));
    }
  }

  return kopf.join("\n") + "\n\n" + abschnitte.join("\n\n") + "\n";
}

// Alle Bücher mit Notizen, gruppiert, inkl. Markierung welche Bücher
// "fällig" sind (mind. eine Notiz noch nie exportiert). Notizen ohne
// textAuszug (rein technisch möglich, siehe schema.ts) oder ohne
// buchinhaltId werden ausgeschlossen — analog app/notizen/page.tsx.
async function alleBuecherMitNotizen(kontoId: string): Promise<{ faellig: ExportBuch[]; alle: ExportBuch[] }> {
  const zeilen = await db
    .select({
      id: notizen.id,
      feld: notizen.feld,
      textAuszug: notizen.textAuszug,
      text: notizen.text,
      kernaussageId: notizen.kernaussageId,
      erstelltAm: notizen.erstelltAm,
      obsidianExportiertAm: notizen.obsidianExportiertAm,
      buchinhaltId: notizen.buchinhaltId,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(notizen)
    .innerJoin(buchinhalte, eq(notizen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(notizen.kontoId, kontoId), isNotNull(notizen.textAuszug)))
    .orderBy(desc(notizen.erstelltAm));

  const gruppen = new Map<string, ExportBuch>();
  const buchHatOffene = new Set<string>();
  for (const z of zeilen) {
    if (!z.buchinhaltId || !z.textAuszug) continue;
    if (z.obsidianExportiertAm === null) buchHatOffene.add(z.buchinhaltId);
    if (!gruppen.has(z.buchinhaltId)) {
      gruppen.set(z.buchinhaltId, {
        buchinhaltId: z.buchinhaltId,
        titel: z.titel,
        autor: z.autor,
        kategorie: z.kategorie,
        notizen: [],
      });
    }
    gruppen.get(z.buchinhaltId)!.notizen.push({
      id: z.id,
      feld: z.feld as NotizFeld,
      textAuszug: z.textAuszug,
      text: z.text,
      kernaussageId: z.kernaussageId,
      erstelltAm: z.erstelltAm,
    });
  }

  // Chronologisch aufsteigend innerhalb jedes Buchs — eine Export-Datei
  // liest sich sinnvoller vom ältesten zum neuesten Eintrag (die Notizen-
  // Übersicht selbst zeigt bewusst absteigend, siehe app/notizen/page.tsx).
  for (const buch of gruppen.values()) buch.notizen.sort((a, b) => a.erstelltAm.getTime() - b.erstelltAm.getTime());

  const alle = [...gruppen.values()];
  return { faellig: alle.filter((b) => buchHatOffene.has(b.buchinhaltId)), alle };
}

// Für die Einstellungen-Seite: wie viele Bücher/Notizen sind gerade fällig
// (zeigt dem Nutzer, ob "Jetzt exportieren" überhaupt etwas tun würde).
export async function obsidianExportStatus(kontoId: string): Promise<{ anzahlBuecher: number; anzahlNotizen: number }> {
  const { faellig } = await alleBuecherMitNotizen(kontoId);
  return { anzahlBuecher: faellig.length, anzahlNotizen: faellig.reduce((summe, b) => summe + b.notizen.length, 0) };
}

// Führt den eigentlichen Export durch: erzeugt die ZIP-Datei und markiert
// erst danach die enthaltenen Notizen als exportiert (Reihenfolge bewusst
// so — schlägt das Erzeugen fehl, bleibt der DB-Zustand unverändert).
// Liefert null, wenn nichts zu exportieren ist.
export async function obsidianExportDurchfuehren(
  kontoId: string
): Promise<{ zip: Uint8Array; anzahlBuecher: number; anzahlNotizen: number } | null> {
  const { faellig } = await alleBuecherMitNotizen(kontoId);
  if (faellig.length === 0) return null;

  const [einstellungen] = await db
    .select({ obsidianVaultName: kontoeinstellungen.obsidianVaultName })
    .from(kontoeinstellungen)
    .where(eq(kontoeinstellungen.kontoId, kontoId));
  const ordner = einstellungen?.obsidianVaultName?.trim();

  const zip = new JSZip();
  const exportiertAm = new Date();
  const vergebeneNamen = new Set<string>();
  let anzahlNotizen = 0;

  for (const buch of faellig) {
    const basisname = sanitizeDateiname(buch.titel);
    let dateiname = basisname;
    let n = 2;
    while (vergebeneNamen.has(dateiname)) {
      dateiname = `${basisname} (${n})`;
      n += 1;
    }
    vergebeneNamen.add(dateiname);

    const inhalt = await buchMarkdownInhalt(buch, exportiertAm);
    const pfad = ordner ? `${ordner}/${dateiname}.md` : `${dateiname}.md`;
    zip.file(pfad, inhalt);
    anzahlNotizen += buch.notizen.length;
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });

  const alleNotizIds = faellig.flatMap((b) => b.notizen.map((n) => n.id));
  await db.update(notizen).set({ obsidianExportiertAm: exportiertAm }).where(inArray(notizen.id, alleNotizIds));

  return { zip: zipBuffer, anzahlBuecher: faellig.length, anzahlNotizen };
}

export type { ExportBuch, ExportNotiz };
