// src/lib/streak.ts
//
// Echte Streak-Berechnung aus den datumGezeigt-Werten der gezeigteBuecher-
// Tabelle — löst den bisherigen Platzhalter auf Home/Abschluss ab (der nur
// die Gesamtzahl gezeigter Bücher zählte, keine echte Tage-Folge).
// aktuellerStreak: läuft nur weiter, wenn heute oder gestern dabei war
// (sonst 0 — die Serie ist abgerissen). laengsterStreak: die längste
// Folge aufeinanderfolgender Tage überhaupt, unabhängig von der Aktualität.

function alsTagesZahl(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function aktuellerStreak(daten: Date[], heute: Date = new Date()): number {
  const tage = Array.from(new Set(daten.map(alsTagesZahl))).sort((a, b) => b - a);
  if (tage.length === 0) return 0;

  const heuteTag = alsTagesZahl(heute);
  if (tage[0] !== heuteTag && tage[0] !== heuteTag - 1) return 0;

  let streak = 1;
  for (let i = 1; i < tage.length; i++) {
    if (tage[i - 1] - tage[i] === 1) streak++;
    else break;
  }
  return streak;
}

export function laengsterStreak(daten: Date[]): number {
  const tage = Array.from(new Set(daten.map(alsTagesZahl))).sort((a, b) => a - b);
  if (tage.length === 0) return 0;

  let laengster = 1;
  let aktuell = 1;
  for (let i = 1; i < tage.length; i++) {
    if (tage[i] - tage[i - 1] === 1) {
      aktuell++;
      laengster = Math.max(laengster, aktuell);
    } else {
      aktuell = 1;
    }
  }
  return laengster;
}
