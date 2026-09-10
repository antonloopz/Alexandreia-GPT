// app/buecherliste/page.tsx
//
// Wunschliste — jetzt eigenständig für NUR NOCH NICHT produzierte Bücher.
// Die bereits fertigen Bücher ("Jetzt lesen") sind in die neue Bibliothek
// (app/bookshelf/page.tsx) umgezogen, damit diese Liste nicht mehr mit
// Einträgen vollläuft, die man hier eigentlich gar nicht mehr braucht.
// Jeder Eintrag hat zwei Aktionen: sofort ad-hoc aufbereiten
// (AufbereitenButton) oder für den nächsten automatischen Cron-Lauf
// vormerken (PrioritaetToggle) — siehe actions.ts. Zusätzlich eine
// aufklappbare "Kategorie-Rotation"-Übersicht: pro Kategorie der aktuelle
// Bestand und das jeweils nächste vorgesehene Buch.
// "+"-Button bewusst oben im Header statt unten als grosser Kreisbutton
// (wie sonst üblich) — bei wachsender Listenlänge müsste man sonst erst
// runterscrollen, um ein Buch hinzuzufügen.

import Link from "next/link";
import { after } from "next/server";
import { db } from "../../src/db";
import { buchinhalte, buecher, konten, wunschlisteneintraege } from "../../src/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../src/lib/kategorien";
import { kategorieUebersicht, vorschlaege } from "../../src/lib/vorschlag";
import { sicherstelleUmfang } from "../../src/lib/umfang";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import PrioritaetToggle from "./PrioritaetToggle";
import AufbereitenButton from "./AufbereitenButton";

export const dynamic = "force-dynamic";

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

  // Nur Einträge OHNE fertigen ("im_vorrat") Buchinhalt — die mit sind
  // jetzt in der Bibliothek zu finden.
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
      umfang: buecher.umfang,
      umfangGeprueftAm: buecher.umfangGeprueftAm,
    })
    .from(wunschlisteneintraege)
    .leftJoin(buecher, eq(wunschlisteneintraege.buchId, buecher.id))
    .leftJoin(buchinhalte, and(eq(buchinhalte.buchId, buecher.id), eq(buchinhalte.status, "im_vorrat")))
    .where(
      and(
        eq(wunschlisteneintraege.kontoId, konto.id),
        or(isNull(buecher.id), isNull(buchinhalte.id))
      )
    );

  // Reine Vorschau, kein Seiteneffekt — dieselbe Funktion, die auch der
  // Cron-Job nutzt, um zu entscheiden, was als Nächstes produziert wird.
  const naechsteKandidaten = await vorschlaege(konto.id, 3);
  const kategorien = await kategorieUebersicht(konto.id);

  const zeilen = liste.sort((a, b) => {
    if (a.bald !== b.bald) return a.bald ? -1 : 1;
    return (a.titel ?? a.rohTitel ?? "").localeCompare(b.titel ?? b.rohTitel ?? "");
  });

  // Umfang für ALLE angezeigten Einträge nachschlagen (nicht nur die
  // gerade vorgeschlagenen) — sonst bleibt die Angabe bei den meisten
  // Büchern auf der Liste leer, weil vorschlaege() nur die knappen
  // Kategorien bedient. sicherstelleUmfang() cached in buecher.umfang bzw.
  // buecher.umfangGeprueftAm (Negativ-Cache), kostet also nur beim ERSTEN
  // Aufruf pro Buch einen echten Netzwerk-Roundtrip.
  //
  // Bewusst NICHT mehr vor dem Rendern awaited (Bug 09/2026, "Wunschliste
  // lädt langsam"): das blockierte den Seitenaufbau auf so viele
  // sequentiell/parallel laufende Open-Library-Anfragen wie fehlende
  // Einträge — bei vielen (v.a. nicht katalogisierten) Büchern spürbar.
  // Stattdessen rendert die Seite sofort mit dem aktuell gecachten Stand;
  // die Nachschlage-Arbeit läuft NACH dem Response im Hintergrund weiter
  // (Next.js after()) und füllt buecher.umfang für den nächsten Aufruf.
  after(async () => {
    await Promise.all(
      zeilen.map(async (zeile) => {
        if (!zeile.buchId || zeile.umfang || !zeile.titel || !zeile.autor) return;
        await sicherstelleUmfang(zeile.buchId, zeile.titel, zeile.autor, zeile.umfang, zeile.umfangGeprueftAm);
      })
    );
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
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 20 }}>Wunschliste</span>
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
        {zeilen.length} noch nicht vorbereitet
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

      <details className="buecherliste-abschnitt">
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
          Kategorie-Rotation
        </summary>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
          {kategorien.map((k) => (
            <div
              key={k.kategorie}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid rgba(36,35,31,.08)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[k.kategorie] ?? "#ccc", flexShrink: 0 }} />
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 13 }}>
                    {KATEGORIE_LABEL[k.kategorie] ?? k.kategorie}
                  </span>
                </div>
                <span style={{ fontSize: 11.5, color: "rgba(36,35,31,.5)", flexShrink: 0 }}>
                  {k.bestand}/{k.mindestbestand}
                </span>
              </div>
              <span style={{ fontSize: 12, color: k.bestand < k.mindestbestand ? "rgba(36,35,31,.75)" : "rgba(36,35,31,.45)" }}>
                {k.bestand < k.mindestbestand
                  ? k.naechsterKandidat
                    ? `Als Nächstes: ${k.naechsterKandidat.titel} (${k.naechsterKandidat.autor})`
                    : "Unter Mindestbestand, aber kein Kandidat auf der Wunschliste"
                  : k.naechsterKandidat
                    ? `Im Soll · danach: ${k.naechsterKandidat.titel}`
                    : "Im Soll"}
              </span>
            </div>
          ))}
        </div>
      </details>

      {zeilen.length === 0 ? (
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
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>Alles vorbereitet</span>
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Jedes Buch auf deiner Liste ist schon produziert — schau in der Bibliothek vorbei, oder füge Neues hinzu.
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          {zeilen.map((zeile) => (
            <div
              key={zeile.id}
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
                {zeile.umfang && (
                  <span style={{ fontSize: 11.5, color: "rgba(36,35,31,.5)" }}>{zeile.umfang}</span>
                )}
                {zeile.buchId && (
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
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
