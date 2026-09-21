// src/lib/json.ts
//
// Gemeinsame, robuste JSON-Extraktion für alle Pipeline-Schritte, die
// Claude bitten, "nur JSON" zu antworten (Entwurf, Prüfung, Quiz).
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
//    ausführlichere Zusammenfassungen) häufiger. Ein Blick nur auf das
//    NÄCHSTE Zeichen reicht dabei nicht: ein Zitat kann direkt von einem
//    Komma gefolgt sein, das ganz normale Satzzeichen ist ("Zitat", schrieb
//    er weiter) — das sieht genau wie ein echtes JSON-Feldende aus. Deshalb
//    prüft pruefeEchtesStringende() bei , und : zusätzlich das Zeichen
//    DANACH: nur wenn dort ein neuer JSON-Wert beginnt (typischerweise ein
//    Anführungszeichen für den nächsten Schlüssel), gilt es als echtes Ende.
//
// Statt bei jedem seltenen Ausrutscher den ganzen (teuren, mehrminütigen)
// Pipeline-Schritt zu verwerfen, wird hier mehrstufig repariert: zuerst der
// JSON-Kern (erste "{"/"[" bis letzte "}"/"]") isoliert, dann bei Bedarf
// zusätzlich die rohen Steuerzeichen und Anführungszeichen escaped. Hilft
// nichts davon, wird der ursprüngliche (aussagekräftigere) Parse-Fehler
// weitergeworfen.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Prüft bei einem Anführungszeichen an Position `index`, ob es das ECHTE
// Ende des JSON-Strings ist. Bei , und : wird noch ein Zeichen weiter
// geschaut: nur wenn danach ein neuer JSON-Wert beginnt (Anführungszeichen
// für den nächsten Schlüssel/String, Ziffer, {, [, -, oder der Anfang von
// true/false/null), gilt das Komma/der Doppelpunkt als echte JSON-Struktur
// und nicht als normales Satzzeichen im Fliesstext.
function pruefeEchtesStringende(text: string, index: number): boolean {
  let j = index + 1;
  while (j < text.length && /\s/.test(text[j])) j++;
  const danach = text[j];

  if (danach === undefined) return true;
  if (danach === "}" || danach === "]") return true;

  if (danach === ",") {
    let k = j + 1;
    while (k < text.length && /\s/.test(text[k])) k++;
    return text[k] === '"';
  }

  if (danach === ":") {
    let k = j + 1;
    while (k < text.length && /\s/.test(text[k])) k++;
    const wert = text[k];
    return (
      wert === '"' ||
      wert === "{" ||
      wert === "[" ||
      wert === "-" ||
      (wert !== undefined && /[0-9tfn]/.test(wert))
    );
  }

  return false;
}

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
        if (pruefeEchtesStringende(text, i)) {
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

// Speichert den nicht parsbaren Rohtext zur Fehlersuche (alle drei
// Reparaturversuche oben sind ausgeschöpft) in einer Datei ausserhalb des
// Projekts, statt ihn nur in einer oft abgeschnittenen Konsolenzeile zu
// verlieren — bei mehreren tausend Wörtern langen Zusammenfassungen (siehe
// entwurf.ts, 09/2026) reicht die JSON.parse-Fehlermeldung allein nicht,
// um die tatsächliche Bruchstelle zu finden. Best-effort: schlägt das
// Schreiben selbst fehl (z.B. kein Schreibzugriff), wird nur null
// zurückgegeben statt den eigentlichen Fehler zu verschleiern.
function schreibeDebugDump(text: string): string | null {
  try {
    // Lokal (Skripte im Terminal): existiert im Projekt ein .debug-Ordner
    // (gitignored, 09/2026), landet der Dump dort — so kann eine Claude-
    // Session ihn direkt lesen. Sonst (z.B. Vercel) wie bisher im tmpdir.
    const projektDebug = path.join(process.cwd(), ".debug");
    const basis = fs.existsSync(projektDebug) ? projektDebug : os.tmpdir();
    const ordner = path.join(basis, "alexandreia-json-fehler");
    fs.mkdirSync(ordner, { recursive: true });

    const dateiname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    const zielpfad = path.join(ordner, dateiname);
    fs.writeFileSync(zielpfad, text, "utf-8");
    return zielpfad;
  } catch {
    return null;
  }
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
  // tatsächliche Bruchstelle im Originaltext am klarsten. Rohtext zusätzlich
  // zur Fehlersuche wegschreiben (siehe schreibeDebugDump oben).
  const debugPfad = schreibeDebugDump(text);
  const basisNachricht =
    ursprünglicherFehler instanceof Error ? ursprünglicherFehler.message : String(ursprünglicherFehler);
  const nachricht = debugPfad
    ? `${basisNachricht} — Rohtext gespeichert unter: ${debugPfad}`
    : basisNachricht;
  throw new Error(nachricht, { cause: ursprünglicherFehler });
}
