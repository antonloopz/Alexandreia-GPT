// app/api/cron/fertigstellen-2/route.ts
//
// Zweiter täglicher Lauf von Stufe 3 (siehe app/api/cron/fertigstellen) —
// eigene Route, weil vercel.json jeden Cron-Job über seinen Pfad führt.
// Identisches Verhalten; maxDuration muss hier selbst stehen, da Next.js
// die Segment-Konfiguration pro Route statisch ausliest.

export const maxDuration = 300;
export { GET } from "../fertigstellen/route";
