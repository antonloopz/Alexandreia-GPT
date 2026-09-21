// src/lib/kategorieprofile.ts
//
// Zentrales Profil pro Kategorie für die Aufbereitungs-Pipeline (09/2026,
// Pendenz "Aufbereitung: kategorieabhängige Prompts + Quiz-Fragetypen").
// Vorher waren die kategorieabhängigen Regeln über mehrere Funktionen in
// entwurf.ts verteilt (zweiteEbene(), kernaussagenAnleitung()); jetzt steht
// alles, was eine Kategorie inhaltlich ausmacht, an genau einer Stelle:
//
// - schwerpunkt:      worauf Zusammenfassung und Kernaussagen achten
//                     (Vorgabe aus der Massnahmenliste 09/2026, für
//                     Gesellschaft/Politik, Pers. Entwicklung und
//                     Technologie ergänzt)
// - ebene2:           Titel + Anleitung für die zweite Ebene der
//                     Zusammenfassung ("Argumentation" bzw. Variante)
// - kernaussagen:     welche Art von Kernaussage passt ("text"/"erklaerung")
// - beispiel:         was als konkretes Beispiel pro Kernaussage passt
// - quizFragetypen:   Gewichtung der Fragetypen (Verständnis, Anwendung,
//                     Transfer, Unterscheidung, kritische Reflexion)
// - einordnung:       "voll" (Argument/Beleg/Annahme/Schwachstelle + heute)
//                     bei Sachbüchern, "nur_heute" bei Literatur/Biografie/
//                     Geschichte — dort wirken Argument und Schwachstelle
//                     erzwungen (Entscheid 21.09.2026)
// - wissensstatus:    ob pro Kernaussage ein Wissensstatus (belegt/
//                     umstritten/überholt/unklar) erzeugt wird — nicht bei
//                     Literatur (Themen/Motive haben keinen Forschungsstand)
//
// "Buchtyp" ist bewusst KEINE dritte Einteilung neben Kategorie und Tags —
// die Buchtypen der Massnahmenliste sind auf die bestehenden Kategorien
// gemappt.

export type KategorieProfil = {
  schwerpunkt: string;
  ebene2: { titel: string; anleitung: string };
  kernaussagen: string;
  beispiel: string;
  quizFragetypen: string;
  einordnung: "voll" | "nur_heute";
  wissensstatus: boolean;
};

const ARGUMENTATION = {
  titel: "Argumentation",
  anleitung:
    "die zentrale Logik des Autors: Ausgangsfrage/Problem → Hauptthese → die wichtigsten " +
    "Begründungsschritte und Belege → Schlussfolgerung. Sichtbar machen, wie die Gedanken " +
    "aufeinander aufbauen (ein kurzer Absatz pro Schritt), statt Inhalte bloss aufzuzählen.",
};

const ZUSAMMENHAENGE = {
  titel: "Zusammenhänge",
  anleitung:
    "die tragenden Zusammenhänge: Ausgangslage, Ursachen, Wendepunkte, Entscheidungen und " +
    "Folgen — und wie der Autor diese deutet und gewichtet (seine Lesart, nicht eine neutrale " +
    "Chronik).",
};

const THESEN =
  "echte inhaltliche Thesen/Erkenntnisse des Buchs, keine blossen Kapitelüberschriften. " +
  '"text": die These als kurzer Titel, "erklaerung": erklärender Fliesstext.';

const WENDEPUNKTE =
  "die prägendsten Wendepunkte, Entscheidungen oder Erkenntnisse — KEINE erzwungenen " +
  'abstrakten Thesen, wenn das Werk selbst keine liefert. "text": der Wendepunkt/die ' +
  'Entscheidung kurz benannt, "erklaerung": warum er/sie prägend war bzw. was daraus folgte.';

const PROFILE: Record<string, KategorieProfil> = {
  philosophie: {
    schwerpunkt: "Positionen und Argumente",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "ein Gedankenexperiment, Fallbeispiel oder eine konkrete Anwendung der These",
    quizFragetypen: "vor allem Unterscheidung (Positionen auseinanderhalten), kritische Reflexion und Verständnis",
    einordnung: "voll",
    wissensstatus: true,
  },
  psychologie: {
    schwerpunkt: "Mechanismen und Studien",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "eine konkrete Studie bzw. ein Experiment aus dem Buch oder eine Alltagssituation, in der der Mechanismus wirkt",
    quizFragetypen: "vor allem Anwendung (Mechanismus in einer Situation erkennen), Verständnis und kritische Reflexion (Evidenzlage)",
    einordnung: "voll",
    wissensstatus: true,
  },
  wirtschaft_business: {
    schwerpunkt: "Modelle, Prinzipien und ihre Anwendung",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "ein Fallbeispiel (Unternehmen, Entscheidung, Situation) aus dem Buch",
    quizFragetypen: "vor allem Anwendung und Transfer (Prinzip auf eine neue Situation übertragen), dazu Verständnis",
    einordnung: "voll",
    wissensstatus: true,
  },
  geschichte: {
    schwerpunkt: "Ursachen, Zusammenhänge und Folgen",
    ebene2: ZUSAMMENHAENGE,
    kernaussagen: WENDEPUNKTE,
    beispiel: "ein konkretes Ereignis, eine Person oder eine Quelle, an der der Wendepunkt sichtbar wird",
    quizFragetypen: "vor allem Unterscheidung (Ursache vs. Folge, Epochen/Akteure), Verständnis und Transfer",
    einordnung: "nur_heute",
    wissensstatus: true,
  },
  naturwissenschaft: {
    schwerpunkt: "Konzepte, Mechanismen und Evidenz",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "ein Experiment, eine Beobachtung oder ein Phänomen, das das Konzept zeigt",
    quizFragetypen: "vor allem Verständnis, Anwendung (Konzept auf ein Phänomen anwenden) und Unterscheidung",
    einordnung: "voll",
    wissensstatus: true,
  },
  gesellschaft_politik: {
    schwerpunkt: "Positionen, Ursachen und Folgen",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "ein konkreter Fall, eine Entwicklung oder ein Datenpunkt aus dem Buch",
    quizFragetypen: "vor allem Unterscheidung (Positionen), kritische Reflexion und Transfer",
    einordnung: "voll",
    wissensstatus: true,
  },
  biografie_memoir: {
    schwerpunkt: "Entscheidungen und Lebensweg",
    ebene2: ZUSAMMENHAENGE,
    kernaussagen: WENDEPUNKTE,
    beispiel: "eine konkrete Episode aus dem Leben, an der der Wendepunkt sichtbar wird",
    quizFragetypen: "vor allem Verständnis, Transfer (was sich auf das eigene Leben übertragen lässt) und kritische Reflexion",
    einordnung: "nur_heute",
    wissensstatus: true,
  },
  literatur_klassiker: {
    schwerpunkt: "Themen, Motive und Interpretation",
    ebene2: {
      titel: "Deutung & Motive",
      anleitung:
        "die zentralen Themen, Motive und Deutungslinien des Werks und wie Handlung, Figuren " +
        "und Form sie tragen — hier NICHT die Handlung nacherzählen (das folgt in Ebene 3).",
    },
    kernaussagen:
      'die zentralen Themen/Motive des Werks — nicht wörtliche Thesen, da fiktional. "text": ' +
      'das Motiv/Thema kurz benannt, "erklaerung": wie es sich im Werk zeigt und warum es ' +
      "bedeutsam ist.",
    beispiel: "eine konkrete Szene, in der sich das Motiv zeigt — in eigenen Worten beschrieben, KEIN erfundenes wörtliches Zitat",
    quizFragetypen: "vor allem Verständnis, Unterscheidung (Figuren, Motive) und kritische Reflexion (Deutung)",
    einordnung: "nur_heute",
    wissensstatus: false,
  },
  spiritualitaet_sinnfragen: {
    schwerpunkt: "Konzepte, Argumentation und Einordnung",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "eine Praxis, Übung, ein Gleichnis oder eine Geschichte aus dem Buch",
    quizFragetypen: "vor allem Verständnis, Anwendung und kritische Reflexion",
    einordnung: "voll",
    wissensstatus: true,
  },
  persoenliche_entwicklung: {
    schwerpunkt: "Prinzipien, Methoden und Anwendung",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "eine konkrete Anwendung im Alltag oder ein Fallbeispiel aus dem Buch",
    quizFragetypen: "vor allem Anwendung und Transfer, dazu kritische Reflexion (wo das Prinzip an Grenzen stösst)",
    einordnung: "voll",
    wissensstatus: true,
  },
  technologie_technik: {
    schwerpunkt: "Konzepte, Funktionsweise und Folgen",
    ebene2: ARGUMENTATION,
    kernaussagen: THESEN,
    beispiel: "eine konkrete Technik, ein Produkt oder ein Anwendungsfall",
    quizFragetypen: "vor allem Verständnis (Funktionsweise), Anwendung und kritische Reflexion (Folgen)",
    einordnung: "voll",
    wissensstatus: true,
  },
};

export function kategorieProfil(kategorie: string): KategorieProfil {
  // Unbekannte Kategorie (sollte dank Enum nicht vorkommen): wie ein Sachbuch.
  return PROFILE[kategorie] ?? PROFILE.philosophie;
}
