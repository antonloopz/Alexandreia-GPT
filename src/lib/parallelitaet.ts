// src/lib/parallelitaet.ts
//
// Kleiner Concurrency-Limiter fürs Abarbeiten vieler async Aufgaben mit
// höchstens N gleichzeitig laufenden — ohne zusätzliche Abhängigkeit wie
// p-limit (09/2026, Pendenz "Concurrency-Limit für Open-Library-
// Anfragen"). Grund: die after()-Hintergrund-Jobs in Wunschliste und
// Bibliothek haben bisher ALLE Zeilen gleichzeitig per Promise.all
// losgeschickt — bei vielen Büchern auf einmal sind das schnell dutzende
// paralleler Anfragen an dieselbe API (Open Library), was zu Rate-
// Limiting führen kann (siehe Bug-Fix-Kommentar in lib/buchinfos.ts,
// "kein einziges Buch hat ein Cover" — genau dieses ungedrosselte
// Losschicken war die Ursache).
//
// Einfacher Worker-Pool: `grenze` Worker ziehen sich nacheinander Items
// aus derselben Warteschlange, bis sie leer ist — dadurch laufen nie mehr
// als `grenze` Aufrufe von `aufgabe` gleichzeitig, unabhängig von der
// Gesamtanzahl der Items.
export async function mitBegrenzterParallelitaet<T>(
  items: readonly T[],
  grenze: number,
  aufgabe: (item: T, index: number) => Promise<void>
): Promise<void> {
  let naechsterIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = naechsterIndex;
      naechsterIndex += 1;
      if (index >= items.length) return;
      await aufgabe(items[index], index);
    }
  }

  const anzahlWorker = Math.max(1, Math.min(grenze, items.length));
  await Promise.all(Array.from({ length: anzahlWorker }, () => worker()));
}
