// app/lesen/[id]/page.tsx
//
// "Lesen"-Screen: Zusammenfassung, Entstehungsgeschichte, Autor, optional
// Kernzitat — mit Vertrauenshinweis-Icon pro Abschnitt (Häkchen = "verifiziert",
// "i" = "eingeordnet"). [id] ist die buchinhalt-ID.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../src/db";
import { buchinhalte, buecher, konten } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../../src/lib/kategorien";
import { sicherstelleGezeigt } from "../../../src/lib/tagesbuch";
import MenuButton from "../../MenuButton";
import NavKreise from "../../NavKreise";
import StatusBarColor from "../../StatusBarColor";

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
            fontSize: 13,
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
function parseZusammenfassung(text: string): { titel: string | null; body: string }[] {
  const teile = text.split(/\n(?=##\s)/);
  return teile
    .map((teil) => {
      const match = teil.match(/^##\s+(.+?)\n([\s\S]*)$/);
      if (match) {
        return { titel: match[1].trim(), body: match[2].trim() };
      }
      return { titel: null, body: teil.trim() };
    })
    .filter((t) => t.body.length > 0);
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
  const zusammenfassungsAbschnitte = parseZusammenfassung(zeile.zusammenfassung);

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
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
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Lesen</span>
        </div>
        <MenuButton />
      </div>

      <span
        style={{
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "rgba(36,35,31,.62)",
        }}
      >
        {zeile.titel} — {kategorieLabel}
      </span>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        <Abschnitt label="Zusammenfassung" hinweis={vh.zusammenfassung}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {zusammenfassungsAbschnitte.map((abschnitt, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {abschnitt.titel && (
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>
                    {abschnitt.titel}
                  </span>
                )}
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{abschnitt.body}</p>
              </div>
            ))}
          </div>
        </Abschnitt>

        <Abschnitt label="Entstehungsgeschichte" hinweis={vh.entstehungsgeschichte}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{zeile.entstehungsgeschichte}</p>
        </Abschnitt>

        {zeile.autorenhintergrund && (
          <Abschnitt label="Autor" hinweis={vh.autorenhintergrund}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{zeile.autorenhintergrund}</p>
          </Abschnitt>
        )}

        {zeile.kernzitatOriginal && (
          <Abschnitt label="Kernzitat" hinweis={vh.kernzitat}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontStyle: "italic" }}>
                „{zeile.kernzitatOriginal}“
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(36,35,31,.7)" }}>
                {zeile.kernzitatUebersetzung}
              </p>
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
