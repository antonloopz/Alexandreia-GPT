// app/buecherliste/neu/actions.ts
//
// Server Action fürs Hinzufügen eines Wunschbuchs. Die Kategorie im
// Formular ist optional ("Automatisch erkennen") — wird sie weggelassen,
// übernimmt kategorieErkennen() (Claude-Klassifikation ohne Websuche,
// siehe src/lib/kategorieerkennung.ts) diese Aufgabe, nur wenn wirklich
// ein neues `buecher`-Buch angelegt werden muss (ein bereits bekanntes
// Buch hat schon eine Kategorie). Schlägt auch das fehl, geht's zurück
// zum Formular mit einem Fehlerhinweis und den bisherigen Eingaben
// vorausgefüllt — dann kann der Nutzer die Kategorie manuell wählen.
//
// Zwei Ergänzungen 09/2026 (Pendenz "Doublettenerkennung + automatische
// Ergänzung von Buchdetails"):
// - Autor/Originalsprache werden, wenn leer gelassen, per Open Library
//   nachgeschlagen (buchdetails.ts) — bevor überhaupt gegen bestehende
//   Bücher abgeglichen wird, damit die Doublettenerkennung gleich mit dem
//   vollständigen Autor arbeiten kann.
// - Vor dem eigentlichen Anlegen prüft doublettenFinden() (Levenshtein-
//   Ähnlichkeit, kein reiner exakter Abgleich mehr) den gesamten
//   Buchbestand. Bei einem relevanten Treffer geht's — wie beim Kategorie-
//   Fehlschlag — zurück zum Formular mit Hinweis; ein erneutes Abschicken
//   (jetzt mit `ueberschreiben=on`, siehe page.tsx) fügt trotzdem hinzu.
// Titel+Autor werden weiterhin zusätzlich exakt gegen bestehende `buecher`
// abgeglichen (case-insensitiv), um beim tatsächlichen Anlegen Duplikate
// zu vermeiden (Wiederverwendung des bestehenden Buchs statt eines neuen).

"use server";

import { redirect } from "next/navigation";
import { and, ilike } from "drizzle-orm";
import { db } from "../../../src/db";
import { buecher, kategorieEnum, konten, wunschlisteneintraege } from "../../../src/db/schema";
import { kategorieErkennen } from "../../../src/lib/kategorieerkennung";
import { buchdetailsErgaenzen } from "../../../src/lib/buchdetails";
import { doublettenFinden } from "../../../src/lib/doubletten";
import { kiDeaktiviert } from "../../../src/lib/testmodus";

export async function buchHinzufuegen(formData: FormData) {
  const titel = String(formData.get("titel") ?? "").trim();
  let autor = String(formData.get("autor") ?? "").trim();
  let originalsprache = String(formData.get("originalsprache") ?? "").trim();
  const kategorieEingabe = String(formData.get("kategorie") ?? "").trim() as
    | (typeof kategorieEnum.enumValues)[number]
    | "";
  const notiz = String(formData.get("notiz") ?? "").trim();
  const bald = formData.get("bald") === "on";
  const ueberschreiben = formData.get("ueberschreiben") === "on";

  if (!titel) return;

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) return;

  // Automatische Ergänzung: nur was der Nutzer leer gelassen hat, rein
  // best-effort — ein Fehlschlag blockiert nichts, es bleibt einfach leer
  // bzw. beim Default "Deutsch".
  if (!autor || !originalsprache) {
    const ergaenzung = await buchdetailsErgaenzen(titel);
    if (!autor && ergaenzung.autor) autor = ergaenzung.autor;
    if (!originalsprache && ergaenzung.originalsprache) originalsprache = ergaenzung.originalsprache;
  }
  if (!originalsprache) originalsprache = "Deutsch";

  if (!ueberschreiben) {
    const doubletten = await doublettenFinden(konto.id, titel, autor);
    if (doubletten.length > 0) {
      const top = doubletten[0];
      const params = new URLSearchParams({
        fehler: "doublette",
        titel,
        originalsprache,
        doubletteTitel: top.titel,
        doubletteAutor: top.autor,
        doubletteExakt: top.istExakt ? "1" : "0",
        doubletteStatus: top.status ?? "",
      });
      if (autor) params.set("autor", autor);
      if (kategorieEingabe) params.set("kategorie", kategorieEingabe);
      if (notiz) params.set("notiz", notiz);
      if (bald) params.set("bald", "on");
      redirect(`/buecherliste/neu?${params.toString()}`);
    }
  }

  const bedingungen = [ilike(buecher.titel, titel)];
  if (autor) bedingungen.push(ilike(buecher.autor, autor));

  let [buch] = await db
    .select()
    .from(buecher)
    .where(and(...bedingungen));

  if (!buch) {
    let kategorie: (typeof kategorieEnum.enumValues)[number] | null = kategorieEingabe || null;
    // Kostenfreie Testumgebung: automatische Kategorie-Erkennung löst
    // einen Claude-API-Aufruf aus, deshalb dort übersprungen — der Nutzer
    // landet stattdessen im ohnehin vorhandenen "Kategorie fehlt"-Zweig
    // unten und wählt manuell (siehe src/lib/testmodus.ts).
    if (!kategorie && !kiDeaktiviert()) {
      kategorie = await kategorieErkennen(titel, autor);
    }

    if (!kategorie) {
      const params = new URLSearchParams({ fehler: "kategorie", titel, originalsprache });
      if (autor) params.set("autor", autor);
      if (notiz) params.set("notiz", notiz);
      if (bald) params.set("bald", "on");
      redirect(`/buecherliste/neu?${params.toString()}`);
    }

    [buch] = await db
      .insert(buecher)
      .values({ titel, autor: autor || "Unbekannt", originalsprache, kategorie })
      .returning();
  }

  await db.insert(wunschlisteneintraege).values({
    kontoId: konto.id,
    buchId: buch.id,
    notiz: notiz || null,
    bald,
    herkunft: "eigene_liste",
  });

  redirect("/buecherliste");
}
