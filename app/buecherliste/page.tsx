// app/buecherliste/page.tsx
//
// Zweiter sekundärer Screen: die Wunschliste. Pinnt oben das heute schon
// gezeigte Buch (falls die Home-Seite heute schon aufgerufen wurde — kein
// eigener Auswahl-Nebeneffekt hier, das bleibt Aufgabe von tagesbuch.ts),
// darunter zwei aufklappbare Abschnitte: "Geladen" (bereits produzierte
// Bücher, "Jetzt lesen") und "Noch pendent" (Kategorie-Punkt statt
// Zugehörigkeit, mit AufbereitenButton/PrioritaetToggle). Aufgeteilt und
// "Noch pendent" standardmässig eingeklappt, damit man bei wachsender
// Wunschliste (aktuell 64 Einträge) nicht an den fertigen Büchern
// vorbeiscrollen muss, um sie zu finden. Reines HTML <details>/<summary>,
// kein Client-JS nötig für das Auf-/Zuklappen.
// "+"-Button bewusst oben im Header statt unten als grosser Kreisbutton
// (wie sonst üblich) — bei wachsender Listenlänge müsste man sonst erst
// runterscrollen, um ein Buch hinzuzufügen.

import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "../../src/db";
import { buchinhalte, buecher, gezeigteBuecher, konten, wunschlisteneintraege } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../src/lib/kategorien";
import { vorschlaege } from "../../src/lib/vorschlag";
import MenuButton from "../MenuButton";
import PrioritaetToggle from "./PrioritaetToggle";
import AufbereitenButton from "./AufbereitenButton";

export const dynamic = "force-dynamic";

type Zeile = {
  id: string;
  rohTitel: string | null;
  rohAutor: string | null;
  bald: boolean;
  buchId: string | null;
  titel: string | null;
  autor: string | null;
  kategorie: string | null;
  buchinhaltId: string | null;
};

function ZeilenKarte({ zeile }: { zeile: Zeile }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        padding: "14px 16px",
        borderRadius: 14,
        background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        {zeile.kategorie ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[zeile.kategorie] ?? "#ccc", flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "rgba(36,35,31,.55)",
              }}
            >
              {KATEGORIE_LABEL[zeile.kategorie] ?? zeile.kategorie}
            </span>
          </div>
        ) : (
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.55)",
            }}
          >
            Noch nicht zugeordnet
          </span>
        )}
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15 }}>
          {zeile.titel ?? zeile.rohTitel}
        </span>
        {(zeile.autor ?? zeile.rohAutor) && (
          <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.65)" }}>{zeile.autor ?? zeile.rohAutor}</span>
        )}
        {!zeile.buchinhaltId && zeile.buchId && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <PrioritaetToggle eintragId={zeile.id} aktiv={zeile.bald} />
            <AufbereitenButton buchId={zeile.buchId} />
          </div>
        )}
      </div>
      {zeile.bald && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M6 3.5v17" />
          <path d="M6 4h11l-3 3.5 3 3.5H6" />
        </svg>
      )}
      {zeile.buchinhaltId && (
        <Link href={`/lesen/${zeile.buchinhaltId}`} aria-label="Jetzt lesen">
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#24231F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBFAF7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 5.5 16 12l-6.5 6.5" />
            </svg>
          </div>
        </Link>
      )}
    </div>
  );
}

function Abschnitt({
  titel,
  anzahl,
  offenPerVoreinstellung,
  kinder,
}: {
  titel: string;
  anzahl: number;
  offenPerVoreinstellung: boolean;
  kinder: ReactNode;
}) {
  if (anzahl === 0) return null;
  return (
    <details open={offenPerVoreinstellung} className="buecherliste-abschnitt">
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 600,
          fontSize: 11,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "rgba(36,35,31,.62)",
          padding: "4px 0",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5.5 15.5 12 9 18.5" />
        </svg>
        {titel} ({anzahl})
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>{kinder}</div>
    </details>
  );
}

export default async function BuecherlisteSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const heute = new Date();

  const [heutigesBuch] = await db
    .select({
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
    })
    .from(gezeigteBuecher)
    .innerJoin(buchinhalte, eq(gezeigteBuecher.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(gezeigteBuecher.kontoId, konto.id), eq(gezeigteBuecher.datumGezeigt, heute)));

  const liste = await db
    .select({
      id: wunschlisteneintraege.id,
      rohTitel: wunschlisteneintraege.rohTitel,
      rohAutor: wunschlisteneintraege.rohAutor,
      bald: wunschlisteneintraege.bald,
      buchId: buecher.id,
      titel: buecher.titel,
      autor: buecher.autor,
      kategorie: buecher.kategorie,
      buchinhaltId: buchinhalte.id,
    })
    .from(wunschlisteneintraege)
    .leftJoin(buecher, eq(wunschlisteneintraege.buchId, buecher.id))
    .leftJoin(buchinhalte, and(eq(buchinhalte.buchId, buecher.id), eq(buchinhalte.status, "im_vorrat")))
    .where(eq(wunschlisteneintraege.kontoId, konto.id));

  // Reine Vorschau, kein Seiteneffekt — dieselbe Funktion, die auch der
  // Cron-Job nutzt, um zu entscheiden, was als Nächstes produziert wird.
  const naechsteKandidaten = await vorschlaege(konto.id, 3);

  const zeilen = liste.filter((z) => z.buchId !== heutigesBuch?.buchId);

  const geladeneZeilen = zeilen
    .filter((z) => z.buchinhaltId)
    .sort((a, b) => (a.titel ?? a.rohTitel ?? "").localeCompare(b.titel ?? b.rohTitel ?? ""));

  const pendenteZeilen = zeilen
    .filter((z) => !z.buchinhaltId)
    .sort((a, b) => {
      if (a.bald !== b.bald) return a.bald ? -1 : 1;
      return (a.titel ?? a.rohTitel ?? "").localeCompare(b.titel ?? b.rohTitel ?? "");
    });

  return (
    <main
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
      }}
    >
      <style>{`
        .buecherliste-abschnitt summary { list-style: none; }
        .buecherliste-abschnitt summary::-webkit-details-marker { display: none; }
        .buecherliste-abschnitt summary svg { transition: transform .15s ease; }
        .buecherliste-abschnitt[open] > summary svg { transform: rotate(90deg); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" aria-label="Schliessen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </Link>
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Bücherliste</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link href="/buecherliste/neu" aria-label="Buch hinzufügen">
            <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5.5" x2="12" y2="18.5" />
                <line x1="5.5" y1="12" x2="18.5" y2="12" />
              </svg>
            </div>
          </Link>
          <MenuButton />
        </div>
      </div>

      {fehler && (
        <div
          style={{
            boxSizing: "border-box",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(36,35,31,.08)",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          {fehler === "verworfen"
            ? "Aufbereitung fehlgeschlagen: die Prüfung hat den Entwurf nicht bestanden. Einfach nochmal versuchen."
            : "Aufbereitung fehlgeschlagen (technischer Fehler, z.B. unbrauchbare Modellantwort). Einfach nochmal versuchen."}
        </div>
      )}

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
        {liste.length} auf der Liste
      </span>

      {naechsteKandidaten.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.5)",
            }}
          >
            Als Nächstes automatisch dran
          </span>
          <span style={{ fontSize: 12.5, color: "rgba(36,35,31,.7)", lineHeight: 1.5 }}>
            {naechsteKandidaten.map((k) => k.titel).join(" · ")}
          </span>
        </div>
      )}

      {liste.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
            <path d="M12 6.5c-1.8-1.3-4.2-1.8-6.5-1.3v11c2.3-.5 4.7 0 6.5 1.3 1.8-1.3 4.2-1.8 6.5-1.3v-11c-2.3-.5-4.7 0-6.5 1.3Z" />
            <path d="M12 6.5v11" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 250 }}>
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>Noch keine Bücher</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Füge ein Buch hinzu, das dich interessiert — den Rest übernimmt die App.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
          {heutigesBuch && (
            <div
              style={{
                boxSizing: "border-box",
                padding: "14px 16px",
                borderRadius: 14,
                background: "#24231F",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span
                  style={{
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: "rgba(251,250,247,.65)",
                  }}
                >
                  Heute · {KATEGORIE_LABEL[heutigesBuch.kategorie] ?? heutigesBuch.kategorie}
                </span>
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 15, color: "#FBFAF7" }}>
                  {heutigesBuch.titel}
                </span>
                <span style={{ fontSize: 12.5, color: "rgba(251,250,247,.75)" }}>{heutigesBuch.autor}</span>
              </div>
            </div>
          )}

          <Abschnitt
            titel="Geladen"
            anzahl={geladeneZeilen.length}
            offenPerVoreinstellung
            kinder={geladeneZeilen.map((zeile) => (
              <ZeilenKarte key={zeile.id} zeile={zeile} />
            ))}
          />

          <Abschnitt
            titel="Noch pendent"
            anzahl={pendenteZeilen.length}
            offenPerVoreinstellung={false}
            kinder={pendenteZeilen.map((zeile) => (
              <ZeilenKarte key={zeile.id} zeile={zeile} />
            ))}
          />
        </div>
      )}
    </main>
  );
}
