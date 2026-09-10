// src/lib/json.ts
//
// Gemeinsame, robuste JSON-Extraktion für alle Pipeline-Schritte, die
// Claude bitten, "nur JSON" zu antworten (Entwurf, Prüfung, Lernkarten).
// In der Praxis hält sich das Modell fast immer daran, aber gelegentlich
// weicht die Antwort in einer von drei Arten ab, die alle nichts mit dem
// inhaltlichen Ergebnis zu tun haben:
//
// 1. Ein Textfeld enthält einen rohen Zeilenumbruch statt \n (z.B. bei
//    mehrsätzigen "probleme"-Einträgen) — lässt JSON.parse mit
//    "Unterminated string" scheitern.
// 2. Vor (seltener: nach) dem eigentlichen JSON-Objekt steht ein
//    erklärender Satz in Prosa, obwohl die Anweisung "nur JSON, ohne Text
//    davor oder danach" war — lässt JSON.parse mit "Unexpected token"
//    scheitern, weil der String nicht mit "{" beginnt.
// 3. Ein langes Textfeld (z.B. eine ausführliche Zusammenfassung) enthält
//    ein rohes, nicht escapetes Anführungszeichen mitten im Text (z.B. ein
//    zitierter Begriff) — JSON.parse hält den String dort fälschlich für
//    beendet und scheitert danach mit "Unexpected token" am nächsten
//    Zeichen. Wird mit steigender Textlänge (09/2026: deutlich
//    ausführlichere Zusammenfassungen) häufiger.
//
// Statt bei jedem seltenen Ausrutscher den ganzen (teuren, mehrminütigen)
// Pipeline-Schritt zu verwerfen, wird hier mehrstufig repariert: zuerst der
// JSON-Kern (erste "{"/"[" bis letzte "}"/"]") isoliert, dann bei Bedarf
// zusätzlich die rohen Steuerzeichen und Anführungszeichen escaped. Hilft
// nichts davon, wird der ursprüngliche (aussagekräftigere) Parse-Fehler
// weitergeworfen.

function repariereRoheStringSteuerzeichen(text: string): string {
  let ergebnis = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const zeichen = text[i];

    if (inString) {
      if (escaped) {
        ergebnis += zeichen;
        escaped = false;
        continue;
      }
      if (zeichen === "\\") {
        ergebnis += zeichen;
        escaped = true;
        continue;
      }
      if (zeichen === '"') {
        // Echtes Stringende erkennen: danach folgt (nach Leerraum) eines
        // von , : } ] oder gar nichts mehr — sonst ist es ein rohes
        // Anführungszeichen MITTEN im Text (Fall 3 oben), das dann hier
        // escaped wird, statt den String fälschlich zu beenden.
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const danach = text[j];
        const echtesEnde = danach === undefined || ",:}]".includes(danach);
        if (echtesEnde) {
          ergebnis += zeichen;
          inString = false;
        } else {
          ergebnis += '\\"';
        }
        continue;
      }
      if (zeichen === "\n") {
        ergebnis += "\\n";
        continue;
      }
      if (zeichen === "\r") {
        ergebnis += "\\r";
        continue;
      }
      if (zeichen === "\t") {
        ergebnis += "\\t";
        continue;
      }
      ergebnis += zeichen;
    } else {
      if (zeichen === '"') inString = true;
      ergebnis += zeichen;
    }
  }

  return ergebnis;
}

// Isoliert den eigentlichen JSON-Kern, falls davor oder danach Prosa steht:
// vom ersten "{" oder "[" bis zum letzten passenden "}" bzw. "]".
function extrahiereJsonKern(text: string): string {
  const start = text.search(/[{[]/);
  if (start === -1) return text;

  const öffnend = text[start];
  const schliessend = öffnend === "{" ? "}" : "]";
  const ende = text.lastIndexOf(schliessend);
  if (ende === -1 || ende < start) return text;

  return text.slice(start, ende + 1);
}

export function jsonAusText(text: string): unknown {
  const bereinigt = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  const kandidaten = [bereinigt, extrahiereJsonKern(bereinigt)];

  let ursprünglicherFehler: unknown;

  for (const kandidat of kandidaten) {
    try {
      return JSON.parse(kandidat);
    } catch (fehler) {
      if (ursprünglicherFehler === undefined) ursprünglicherFehler = fehler;
    }
    try {
      return JSON.parse(repariereRoheStringSteuerzeichen(kandidat));
    } catch {
      // nächster Kandidat / am Ende: ursprünglicher Fehler
    }
  }

  // Alle Reparaturversuche gescheitert — der ursprüngliche Fehler zeigt die
  // tatsächliche Bruchstelle im Originaltext am klarsten.
  throw ursprünglicherFehler;
}
