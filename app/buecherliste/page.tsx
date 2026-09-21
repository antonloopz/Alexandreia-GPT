// app/buecherliste/page.tsx
//
// Wunschliste — jetzt eigenständig für NUR NOCH NICHT produzierte Bücher.
// Die bereits fertigen Bücher ("Jetzt lesen") sind in die neue Bibliothek
// (app/bookshelf/page.tsx) umgezogen, damit diese Liste nicht mehr mit
// Einträgen vollläuft, die man hier eigentlich gar nicht mehr braucht.
// Jeder Eintrag hat zwei Aktionen: sofort ad-hoc aufbereiten
// (AufbereitenButton) oder für den nächsten automatischen Cron-Lauf
// vormerken (PrioritaetToggle) — siehe actions.ts. Unter der Liste eine
// aufklappbare "Kategorie-Rotation"-Übersicht: pro Kategorie bereit
// (Bestand/Mindestbestand), vorgemerkt und auf der Liste, plus das jeweils
// nächste vorgesehene Buch — der einzige Ort mit Zahlen pro Kategorie.
// "+"-Button bewusst oben im Header statt unten als grosser Kreisbutton
// (wie sonst üblich) — bei wachsender Listenlänge müsste man sonst erst
// runterscrollen, um ein Buch hinzuzufügen.

import { Fragment } from "react";
import Link from "next/link";
import { after } from "next/server";
import { db } from "../../src/db";
import { buchinhalte, buecher, konten, wunschlisteneintraege } from "../../src/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL, kategorieChipStyle } from "../../src/lib/kategorien";
import { kategorieUebersicht, vorschlaege } from "../../src/lib/vorschlag";
import { sicherstelleUmfang } from "../../src/lib/umfang";
import { sicherstelleBuchinfos } from "../../src/lib/buchinfos";
import { mitBegrenzterParallelitaet } from "../../src/lib/parallelitaet";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import PrioritaetToggle from "./PrioritaetToggle";
import AufbereitenButton from "./AufbereitenButton";
import LoeschenButton from "./LoeschenButton";
import WunschlisteSuche from "./WunschlisteSuche";

export const dynamic = "force-dynamic";

type WunschlisteZeile = {
  id: string;
  rohTitel: string | null;
  rohAutor: string | null;
  bald: boolean;
  buchId: string | null;
  titel: string | null;
  autor: string | null;
  kategorie: string | null;
  umfang: string | null;
  // Automatisch ergänzte Buchinfos (09/2026, Pendenz "Automatische
  // Ergänzung von Infos in der Wunschliste") — siehe lib/buchinfos.ts.
  verlag: string | null;
  erscheinungsjahr: number | null;
  coverUrl: string | null;
  buchinfosGeprueftAm: Date | null;
  herkunft: string;
};

// Beschriftung für Wunschlisten-Einträge, die NICHT vom Nutzer selbst
// stammen (09/2026, Pendenz "Wunschliste: Markierung ob Vorschlag von
// Claude oder Eintrag vom Nutzer") — "eigene_liste" bekommt bewusst KEIN
// Badge (das ist der Normalfall, den man nicht extra hervorheben muss).
const HERKUNFT_BADGE: Record<string, string> = {
  klassiker: "Klassiker-Vorschlag",
  geheimtipp: "Geheimtipp-Vorschlag",
  synergie: "Synergie-Vorschlag",
};

// Eine Wunschlisten-Zeile — von beiden Abschnitten (vorgemerkt/übrige)
// genutzt, damit die Karten-Gestaltung an einer Stelle bleibt statt
// zweimal dupliziert zu werden.
function WunschlisteKarte({ zeile }: { zeile: WunschlisteZeile }) {
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
      {/* Coverbild (09/2026, Pendenz "prüfen ob Coverbilder möglich sind")
          — nur wenn Open Library eins geliefert hat (lib/buchinfos.ts);
          sonst nimmt die Karte einfach keinen Platz dafür ein, kein
          Platzhalter-Icon, um die kompakte Liste nicht zu verlängern. */}
      {zeile.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={zeile.coverUrl}
          alt=""
          style={{ width: 44, height: 64, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "rgba(36,35,31,.08)" }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        {zeile.kategorie ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[zeile.kategorie] ?? "#ccc", flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontWeight: 600,
                fontSize: 13,
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
              fontSize: 13,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.55)",
            }}
          >
            Noch nicht zugeordnet
          </span>
        )}
        {HERKUNFT_BADGE[zeile.herkunft] && (
          <span
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 600,
              fontSize: 12,
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(36,35,31,.08)",
              color: "rgba(36,35,31,.6)",
              marginTop: 2,
            }}
          >
            {HERKUNFT_BADGE[zeile.herkunft]}
          </span>
        )}
        <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17 }}>
          {zeile.titel ?? zeile.rohTitel}
        </span>
        {(zeile.autor ?? zeile.rohAutor) && (
          <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.65)" }}>{zeile.autor ?? zeile.rohAutor}</span>
        )}
        {zeile.umfang && <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>{zeile.umfang}</span>}
        {(zeile.verlag || zeile.erscheinungsjahr) && (
          <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)" }}>
            {[zeile.verlag, zeile.erscheinungsjahr].filter(Boolean).join(" · ")}
          </span>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {zeile.buchId && (
            <>
              <PrioritaetToggle eintragId={zeile.id} aktiv={zeile.bald} />
              <AufbereitenButton buchId={zeile.buchId} />
              <Link href={`/buecherliste/${zeile.id}/bearbeiten`}>
                <span
                  style={{
                    display: "inline-flex",
                    fontFamily: "Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: 13.5,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(36,35,31,.25)",
                    background: "transparent",
                    color: "#24231F",
                    cursor: "pointer",
                  }}
                >
                  Bearbeiten
                </span>
              </Link>
            </>
          )}
          <LoeschenButton eintragId={zeile.id} titel={zeile.titel ?? zeile.rohTitel ?? ""} />
        </div>
      </div>
    </div>
  );
}

export default async function BuecherlisteSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; kategorie?: string; suche?: string }>;
}) {
  const { fehler, kategorie: kategorieFilter, suche } = await searchParams;
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
      verlag: buecher.verlag,
      erscheinungsjahr: buecher.erscheinungsjahr,
      coverUrl: buecher.coverUrl,
      buchinfosGeprueftAm: buecher.buchinfosGeprueftAm,
      herkunft: wunschlisteneintraege.herkunft,
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

  // Spalten "Vorgemerkt"/"Auf der Liste" der Kategorie-Rotation: aus
  // denselben, UNGEFILTERTEN `zeilen` gruppiert, die auch Kopfzeile und
  // Abschnitte speisen, mit derselben Definition (vorgemerkt = bald) —
  // ohne aktiven Filter ergeben die Spaltensummen (inkl. Zeile "Nicht
  // zugeordnet") also per Konstruktion genau die Zahlen der Kopfzeile.
  // Bewusst ungefiltert: die Rotation ist eine Übersicht aller Kategorien,
  // unabhängig von Chip-Filter oder Suche. Schlüssel "ohne" = keine Kategorie.
  const aufListeProKategorie = new Map<string, { vorgemerkt: number; gesamt: number }>();
  for (const z of zeilen) {
    const schluessel = z.kategorie ?? "ohne";
    const eintrag = aufListeProKategorie.get(schluessel) ?? { vorgemerkt: 0, gesamt: 0 };
    eintrag.gesamt += 1;
    if (z.bald) eintrag.vorgemerkt += 1;
    aufListeProKategorie.set(schluessel, eintrag);
  }
  const ohneKategorieAufListe = aufListeProKategorie.get("ohne");

  // Kategorie-Filter (09/2026, Pendenz "Wunschliste nach Kategorien
  // filtern") — rein über den ?kategorie=-Query-Parameter, damit der
  // Server Component bleibt (kein eigener Client-State nötig). "ohne"
  // steht für Einträge ohne zugeordnete Kategorie (rohTitel/rohAutor, noch
  // kein Datenbank-Abgleich). Nur Kategorien anzeigen, die auf der Liste
  // TATSÄCHLICH vorkommen — sonst stünden bei einer kleinen Wunschliste
  // meist leere Filter-Chips da. Seit 09/2026 auch keine Chips mehr für
  // Kategorien, deren Wunschlisten-Bücher alle schon aufbereitet sind: die
  // führten nur zu "Keine Einträge in dieser Kategorie".
  const kategorienVorhanden = Object.keys(KATEGORIE_LABEL).filter((k) =>
    zeilen.some((z) => z.kategorie === k)
  );
  const ohneKategorieVorhanden = zeilen.some((z) => z.kategorie === null);

  const nachKategorieGefiltert = !kategorieFilter
    ? zeilen
    : kategorieFilter === "ohne"
      ? zeilen.filter((z) => z.kategorie === null)
      : zeilen.filter((z) => z.kategorie === kategorieFilter);

  // Suchfunktion (09/2026, Pendenz "Doublettenerkennung + automatische
  // Ergänzung von Buchdetails" — ergänzend dazu) — reiner Teilstring-
  // Abgleich auf Titel/Autor, case-insensitiv, wirkt zusätzlich zum
  // Kategorie-Filter (beide zusammen, nicht alternativ).
  const sucheNormalisiert = (suche ?? "").trim().toLowerCase();
  const gefilterteZeilen = !sucheNormalisiert
    ? nachKategorieGefiltert
    : nachKategorieGefiltert.filter((z) => {
        const titel = (z.titel ?? z.rohTitel ?? "").toLowerCase();
        const autor = (z.autor ?? z.rohAutor ?? "").toLowerCase();
        return titel.includes(sucheNormalisiert) || autor.includes(sucheNormalisiert);
      });
  const filterAktiv = Boolean(kategorieFilter) || Boolean(sucheNormalisiert);

  // Klare Abgrenzung vorgemerkt/nicht vorgemerkt statt nur stiller Sortierung
  // + kleinem Flaggen-Icon (09/2026, Pendenz "Wunschliste: abgrenzen
  // zwischen vorgemerkt und noch nicht vorgemerkt") — zwei eigene
  // Abschnitte, analog "Bereit"/"Gelesen" in der Bibliothek, BEIDE als
  // eigenes <details>-Akkordeon (09/2026, Nachschärfung "Akkordeon auch
  // für nicht vorgemerkte Bücher" — vorher war nur "Vorgemerkt"
  // einklappbar). gefilterteZeilen ist schon nach bald sortiert, die
  // Aufteilung erhält also die alphabetische Reihenfolge innerhalb jeder
  // Gruppe. Beide Abschnitte leiten sich von gefilterteZeilen ab, sind
  // also schon vom Kategorie-Filter oben betroffen — ein Klick auf einen
  // Kategoriebutton zeigt weiterhin ALLE (noch nicht aufbereiteten) Bücher
  // dieser Kategorie, aufgeteilt auf beide Akkordeons, nicht nur die
  // "noch nicht vorgemerkten".
  const vorgemerkteZeilen = gefilterteZeilen.filter((z) => z.bald);
  const uebrigeZeilen = gefilterteZeilen.filter((z) => !z.bald);

  // Eine lesbare Kopfzeile statt der früheren Versal-Zeile mit der
  // Gesamtzahl (09/2026, Umbau "Wunschliste lesbarer machen") — gleiche
  // Zählbasis wie die beiden Abschnitte unten, also bei aktivem Filter/Suche
  // "x von y", wie vorher.
  const buchWort = (n: number, dativ = false) => (n === 1 ? "Buch" : dativ ? "Büchern" : "Bücher");
  const listenAnzahl = filterAktiv
    ? `${gefilterteZeilen.length} von ${zeilen.length} ${buchWort(zeilen.length, true)}`
    : `${zeilen.length} ${buchWort(zeilen.length)}`;
  const kopfzeile = `${listenAnzahl} auf der Liste · ${vorgemerkteZeilen.length} für den nächsten Lauf vorgemerkt`;

  // Gemeinsame Stile der Kategorie-Rotation (Spaltenköpfe + Zahlen).
  const spaltenkopfStyle = {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: ".04em",
    textTransform: "uppercase" as const,
    color: "rgba(36,35,31,.5)",
    textAlign: "right" as const,
    alignSelf: "end" as const,
    paddingBottom: 6,
    borderBottom: "1px solid rgba(36,35,31,.08)",
  };
  const zahlStyle = {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: 14.5,
    fontVariantNumeric: "tabular-nums" as const,
    color: "rgba(36,35,31,.75)",
    textAlign: "right" as const,
    alignSelf: "center" as const,
    paddingTop: 8,
  };

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
    // Concurrency-Limit (09/2026, Pendenz "Concurrency-Limit für Open-
    // Library-Anfragen"): vorher ungedrosseltes Promise.all über ALLE
    // Zeilen gleichzeitig — bei vielen Büchern auf einmal reichte das für
    // Rate-Limiting bei Open Library (siehe Bug-Fix-Kommentar in
    // lib/buchinfos.ts). mitBegrenzterParallelitaet lässt höchstens 3
    // Zeilen gleichzeitig laufen (jede davon stösst intern bis zu zwei
    // Anfragen parallel an, s.u.).
    await mitBegrenzterParallelitaet(zeilen, 3, async (zeile) => {
      if (!zeile.buchId || !zeile.titel || !zeile.autor) return;
      // Umfang UND die übrigen Buchinfos parallel anstossen, nicht mehr
      // hinter demselben Skip-Check — beide haben ihren EIGENEN
      // Negativ-Cache-Zeitstempel (umfangGeprueftAm/buchinfosGeprueftAm),
      // sicherstelleUmfang()/sicherstelleBuchinfos() prüfen intern schon
      // selbst, ob überhaupt nachgeschlagen werden muss. Ohne diese
      // Entkopplung hätte kein Alt-Bestand (umfang längst gesetzt) je die
      // neuen Buchinfos bekommen, weil der alte Skip-Check (`zeile.umfang`)
      // schon vorher abgebrochen hätte.
      await Promise.all([
        sicherstelleUmfang(zeile.buchId, zeile.titel, zeile.autor, zeile.umfang, zeile.umfangGeprueftAm),
        sicherstelleBuchinfos(zeile.buchId, zeile.titel, zeile.autor, zeile.buchinfosGeprueftAm),
      ]);
    });
  });

  // Kategorie-Chips farbig (09/2026, Pendenz "Wunschliste:
  // Kategoriebuttons farbig + Bestand anzeigen") statt einheitlich
  // dunkel/hell — aktiv: volle Kategoriefarbe als Hintergrund, inaktiv: nur
  // ein schwacher Farbton davon, damit die Kategorie auch unausgewählt auf
  // einen Blick erkennbar bleibt. "Alle"/"Nicht zugeordnet" (kein `farbe`)
  // behalten die alte neutrale Optik. (kategorieChipStyle/hexZuRgba jetzt
  // aus src/lib/kategorien.ts importiert statt hier definiert.)

  return (
    <main
      style={{
        width: "100%",
        height: "calc(100dvh - env(safe-area-inset-top, 0px))",
        boxSizing: "border-box",
        padding: 16,
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <style>{`
        .buecherliste-abschnitt summary { list-style: none; }
        .buecherliste-abschnitt summary::-webkit-details-marker { display: none; }
        .buecherliste-abschnitt summary svg { transition: transform .15s ease; }
        .buecherliste-abschnitt[open] > summary svg { transform: rotate(90deg); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Wunschliste</span>
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
        </div>
      </div>
      <MenuButton />

      {/* Oberster Bereich (Header) bleibt beim Scrollen fixiert, analog den
          Buttons auf den Lese-Seiten (09/2026, Pendenz "Dropdown-Seiten:
          oberster Bereich nicht scrollbar") — nur dieser Wrapper scrollt. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

      {/* fehler=verworfen/technisch: aktuell nicht mehr erreichbar, seit
          buchJetztAufbereiten() im Hintergrund läuft (after(), kein Redirect
          mit Fehlerstatus mehr möglich, siehe actions.ts) — Banner bewusst
          nicht entfernt, falls künftig wieder ein synchroner Fehlerweg
          gebraucht wird (z.B. bei Polling-basiertem Live-Status). */}
      {fehler && (
        <div
          style={{
            boxSizing: "border-box",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(36,35,31,.08)",
            fontSize: 15,
            lineHeight: 1.4,
          }}
        >
          {fehler === "verworfen"
            ? "Aufbereitung fehlgeschlagen: die Prüfung hat den Entwurf nicht bestanden. Einfach nochmal versuchen."
            : "Aufbereitung fehlgeschlagen (technischer Fehler, z.B. unbrauchbare Modellantwort). Einfach nochmal versuchen."}
        </div>
      )}

      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: 15, lineHeight: 1.4, color: "rgba(36,35,31,.65)" }}>
        {kopfzeile}
      </span>

      {zeilen.length > 0 && <WunschlisteSuche initial={suche ?? ""} />}

      {kategorienVorhanden.length + (ohneKategorieVorhanden ? 1 : 0) > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/buecherliste">
            <span style={kategorieChipStyle(!kategorieFilter)}>Alle</span>
          </Link>
          {kategorienVorhanden.map((k) => (
            <Link key={k} href={`/buecherliste?kategorie=${encodeURIComponent(k)}`}>
              <span style={kategorieChipStyle(kategorieFilter === k, KATEGORIE_FARBE[k])}>
                {KATEGORIE_LABEL[k] ?? k}
              </span>
            </Link>
          ))}
          {ohneKategorieVorhanden && (
            <Link href="/buecherliste?kategorie=ohne">
              <span style={kategorieChipStyle(kategorieFilter === "ohne")}>Nicht zugeordnet</span>
            </Link>
          )}
        </div>
      )}

      {naechsteKandidaten.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "rgba(36,35,31,.5)",
            }}
          >
            Als Nächstes automatisch dran
          </span>
          <span style={{ fontSize: 14.5, color: "rgba(36,35,31,.7)", lineHeight: 1.5 }}>
            {naechsteKandidaten.map((k) => k.titel).join(" · ")}
          </span>
        </div>
      )}

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
            <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 19 }}>Alles aufbereitet</span>
            <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
              Jedes Buch auf deiner Liste ist schon produziert — schau in der Bibliothek vorbei, oder füge Neues hinzu.
            </span>
          </div>
        </div>
      ) : gefilterteZeilen.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 16, color: "rgba(36,35,31,.65)" }}>
            {sucheNormalisiert ? `Keine Treffer für „${suche}“.` : "Keine Einträge in dieser Kategorie."}
          </span>
          <Link href="/buecherliste">
            <span style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>Alle anzeigen</span>
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {vorgemerkteZeilen.length > 0 && (
            <details className="buecherliste-abschnitt" open>
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                  padding: "4px 0",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5.5 15.5 12 9 18.5" />
                </svg>
                Vorgemerkt für nächsten Lauf ({vorgemerkteZeilen.length})
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {vorgemerkteZeilen.map((zeile) => (
                  <WunschlisteKarte key={zeile.id} zeile={zeile} />
                ))}
              </div>
            </details>
          )}

          {uebrigeZeilen.length > 0 && (
            <details className="buecherliste-abschnitt">
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "rgba(36,35,31,.5)",
                  padding: "4px 0",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5.5 15.5 12 9 18.5" />
                </svg>
                Noch nicht vorgemerkt ({uebrigeZeilen.length})
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {uebrigeZeilen.map((zeile) => (
                  <WunschlisteKarte key={zeile.id} zeile={zeile} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Kategorie-Rotation (09/2026, Umbau "Wunschliste lesbarer machen"):
          jetzt UNTER der Liste und der einzige Ort mit Zahlen pro Kategorie
          (vorher zusätzlich als x/y/z direkt in den Filter-Chips). Ein
          gemeinsames CSS-Grid statt einem Flex-Container pro Zeile, damit
          die drei Zahlenspalten über alle Kategorien bündig untereinander
          stehen. "Bereit" bleibt pro Zeile als bestand/mindestbestand, weil
          der Mindestbestand pro Kategorie einstellbar ist (siehe
          mindestbestandProKategorie() in lib/vorschlag.ts). "Vorgemerkt" und
          "Auf der Liste" (= vorgemerkt + nicht vorgemerkt) aus
          aufListeProKategorie, also aus denselben ungefilterten `zeilen`
          wie Kopfzeile und Abschnitte. */}
      <details className="buecherliste-abschnitt">
        <summary
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 600,
            fontSize: 13,
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto auto", columnGap: 8, marginTop: 10 }}>
          <span style={{ borderBottom: "1px solid rgba(36,35,31,.08)" }} />
          <span style={spaltenkopfStyle}>Bereit</span>
          <span style={spaltenkopfStyle}>Vorgemerkt</span>
          <span style={spaltenkopfStyle}>
            Auf der
            <br />
            Liste
          </span>
          {kategorien.map((k) => {
            const aufListe = aufListeProKategorie.get(k.kategorie);
            const vorgemerkt = aufListe?.vorgemerkt ?? 0;
            const gesamt = aufListe?.gesamt ?? 0;
            return (
              <Fragment key={k.kategorie}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, paddingTop: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[k.kategorie] ?? "#ccc", flexShrink: 0 }} />
                  <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 15, hyphens: "auto", overflowWrap: "break-word", minWidth: 0 }}>
                    {KATEGORIE_LABEL[k.kategorie] ?? k.kategorie}
                  </span>
                </div>
                {/* Bestand 0 rot (09/2026, Wunsch Nutzer): eine Kategorie ganz ohne
                    fertig aufbereitetes Buch soll in der Rotation sofort auffallen. */}
                <span
                  style={{
                    ...zahlStyle,
                    color: k.bestand === 0 ? "#B3261E" : zahlStyle.color,
                    fontWeight: k.bestand === 0 ? 600 : undefined,
                  }}
                >
                  {k.bestand}/{k.mindestbestand}
                </span>
                <span style={zahlStyle}>{vorgemerkt}</span>
                <span style={zahlStyle}>{gesamt}</span>
                <span
                  style={{
                    gridColumn: "1 / -1",
                    paddingTop: 2,
                    paddingBottom: 8,
                    borderBottom: "1px solid rgba(36,35,31,.08)",
                    fontSize: 14,
                    color: k.bestand < k.mindestbestand ? "rgba(36,35,31,.75)" : "rgba(36,35,31,.45)",
                  }}
                >
                  {k.bestand < k.mindestbestand
                    ? k.naechsterKandidat
                      ? `Als Nächstes: ${k.naechsterKandidat.titel} (${k.naechsterKandidat.autor})`
                      : "Unter Mindestbestand, aber kein Kandidat auf der Wunschliste"
                    : k.naechsterKandidat
                      ? `Im Soll · danach: ${k.naechsterKandidat.titel}`
                      : "Im Soll"}
                </span>
              </Fragment>
            );
          })}
          {/* Einträge ohne Kategorie (reiner rohTitel, noch kein Abgleich)
              zählen in der Kopfzeile mit — daher auch hier eine eigene
              Zeile, sonst gingen die Spaltensummen nicht auf. Kein
              Bestand/Mindestbestand, weil es keine Rotations-Kategorie ist. */}
          {ohneKategorieAufListe && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, paddingTop: 8, paddingBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#ccc", flexShrink: 0 }} />
                <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600, fontSize: 15, minWidth: 0 }}>
                  Nicht zugeordnet
                </span>
              </div>
              <span style={{ ...zahlStyle, paddingBottom: 8 }}>–</span>
              <span style={{ ...zahlStyle, paddingBottom: 8 }}>{ohneKategorieAufListe.vorgemerkt}</span>
              <span style={{ ...zahlStyle, paddingBottom: 8 }}>{ohneKategorieAufListe.gesamt}</span>
            </>
          )}
        </div>
      </details>
      </div>
    </main>
  );
}
