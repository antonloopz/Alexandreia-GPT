// app/notizen/page.tsx
//
// Notizen-Übersicht: alle Hervorhebungen aus dem Lesen-Screen, gruppiert
// nach Buch, neueste Gruppe zuerst. Sechster Hauptscreen — wie die anderen
// fünf über das Dropdown-Menü erreichbar (MenuButton), eigener
// SchliessenButton. Feature "Notiz-/Highlight-Funktion" 09/2026.
//
// Zwei Ergänzungen 09/2026 (Pendenz "Notizenseite: Kategorienfilter +
// Dropdown pro Buch"): Kategorienfilter über den ?kategorie=-Query-
// Parameter (analog app/buecherliste/page.tsx, damit die Seite eine reine
// Server Component bleiben kann), und jede Buchgruppe jetzt als
// aufklappbares <details> (Accordion) statt einer immer offenen Liste —
// standardmässig ZUGEKLAPPT, damit die Übersicht bei vielen markierten
// Stellen über mehrere Bücher nicht sofort unübersichtlich wird.
//
// Suchfunktion 09/2026 (Pendenz "Suchfunktion in Notizen") — ?suche=-Query-
// Parameter (Eingabe über den Client Component NotizenSuche, debounced),
// durchsucht Buchtitel, markierten Auszug UND eigene Notiz. Trifft die
// Suche nur den Buchtitel, bleiben alle Einträge der Gruppe sichtbar;
// trifft sie einzelne Einträge, werden nur diese gezeigt. Gruppen mit
// Treffern öffnen sich beim Suchen automatisch (sonst müsste man jede
// einzeln aufklappen, um den Treffer zu sehen).

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, konten, notizen, repetitionselemente } from "../../src/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL, kategorieChipStyle } from "../../src/lib/kategorien";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import { FELD_LABEL, type NotizFeld } from "../../src/lib/notizen";
import EntfernenButton from "./EntfernenButton";
import WiederholungButton from "./WiederholungButton";
import NotizenSuche from "./NotizenSuche";

export const dynamic = "force-dynamic";

// Hebt die ERSTE Fundstelle des Suchbegriffs in text hervor (genau wie
// segmentiere() in app/lesen/[id]/Hervorhebbarer.tsx bei Mehrfachvorkommen
// bewusst nur die erste Stelle markiert — für eine Einzelnutzer-App
// ausreichend genau).
function mitSuchtreffer(text: string, suche: string) {
  if (!suche) return text;
  const index = text.toLowerCase().indexOf(suche.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark style={{ background: "rgba(36,35,31,.2)", borderRadius: 3, padding: "0 1px", color: "inherit" }}>
        {text.slice(index, index + suche.length)}
      </mark>
      {text.slice(index + suche.length)}
    </>
  );
}

export default async function NotizenSeite({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string; suche?: string }>;
}) {
  const { kategorie: kategorieFilter, suche: sucheRoh } = await searchParams;
  const suche = (sucheRoh ?? "").trim();
  const sucheLower = suche.toLowerCase();
  const [konto] = await db.select().from(konten).limit(1);

  if (!konto) {
    return (
      <main style={{ padding: 24, fontFamily: "Helvetica, Arial, sans-serif" }}>
        Kein Konto gefunden — <code>npx tsx src/db/seed.ts</code> ausführen.
      </main>
    );
  }

  const zeilen = await db
    .select({
      id: notizen.id,
      feld: notizen.feld,
      textAuszug: notizen.textAuszug,
      text: notizen.text,
      buchinhaltId: notizen.buchinhaltId,
      titel: buecher.titel,
      kategorie: buecher.kategorie,
    })
    .from(notizen)
    .innerJoin(buchinhalte, eq(notizen.buchinhaltId, buchinhalte.id))
    .innerJoin(buecher, eq(buchinhalte.buchId, buecher.id))
    .where(and(eq(notizen.kontoId, konto.id), isNotNull(notizen.textAuszug)))
    .orderBy(desc(notizen.erstelltAm));

  // Welche dieser Hervorhebungen bereits zur Wiederholung hinzugefügt sind
  // (Pendenz "Notizen/Hervorhebungen optional in die Wiederholung
  // aufnehmen", 09/2026) — als Set für den WiederholungButton pro Eintrag.
  const wiederholteZeilen = await db
    .select({ notizId: repetitionselemente.notizId })
    .from(repetitionselemente)
    .where(and(eq(repetitionselemente.kontoId, konto.id), isNotNull(repetitionselemente.notizId)));
  const wiederholtSet = new Set(wiederholteZeilen.map((w) => w.notizId));

  type Zeile = (typeof zeilen)[number];
  type Gruppe = { buchinhaltId: string; titel: string; kategorie: string | null; eintraege: Zeile[] };
  const alleGruppen: Gruppe[] = [];
  const index = new Map<string, number>();
  for (const zeile of zeilen) {
    if (!zeile.buchinhaltId) continue;
    const i = index.get(zeile.buchinhaltId);
    if (i === undefined) {
      index.set(zeile.buchinhaltId, alleGruppen.length);
      alleGruppen.push({ buchinhaltId: zeile.buchinhaltId, titel: zeile.titel, kategorie: zeile.kategorie, eintraege: [zeile] });
    } else {
      alleGruppen[i].eintraege.push(zeile);
    }
  }

  // Kategorie-Filter — nur Kategorien anzeigen, die unter den vorhandenen
  // Büchern TATSÄCHLICH vorkommen (sonst leere Chips bei wenigen Notizen).
  const kategorienVorhanden = Object.keys(KATEGORIE_LABEL).filter((k) =>
    alleGruppen.some((g) => g.kategorie === k)
  );
  const eintraegeProKategorie = new Map<string, number>();
  for (const g of alleGruppen) {
    if (!g.kategorie) continue;
    eintraegeProKategorie.set(g.kategorie, (eintraegeProKategorie.get(g.kategorie) ?? 0) + g.eintraege.length);
  }

  const gruppenKategorie = !kategorieFilter ? alleGruppen : alleGruppen.filter((g) => g.kategorie === kategorieFilter);

  // Suche: trifft sie den Buchtitel, bleiben alle Einträge der Gruppe
  // sichtbar (man sucht ja "das Buch") — sonst nur die Einträge, deren
  // Auszug, eigene Notiz oder Feld-Label ("Zusammenfassung"/"Kernzitat"/…)
  // den Begriff enthalten.
  const gruppen = !suche
    ? gruppenKategorie
    : gruppenKategorie
        .map((g) => {
          const titelTrifft = g.titel.toLowerCase().includes(sucheLower);
          const eintraege = titelTrifft
            ? g.eintraege
            : g.eintraege.filter(
                (e) =>
                  (e.textAuszug ?? "").toLowerCase().includes(sucheLower) ||
                  (e.text ?? "").toLowerCase().includes(sucheLower) ||
                  FELD_LABEL[e.feld as NotizFeld].toLowerCase().includes(sucheLower)
              );
          return { ...g, eintraege };
        })
        .filter((g) => g.eintraege.length > 0);

  // Kategorie-Chip-Links behalten eine laufende Suche bei (Filter sollen
  // sich kombinieren lassen, nicht sich gegenseitig zurücksetzen).
  const chipHref = (kategorie?: string) => {
    const params = new URLSearchParams();
    if (kategorie) params.set("kategorie", kategorie);
    if (suche) params.set("suche", suche);
    const query = params.toString();
    return query ? `/notizen?${query}` : "/notizen";
  };

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
        .notizen-buch summary { list-style: none; }
        .notizen-buch summary::-webkit-details-marker { display: none; }
        .notizen-buch summary svg { transition: transform .15s ease; }
        .notizen-buch[open] > summary svg { transform: rotate(90deg); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchliessenButton />
          <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 22 }}>Notizen</span>
        </div>
        <MenuButton inline />
      </div>

      {/* Suche und Kategorie-Filter fix über dem Scrollbereich (09/2026). */}
      {alleGruppen.length > 0 && <NotizenSuche initial={suche} />}
      {kategorienVorhanden.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", whiteSpace: "nowrap", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" }}>
          <Link href={chipHref()}>
            <span style={kategorieChipStyle(!kategorieFilter)}>Alle</span>
          </Link>
          {kategorienVorhanden.map((k) => (
            <Link key={k} href={chipHref(k)}>
              <span style={kategorieChipStyle(kategorieFilter === k, KATEGORIE_FARBE[k])}>
                <span>{KATEGORIE_LABEL[k] ?? k}</span>
                <span style={{ opacity: 0.6, fontWeight: 700 }}>{eintraegeProKategorie.get(k) ?? 0}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
        {alleGruppen.length === 0 ? (
          <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
            Noch keine Hervorhebungen — im Lesen-Screen Text markieren, um ihn hier zu sammeln.
          </span>
        ) : (
          <>
            {gruppen.length === 0 ? (
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
                  {suche ? <>Keine Treffer für „{suche}“.</> : "Keine Notizen in dieser Kategorie."}
                </span>
                <Link href="/notizen">
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>Alle anzeigen</span>
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gruppen.map((gruppe) => (
                  <details key={gruppe.buchinhaltId} className="notizen-buch" open={suche ? true : undefined}>
                    <summary
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        padding: "6px 0",
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#24231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M9 5.5 15.5 12 9 18.5" />
                      </svg>
                      {gruppe.kategorie && (
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: KATEGORIE_FARBE[gruppe.kategorie] ?? "#ccc", flexShrink: 0 }} />
                      )}
                      <span style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 17, flex: 1 }}>
                        {mitSuchtreffer(gruppe.titel, suche)}
                      </span>
                      <span style={{ fontSize: 13.5, color: "rgba(36,35,31,.5)", flexShrink: 0 }}>{gruppe.eintraege.length}</span>
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      <Link href={`/lesen/${gruppe.buchinhaltId}`}>
                        <span style={{ fontSize: 14.5, fontWeight: 600, color: "#24231F" }}>Im Buch öffnen →</span>
                      </Link>
                      {gruppe.eintraege.map((eintrag) => (
                        <div
                          key={eintrag.id}
                          style={{
                            boxSizing: "border-box",
                            padding: "12px 14px",
                            borderRadius: 14,
                            background: "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05)), var(--paper)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "Helvetica, Arial, sans-serif",
                              fontWeight: 600,
                              fontSize: 12,
                              letterSpacing: ".04em",
                              textTransform: "uppercase",
                              color: "rgba(36,35,31,.5)",
                            }}
                          >
                            {FELD_LABEL[eintrag.feld as NotizFeld]}
                          </span>
                          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
                            „{mitSuchtreffer(eintrag.textAuszug ?? "", suche)}“
                          </p>
                          {eintrag.text && (
                            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "rgba(36,35,31,.7)" }}>
                              {mitSuchtreffer(eintrag.text, suche)}
                            </p>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <WiederholungButton notizId={eintrag.id} aktiv={wiederholtSet.has(eintrag.id)} />
                            <EntfernenButton id={eintrag.id} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
