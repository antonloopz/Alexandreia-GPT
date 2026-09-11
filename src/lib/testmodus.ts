// src/lib/testmodus.ts
//
// Schalter für eine kostenfreie Testumgebung (09/2026, Pendenz "andere
// Personen zur Prüfung/Rückmeldung testen lassen"): ein separates
// Vercel-Deployment mit eigener (z.B. per Neon-Branch geklonter)
// Datenbank soll voll funktionsfähig sein, ausser den Funktionen, die
// echte Claude-API-Kosten auslösen. Wird dort NEXT_PUBLIC_KI_DEAKTIVIERT
// auf "true" gesetzt, überspringen alle kostenauslösenden Stellen (Cron-
// Produktion, "Jetzt aufbereiten", automatische Kategorie-Erkennung beim
// Hinzufügen eines Wunschbuchs) den jeweiligen API-Aufruf.
//
// Bewusst NEXT_PUBLIC (statt nur serverseitig gültig): so können sowohl
// Client-Komponenten (z.B. den Button ausblenden) als auch Server-Code
// (Actions/Routes) denselben einen Schalter lesen, ohne ihn separat als
// Prop durchzureichen. Die Haupt-Produktionsumgebung setzt diese Variable
// schlicht nicht — dort bleibt alles wie bisher.
export function kiDeaktiviert(): boolean {
  return process.env.NEXT_PUBLIC_KI_DEAKTIVIERT === "true";
}
