// app/api/cron/pruefen-2/route.ts
//
// Zweiter täglicher Lauf von Stufe 2 (siehe app/api/cron/pruefen) — eigene
// Route, weil vercel.json jeden Cron-Job über seinen Pfad führt.
// Identisches Verhalten; maxDuration muss hier selbst stehen, da Next.js
// die Segment-Konfiguration pro Route statisch ausliest.

export const maxDuration = 300;
export { GET } from "../pruefen/route";
