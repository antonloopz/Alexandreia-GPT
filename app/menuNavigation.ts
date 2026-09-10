// app/menuNavigation.ts
//
// Sessionstorage-gestützte "Menü-Kette": merkt sich, von welcher Seite aus
// das Dropdown-Menü (MenuButton) innerhalb einer ununterbrochenen Folge von
// Menü-Navigationen zuerst geöffnet wurde, damit SchliessenButton dorthin
// zurückführen kann statt nur einen Schritt in der Browser-History zurück
// (Bug 09/2026: mehrere Menü-Sprünge hintereinander — z.B. Wiederholung ->
// Fortschritt -> Einstellungen — führten beim Schliessen immer nur zum
// VORHERIGEN Thema zurück, nicht zur ursprünglichen Seite, von der aus die
// Kette begann).
//
// ANKER_KEY: die Seite, zu der Schliessen zurückführen soll — wird nur beim
// ERSTEN Menü-Sprung einer Kette gesetzt, danach unverändert gelassen.
// VIA_MENU_KEY: kurzlebiges Flag, "1" genau für die eine Navigation, die
// gerade durch einen Klick auf einen Menü-Eintrag ausgelöst wurde. Die
// Zielseite liest (und verbraucht) es beim Mounten, um zu unterscheiden:
// über den Menü-Eintrag angekommen -> Teil derselben Kette, Anker behalten;
// auf jedem anderen Weg angekommen (normaler Link, Zurück-Button, o.ä.) ->
// neue Kette, Anker zurücksetzen.

const ANKER_KEY = "alexandreia:menuAnker";
const VIA_MENU_KEY = "alexandreia:navViaMenu";

// Von MenuButton unmittelbar vor der Navigation zu einem Menü-Eintrag
// aufgerufen, mit dem Pfad der Seite, auf der das Menü gerade geöffnet war.
export function menuNavigationStarten(aktuellerPfad: string) {
  try {
    if (!sessionStorage.getItem(ANKER_KEY)) {
      sessionStorage.setItem(ANKER_KEY, aktuellerPfad);
    }
    sessionStorage.setItem(VIA_MENU_KEY, "1");
  } catch {
    // sessionStorage kann in seltenen Fällen nicht verfügbar sein (z.B.
    // manche privaten Browser-Modi) — Schliessen fällt dann einfach auf
    // das alte back()-Verhalten zurück, kein harter Fehler.
  }
}

// Von MenuButton bei jedem Seitenaufruf (Mount) aufgerufen.
export function menuKetteAktualisieren() {
  try {
    const viaMenu = sessionStorage.getItem(VIA_MENU_KEY) === "1";
    sessionStorage.removeItem(VIA_MENU_KEY);
    if (!viaMenu) {
      sessionStorage.removeItem(ANKER_KEY);
    }
  } catch {
    // s.o.
  }
}

// Von SchliessenButton aufgerufen — null, wenn keine aktive Menü-Kette
// vorliegt (dann gilt das bisherige back()-Verhalten).
export function menuAnkerLesen(): string | null {
  try {
    return sessionStorage.getItem(ANKER_KEY);
  } catch {
    return null;
  }
}
