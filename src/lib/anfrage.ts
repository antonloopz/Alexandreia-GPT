// src/lib/anfrage.ts
//
// Gemeinsamer Wrapper um client.messages.create() für Aufrufe MIT Websuche
// (Bug 09/2026, Pendenz "Zusammenfassung in drei Ebenen strukturieren"):
// bei einem langen Durchgang mit vielen Suchen kann die API den Durchgang
// mit stop_reason "pause_turn" unterbrechen. Die Antwort enthält dann nur
// den bisherigen Zwischenstand — typischerweise einen einzigen Satz wie
// "Nun habe ich genug Material, um die Zusammenfassung zu verfassen." und
// KEIN JSON. Die API erwartet, dass man die Antwort unverändert als
// Assistant-Nachricht zurückschickt, damit das Modell dort weitermacht.
//
// Vorher wurde dieser Zwischenstand als fertige Antwort behandelt und
// scheiterte in jsonAusText() mit "Unexpected token 'N'" — sah aus wie
// ein JSON-Reparaturfall, war aber schlicht eine unvollständige Antwort.
//
// Die Inhaltsblöcke aller Teil-Antworten werden in Reihenfolge
// zusammengeführt, sodass gesamtText() (entwurf.ts/recherche.ts) wie
// bisher über ALLE Textblöcke läuft; Prosa vor dem JSON (z.B. obiger Satz)
// entfernt jsonAusText() über extrahiereJsonKern().
//
// Zweiter Fall (gleicher Bug, 09/2026 beim Nachzieh-Lauf "Schuld und
// Sühne"): das Modell beendet den Durchgang REGULÄR (stop_reason
// "end_turn") nach genau so einem Ankündigungssatz, ohne das JSON je zu
// schreiben. Enthält der gesamte Text dann kein einziges "{", wird EINMAL
// im selben Gespräch nachgefragt ("gib jetzt das JSON aus") — die bereits
// geladenen Suchergebnisse bleiben dabei im Kontext, es wird nicht erneut
// gesucht. Alle Aufrufer dieses Wrappers erwarten eine JSON-Antwort.

import Anthropic from "@anthropic-ai/sdk";

// Obergrenze für Fortsetzungen — schützt vor einer Endlosschleife (und
// Endloskosten), falls die API wider Erwarten immer wieder pausiert.
const MAX_FORTSETZUNGEN = 4;

const JSON_NACHFRAGE =
  "Du hast das JSON noch nicht ausgegeben. Gib jetzt AUSSCHLIESSLICH das geforderte JSON-Objekt " +
  "aus — ohne weitere Suche, ohne Text davor oder danach.";

function textAus(bloecke: Anthropic.ContentBlock[]): string {
  return bloecke
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function erstelleMitFortsetzung(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  let nachrichten: Anthropic.MessageParam[] = [...params.messages];
  const alleBloecke: Anthropic.ContentBlock[] = [];
  let jsonNachgefragt = false;

  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await client.messages.create({ ...params, messages: nachrichten });
    alleBloecke.push(...antwort.content);
    const alsAssistent: Anthropic.MessageParam = {
      role: "assistant",
      content: antwort.content as Anthropic.ContentBlockParam[],
    };

    if (antwort.stop_reason === "pause_turn") {
      nachrichten = [...nachrichten, alsAssistent];
      continue;
    }

    if (antwort.stop_reason === "end_turn" && !jsonNachgefragt && !textAus(alleBloecke).includes("{")) {
      jsonNachgefragt = true;
      nachrichten = [...nachrichten, alsAssistent, { role: "user", content: JSON_NACHFRAGE }];
      continue;
    }

    return { ...antwort, content: alleBloecke };
  }

  throw new Error(
    `Modell hat nach ${MAX_FORTSETZUNGEN + 1} Runden (pause_turn/JSON-Nachfrage) noch keine fertige Antwort geliefert — abgebrochen.`
  );
}
