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

import Anthropic from "@anthropic-ai/sdk";

// Obergrenze für Fortsetzungen — schützt vor einer Endlosschleife (und
// Endloskosten), falls die API wider Erwarten immer wieder pausiert.
const MAX_FORTSETZUNGEN = 4;

export async function erstelleMitFortsetzung(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  let nachrichten: Anthropic.MessageParam[] = [...params.messages];
  const alleBloecke: Anthropic.ContentBlock[] = [];

  for (let runde = 0; runde <= MAX_FORTSETZUNGEN; runde++) {
    const antwort = await client.messages.create({ ...params, messages: nachrichten });
    alleBloecke.push(...antwort.content);

    if (antwort.stop_reason !== "pause_turn") {
      return { ...antwort, content: alleBloecke };
    }

    nachrichten = [
      ...nachrichten,
      { role: "assistant", content: antwort.content as Anthropic.ContentBlockParam[] },
    ];
  }

  throw new Error(
    `Modell hat den Durchgang ${MAX_FORTSETZUNGEN + 1}× pausiert (stop_reason "pause_turn") — abgebrochen.`
  );
}
