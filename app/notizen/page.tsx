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

import Link from "next/link";
import { db } from "../../src/db";
import { buchinhalte, buecher, konten, notizen } from "../../src/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { KATEGORIE_FARBE, KATEGORIE_LABEL } from "../../src/lib/kategorien";
import MenuButton from "../MenuButton";
import SchliessenButton from "../SchliessenButton";
import { FELD_LABEL, type NotizFeld } from "../../src/lib/notizen";
import EntfernenButton from "./EntfernenButton";

export const dynamic = "force-dynamic";

// Kurzhelfer für die Kategorie-Chips — identisch zu app/buecherliste/page.tsx.
function hexZuRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default async function NotizenSeite({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string }>;
}) {
  const { kategorie: kategorieFilter } = await searchParams;
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

  const gruppen = !kategorieFilter ? alleGruppen : alleGruppen.filter((g) => g.kategorie === kategorieFilter);

  const kategorieChipStyle = (aktiv: boolean, farbe?: string) => ({
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: 600,
    fontSize: 14.5,
    background: farbe ? hexZuRgba(farbe, aktiv ? 0.9 : 0.16) : aktiv ? "#24231F" : "rgba(36,35,31,.08)",
    color: farbe ? "rgba(36,35,31,.85)" : aktiv ? "#FBFAF7" : "rgba(36,35,31,.75)",
  });

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
      </div>
      <MenuButton />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
        {alleGruppen.length === 0 ? (
          <span style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(36,35,31,.65)" }}>
            Noch keine Hervorhebungen — im Lesen-Screen Text markieren, um ihn hier zu sammeln.
          </span>
        ) : (
          <>
            {kategorienVorhanden.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link href="/notizen">
                  <span style={kategorieChipStyle(!kategorieFilter)}>Alle</span>
                </Link>
                {kategorienVorhanden.map((k) => (
                  <Link key={k} href={`/notizen?kategorie=${encodeURIComponent(k)}`}>
                    <span style={kategorieChipStyle(kategorieFilter === k, KATEGORIE_FARBE[k])}>
                      <span>{KATEGORIE_LABEL[k] ?? k}</span>
                      <span style={{ opacity: 0.6, fontWeight: 700 }}>{eintraegeProKategorie.get(k) ?? 0}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

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
                <span style={{ fontSize: 16, color: "rgba(36,35,31,.65)" }}>Keine Notizen in dieser Kategorie.</span>
                <Link href="/notizen">
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#24231F" }}>Alle anzeigen</span>
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gruppen.map((gruppe) => (
                  <details key={gruppe.buchinhaltId} className="notizen-buch">
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
                        {gruppe.titel}
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
                          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>„{eintrag.textAuszug}“</p>
                          {eintrag.text && (
                            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, color: "rgba(36,35,31,.7)" }}>
                              {eintrag.text}
                            </p>
                          )}
                          <EntfernenButton id={eintrag.id} />
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
