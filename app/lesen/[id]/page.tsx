// app/lesen/[id]/page.tsx
//
// "Lesen"-Screen: Zusammenfassung, Entstehungsgeschichte, Autor, optional
// Kernzitat — mit Vertrauenshinweis-Icon pro Abschnitt (Häkchen = "verifiziert",
// "i" = "eingeordnet"). [id] ist die buchinhalt-ID.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import { buchinhalte, buecher, konten, notizen, repetitionselemente } from "../../../src/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import { sicherstelleGezeigt } from "../../../src/lib/tagesbuch";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";
import Hervorhebbarer, { type Hervorhebung } from "./Hervorhebbarer";
import type { NotizFeld } from "../../../src/lib/notizen";

export const dynamic = "force-dynamic";

type Vertrauenshinweis = "verifiziert" | "eingeordnet" | null | undefined;

function TrustIcon({ hinweis }: { hinweis: Vertrauenshinweis }) {
  if (hinweis === "verifiziert") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 12.5l3 3 6-6.5" />
      </svg>
    );
  }
  // "eingeordnet" (Standard, falls kein Hinweis vorliegt)
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.3" r="0.9" fill="#24231F" stroke="none" />
    </svg>
  );
}

function Abschnitt({
  label,
  hinweis,
  children,
}: {
  label: string;
  hinweis: Vertrauenshinweis;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "rgba(36,35,31,.7)",
          }}
        >
          {label}
        </span>
        <TrustIcon hinweis={hinweis} />
      </div>
      {children}
    </div>
  );
}

// Zusammenfassung kann "## Zwischentitel" enthalten (siehe entwurf.ts-Prompt)
// — bei längeren Texten in benannte Absätze aufteilen, sonst als ein Block.
//
// Seit 09/2026 (Pendenz "Zusammenfassung in drei Ebenen strukturieren")
// zusätzlich eine Ebene darüber: "# Worum geht es?", "# Argumentation" (bzw.
// kategorieabhängig "# Deutung & Motive"/"# Zusammenhänge") und
// "# Zusammenfassung" — jede wird ein eigener Abschnitt mit eigenem Label.
// Alte Texte ohne "# "-Überschriften ergeben genau eine Ebene ohne Titel und
// werden wie bisher unter "Zusammenfassung" angezeigt.
//
// Absätze mit dem Präfix "> Einordnung:" (siehe EINORDNUNG_PRAEFIX in
// entwurf.ts) sind Deutung durch Alexandreia, nicht Aussage des Autors —
// sie werden als eigene, optisch abgesetzte Blöcke herausgelöst. Alle
// übrigen Absätze bleiben wie bisher zu einem Textblock zusammengefasst
// (unverändert für Hervorhebungen, die per textAuszug im Text gesucht werden).
type Block = { einordnung: boolean; text: string };
type Unterabschnitt = { titel: string | null; bloecke: Block[] };
type Ebene = { titel: string | null; unterabschnitte: Unterabschnitt[] };

const EINORDNUNG_MUSTER = /^>\s*Einordnung:\s*/;

function parseBloecke(body: string): Block[] {
  const bloecke: Block[] = [];
  let sammler: string[] = [];
  const sammlerAbschliessen = () => {
    if (sammler.length > 0) bloecke.push({ einordnung: false, text: sammler.join("\n\n") });
    sammler = [];
  };
  // Absatzgrenze = Leerzeile ODER Zeilenumbruch direkt vor "> Einordnung:"
  // (falls das Modell die Einordnung ohne Leerzeile anhängt).
  for (const absatz of body.split(/\n\s*\n|\n(?=>\s*Einordnung:)/)) {
    const getrimmt = absatz.trim();
    if (!getrimmt) continue;
    if (EINORDNUNG_MUSTER.test(getrimmt)) {
      sammlerAbschliessen();
      // Evtl. über mehrere Zeilen fortgesetzte "> "-Zitatzeilen mit entfernen.
      const text = getrimmt.replace(EINORDNUNG_MUSTER, "").replace(/\n>\s?/g, "\n").trim();
      if (text) bloecke.push({ einordnung: true, text });
    } else {
      sammler.push(getrimmt);
    }
  }
  sammlerAbschliessen();
  return bloecke;
}

function parseUnterabschnitte(text: string): Unterabschnitt[] {
  const teile = text.split(/\n(?=##\s)/);
  return teile
    .map((teil) => {
      const match = teil.match(/^##\s+(.+?)\n([\s\S]*)$/);
      if (match) {
        return { titel: match[1].trim(), bloecke: parseBloecke(match[2]) };
      }
      return { titel: null, bloecke: parseBloecke(teil) };
    })
    .filter((t) => t.bloecke.length > 0);
}

function parseZusammenfassung(text: string): Ebene[] {
  // "#\s" trifft nur Überschriften erster Ebene — "## " hat an zweiter
  // Stelle ein "#" statt Leerraum.
  const teile = text.trim().split(/\n(?=#\s)/);
  return teile
    .map((teil) => {
      const match = teil.match(/^#\s+(.+?)\n([\s\S]*)$/);
      if (match) {
        return { titel: match[1].trim(), unterabschnitte: parseUnterabschnitte(match[2].trim()) };
      }
      return { titel: null, unterabschnitte: parseUnterabschnitte(teil.trim()) };
    })
    .filter((e) => e.unterabschnitte.length > 0);
}

export default async function LesenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [zeile] = await db
    .select({
      buchinhaltId: buchinhalte.id,
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      zusammenfassung: buchinhalte.zusammenfassung,
      entstehungsgeschichte: buchinhalte.entstehungsgeschichte,
      autorenhintergrund: buchinhalte.autorenhintergrund,
      kernzitatOriginal: buchinhalte.kernzitatOriginal,
      kernzitatUebersetzung: buchinhalte.kernzitatUebersetzung,
      vertrauenshinweise: buchinhalte.vertrauenshinweise,
    })
    .from(buchinhalte)
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(eq(buchinhalte.id, id));

  if (!zeile) notFound();

  // Markiert das Buch als "gezeigt", falls es noch keine gezeigteBuecher-
  // Zeile hat — betrifft v.a. selbst geöffnete "Bereit"-Bücher (Home
  // "Weiterlesen", Bookshelf), die nicht über naechstesBuchFuerHeute
  // laufen. Ohne das würden sie nie in Bookshelfs "Gelesen"-Historie oder
  // den Streak einfliessen. Für das offizielle Tagesbuch ist die Zeile an
  // dieser Stelle schon vorhanden (von Home angelegt) — sicherstelleGezeigt
  // ist idempotent, macht dann nichts.
  const [konto] = await db.select().from(konten).limit(1);
  if (konto) {
    await sicherstelleGezeigt(konto.id, zeile.buchinhaltId, zeile.buchId);
  }

  const akzent = KATEGORIE_FARBE[zeile.kategorie] ?? "var(--paper)";
  const kategorieLabel = KATEGORIE_LABEL[zeile.kategorie] ?? zeile.kategorie;
  const vh = (zeile.vertrauenshinweise ?? {}) as Record<string, Vertrauenshinweis>;
  const zusammenfassungsEbenen = parseZusammenfassung(zeile.zusammenfassung);

  // Bestehende Hervorhebungen/Notizen dieses Buchinhalts, nach Feld sortiert
  // (Feature "Notiz-/Highlight-Funktion" 09/2026) — an Hervorhebbarer
  // weitergegeben, das damit die passenden Textstellen farbig markiert.
  const hervorhebungenZeilen = konto
    ? await db
        .select({ id: notizen.id, feld: notizen.feld, textAuszug: notizen.textAuszug, text: notizen.text })
        .from(notizen)
        .where(and(eq(notizen.buchinhaltId, zeile.buchinhaltId), eq(notizen.kontoId, konto.id)))
    : [];

  // Welche dieser Hervorhebungen bereits zur Wiederholung hinzugefügt sind
  // (Pendenz "Notizen/Hervorhebungen optional in die Wiederholung
  // aufnehmen", 09/2026) — an Hervorhebbarer weitergegeben, damit dessen
  // Popover den Umschalter im richtigen Zustand zeigt.
  const wiederholteZeilen = konto
    ? await db
        .select({ notizId: repetitionselemente.notizId })
        .from(repetitionselemente)
        .where(and(eq(repetitionselemente.kontoId, konto.id), isNotNull(repetitionselemente.notizId)))
    : [];
  const wiederholtSet = new Set(wiederholteZeilen.map((w) => w.notizId));

  const nachFeld = (feld: NotizFeld): Hervorhebung[] =>
    hervorhebungenZeilen
      .filter((h) => h.feld === feld && h.textAuszug)
      .map((h) => ({
        id: h.id,
        textAuszug: h.textAuszug as string,
        text: h.text,
        inWiederholung: wiederholtSet.has(h.id),
      }));

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        paddingBottom: 32,
        background: akzent,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <StatusBarColor farbe={akzent} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" aria-label="Zurück">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Lesen</span>
        </div>
        {/* Menü in der Kopfzeile statt in einer eigenen Zeile darunter
            (09/2026) — mehr Höhe für den Scrollbereich. */}
        <MenuButton inline />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        {/* Buchtitel scrollt mit (09/2026), statt fest über dem Lesebereich
            Platz zu belegen. */}
        <span
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "rgba(36,35,31,.62)",
          }}
        >
          {zeile.titel} — {kategorieLabel}
        </span>
        {zusammenfassungsEbenen.map((ebene, e) => (
          <Abschnitt key={e} label={ebene.titel ?? "Zusammenfassung"} hinweis={vh.zusammenfassung}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ebene.unterabschnitte.map((abschnitt, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {abschnitt.titel && (
                    <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
                      {abschnitt.titel}
                    </span>
                  )}
                  {abschnitt.bloecke.map((block, b) =>
                    block.einordnung ? (
                      <div
                        key={b}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          borderLeft: "2px solid rgba(36,35,31,.35)",
                          paddingLeft: 12,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "Helvetica, Arial, sans-serif",
                            fontWeight: 700,
                            fontSize: 12,
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            color: "rgba(36,35,31,.55)",
                          }}
                        >
                          Einordnung Alexandreia
                        </span>
                        <Hervorhebbarer
                          text={block.text}
                          buchinhaltId={zeile.buchinhaltId}
                          feld="zusammenfassung"
                          bestehende={nachFeld("zusammenfassung")}
                          akzent={akzent}
                          style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(36,35,31,.72)" }}
                        />
                      </div>
                    ) : (
                      <Hervorhebbarer
                        key={b}
                        text={block.text}
                        buchinhaltId={zeile.buchinhaltId}
                        feld="zusammenfassung"
                        bestehende={nachFeld("zusammenfassung")}
                        akzent={akzent}
                        style={{ fontSize: 17, lineHeight: 1.55 }}
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          </Abschnitt>
        ))}

        <Abschnitt label="Entstehungsgeschichte" hinweis={vh.entstehungsgeschichte}>
          <Hervorhebbarer
            text={zeile.entstehungsgeschichte}
            buchinhaltId={zeile.buchinhaltId}
            feld="entstehungsgeschichte"
            bestehende={nachFeld("entstehungsgeschichte")}
            akzent={akzent}
            style={{ fontSize: 17, lineHeight: 1.55 }}
          />
        </Abschnitt>

        {zeile.autorenhintergrund && (
          <Abschnitt label="Autor" hinweis={vh.autorenhintergrund}>
            <Hervorhebbarer
              text={zeile.autorenhintergrund}
              buchinhaltId={zeile.buchinhaltId}
              feld="autorenhintergrund"
              bestehende={nachFeld("autorenhintergrund")}
              akzent={akzent}
              style={{ fontSize: 17, lineHeight: 1.55 }}
            />
          </Abschnitt>
        )}

        {zeile.kernzitatOriginal && (
          <Abschnitt label="Kernzitat" hinweis={vh.kernzitat}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Hervorhebbarer
                text={zeile.kernzitatOriginal}
                buchinhaltId={zeile.buchinhaltId}
                feld="kernzitat_original"
                bestehende={nachFeld("kernzitat_original")}
                akzent={akzent}
                style={{ fontSize: 17, lineHeight: 1.55, fontStyle: "italic" }}
                praefix="„"
                suffix="“"
              />
              {zeile.kernzitatUebersetzung && (
                <Hervorhebbarer
                  text={zeile.kernzitatUebersetzung}
                  buchinhaltId={zeile.buchinhaltId}
                  feld="kernzitat_uebersetzung"
                  bestehende={nachFeld("kernzitat_uebersetzung")}
                  akzent={akzent}
                  style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(36,35,31,.7)" }}
                />
              )}
            </div>
          </Abschnitt>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link href={`/kernaussagen/${zeile.buchinhaltId}`} aria-label="Weiter zu Kernaussagen">
            <div
              style={{
                width: 56,
                height: 32,
                borderRadius: 999,
                background: "#24231F",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={akzent} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 5.5 16 12l-6.5 6.5" />
              </svg>
            </div>
          </Link>
        </div>
        <NavKreise buchinhaltId={zeile.buchinhaltId} akzent={akzent} aktiv="lesen" />
      </div>
    </main>
  );
}
