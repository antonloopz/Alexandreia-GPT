@AGENTS.md

# Arbeitskonventionen für Claude-Sessions in diesem Projekt

Diese Datei hält fest, was sich über mehrere Arbeits-Sessions an Alexandreia
etabliert hat, damit eine neue Session nicht bei null anfangen muss. Sie
ersetzt nicht das Konzeptdokument, sondern ergänzt es um praktische Regeln
für die Zusammenarbeit mit KI-Tools an diesem Code.

## Git-Sicherheit

- Niemals selbst `git config` ausführen — auch nicht, wenn ein Commit
  deswegen fehlschlägt (z.B. fehlende `user.name`/`user.email`). Stattdessen
  dem Nutzer die exakten Befehle für sein eigenes Terminal geben.
- Dateien immer einzeln beim Namen stagen (`git add <datei>`), nie `git add -A`
  oder `git add .`.
- Nie committen ohne explizite Bestätigung des Nutzers.
- Commit-Trailer (`Co-Authored-By:` / `Claude-Session:`) richten sich nach
  der jeweils aktuellen Session — nicht hartcodieren, sondern verwenden, was
  die aktuelle Session dafür vorgibt.

## Sandbox-Netzwerkgrenzen

Falls über eine Device-Bridge/Sandbox statt direkt auf dem Rechner des
Nutzers gearbeitet wird, gelten eigene Netzwerkgrenzen, unabhängig vom
echten Netzwerk des Nutzers oder von Vercels Produktionsnetzwerk:

- Die Neon-Datenbank ist nicht erreichbar (DNS-Restriktion). DB-Migrationen
  (`npx drizzle-kit push`) und alles, was echte DB-Schreibzugriffe braucht,
  muss der Nutzer selbst in seinem Terminal ausführen.
- Kein Push zu GitHub möglich (keine Zugangsdaten) — Push immer dem Nutzer
  überlassen.
- Externe APIs wie openlibrary.org sind oft nicht erreichbar (eigenes
  Egress-Allowlist) — Verifikation solcher Aufrufe ggf. dem Nutzer
  überlassen.
- Keine Dateien löschen ohne vorherige Berechtigung.

## Verifikations-Workflow nach Code-Änderungen

Immer, vor jedem Commit-Vorschlag:

1. `npx tsc --noEmit` — ein vorbestehender, unabhängiger Fehler
   (`Cannot find module 'jszip'` in `src/lib/obsidian.ts`) ist bekannt und
   zu ignorieren.
2. `npx eslint <geänderte Dateien>`.
3. Den vollständigen `git diff` der Änderungen tatsächlich lesen/prüfen,
   bevor Erfolg gemeldet wird — nie nur auf die Selbstauskunft einer
   Implementierung vertrauen.
4. Bei Anker-basierten Text-Edits: den exakten Ist-Zustand der Datei
   unmittelbar vor dem Edit per grep/sed verifizieren (nie auf zuvor im
   Gespräch wiedergegebenen Text verlassen, der beim Weiterreichen leicht
   umformatiert werden kann). Bei kurzen Dateien lieber komplett neu
   schreiben als riskante Anker-Edits versuchen.

## Codebase-Konventionen

- **Next.js App Router:** `app/` liegt im Projekt-Root (NICHT unter `src/`).
  Nur `db/`, `lib/` und `scripts/` liegen unter `src/`.
- **Minimaler Dependency-Ansatz:** kein HTTP-Client (natives `fetch`, siehe
  `src/lib/buchinfos.ts`), keine Concurrency-Bibliothek wie `p-limit`
  (stattdessen handgerollte Lösung in `src/lib/parallelitaet.ts`,
  `mitBegrenzterParallelitaet`).
- **`after()` aus `next/server`** für Hintergrundarbeit nach dem Response,
  damit Seiten-Rendering nicht auf externe API-Calls wartet (siehe
  `app/buecherliste/actions.ts`, `app/buecherliste/page.tsx`,
  `app/bookshelf/page.tsx`).
- **Negativ-Cache-Muster:** eine nullable Timestamp-Spalte (z.B.
  `buchinfosGeprueftAm` in `buecher`) markiert "schon versucht". Sie darf
  NUR bei einem tatsächlich abgeschlossenen Versuch gesetzt werden (Treffer
  oder bestätigt kein Treffer), NIE bei einem transienten Fetch-/
  Netzwerkfehler — sonst können Daten dauerhaft leer bleiben (siehe
  Bug-Fix-Kommentar in `src/lib/buchinfos.ts` und Reparaturskript
  `src/db/reset-buchinfos-cache-2026-09-19.ts`).
- **Atomare Inserts statt racy SELECT-dann-INSERT:**
  `db.insert(...).values(...).onConflictDoNothing({ target: [...] })`,
  abgesichert durch einen `unique(...)`-Constraint im Schema (Drizzle:
  3-Parameter-`pgTable`-Form mit Constraint-Callback als drittem Argument).
  Beispiel: `gezeigteBuecher` in `src/db/schema.ts` + `sicherstelleGezeigt()`
  in `src/lib/tagesbuch.ts`.
- **Einmalige Reparatur-/Diagnose-Skripte** liegen unter `src/db/`, benannt
  mit Datumssuffix (z.B. `reset-buchinfos-cache-2026-09-19.ts`,
  `dedupe-gezeigte-buecher-2026-09-20.ts`,
  `check-stuck-buchinhalte-2026-09-20.ts`). Sie laufen nur via
  `npx tsx <pfad>` im echten Terminal des Nutzers (nicht aus einer Sandbox
  ohne DB-Zugriff) und folgen einem festen Boilerplate-Muster: `dotenv`/
  `.env.local` laden, dynamischer Import von `./index` und `./schema`,
  `main().then(() => process.exit(0)).catch(...)`.
  (Wiederkehrende, nicht-einmalige Skripte liegen dagegen unter
  `src/scripts/`, z.B. `kernaussagen-regenerieren.ts`.)

## Inhaltliches Grundprinzip (Aufbereitung von Büchern)

Ziel ist eine dauerhafte persönliche Wissensbibliothek, nicht eine möglichst
elegante Buchzusammenfassung (Entscheid 21.09.2026). Jeder Buchinhalt
besteht aus drei Informationsschichten:

1. **Original** — was steht im Buch? (Zusammenfassung "Worum geht es?" +
   ausführlicher Teil, Kernaussagen mit Beispiel; stets dem Autor
   zugeschrieben)
2. **Synthese** — die wichtigsten Gedanken, Modelle und Argumente
   (Argumentation/Ebene 2, Einordnung: Argument/Beleg/Annahme/Schwachstelle,
   "Das bleibt hängen"; später Konzepte + Querverbindungen über Tags)
3. **Wissensstatus** — was davon gilt heute noch? (Einordnung "heute" pro
   Buch + Wissensstatus pro Kernaussage, jeweils nur mit Quelle)

**Grundsatz:** Die KI darf Informationen komprimieren, aber nie deren
epistemischen Status verändern — Vorbehalte ("könnte", "deutet darauf hin")
bleiben erhalten, eine Einzelstudie oder Vermutung wird nicht zur
gesicherten Tatsache, Autorenmeinung bleibt als solche zugeschrieben, keine
Zahlen/Studien/Zitate ohne Beleg. Das gilt auch für Alexandreia selbst: die
Pipeline hat den Buchtext NICHT (Modellwissen + Websuche), die Schicht
"Original" ist also eine Rekonstruktion — das bleibt über die
Vertrauenshinweise sichtbar. Deshalb bewusst **keine Kapitelstruktur**
(nicht verlässlich belegbar; erfundene Kapitelangaben wären schlimmer als
keine).

## Produkt-Kontext (wichtig für Feature-Vorschläge/Reviews)

- Persönliches Ein-Nutzer-Hobbyprojekt (kein Multi-Tenant-SaaS) — bewusst
  kein Login-Screen in der Haupt-Produktionsumgebung (siehe
  `middleware.ts`: das dort implementierte Zugangsgate greift NUR im
  separaten Test-Deployment mit `NEXT_PUBLIC_KI_DEAKTIVIERT="true"`),
  bewusst minimale PWA ohne Offline-Support (`app/manifest.ts` macht die
  App installierbar, sonst nichts Zusätzliches). Mehrnutzer-Fähigkeit ist
  im Datenmodell angelegt (kontobezogene Entitäten über `kontoId` in
  `src/db/schema.ts`), aber aktuell nur 1 Konto genutzt.
- **Typografie:** einheitlich Helvetica überall (09/2026 entschieden, siehe
  Commit "Einheitlich Helvetica als Schriftart verwenden"), keine anderen
  Schriftarten.
- Bei extern generierten Produkt-/Code-Reviews kritisch prüfen, ob
  Vorschläge zur tatsächlichen Ein-Nutzer-Hobbyprojekt-Skala passen, bevor
  sie übernommen werden (typische Fehlannahme: generische Multi-Tenant-
  SaaS-Wachstumsfeatures wie Community/Push/Accounts).

## Arbeitsablauf mit dem Nutzer

- ClickUp-Liste "Alexandreia – Pendenzen" (list_id `901526434710`) ist die
  persistente Punchlist — dort Aufgaben anlegen/aktualisieren/als erledigt
  markieren, wenn der Nutzer das anfragt oder wenn eine Aufgabe nachweislich
  fertig und deployed ist.
- Vor gross angelegten Änderungen: kurze Einschätzung geben und gemeinsam
  entscheiden, nicht sofort lospreschen.
- Nach jedem Feature/Fix: erst Diff-Review, dann explizit fragen, ob
  committet werden soll.
