// src/db/seed-wishlist.ts
//
// Seedet die komplette, über mehrere Sessions gesammelte Wunschliste:
// legt für jeden Titel eine Zeile in `buecher` an (den geteilten "Vorrat" —
// noch ohne Inhalt/Buchinhalt, das kommt erst in der eigentlichen
// Content-Pipeline) und verknüpft sie über `wunschlisteneintraege` mit dem
// Standard-Konto. Idempotent: bereits vorhandene Titel/Einträge werden
// übersprungen, das Skript kann also gefahrlos mehrfach laufen.
//
// Voraussetzung: das Standard-Konto existiert bereits (siehe seed.ts).
//
// Ausführen mit:  npx tsx src/db/seed-wishlist.ts

import { config } from "dotenv";
config({ path: ".env.local" });

type Kategorie =
  | "philosophie"
  | "psychologie"
  | "wirtschaft_business"
  | "geschichte"
  | "naturwissenschaft"
  | "gesellschaft_politik"
  | "biografie_memoir"
  | "literatur_klassiker"
  | "spiritualitaet_sinnfragen"
  | "persoenliche_entwicklung"
  | "technologie_technik";

const buecherDaten: { titel: string; autor: string; originalsprache: string; kategorie: Kategorie }[] = [
  // Philosophie
  { titel: "Meditationen", autor: "Mark Aurel", originalsprache: "Griechisch", kategorie: "philosophie" },
  { titel: "Man's Search for Meaning", autor: "Viktor Frankl", originalsprache: "Deutsch", kategorie: "philosophie" },
  { titel: "Der Staat", autor: "Platon", originalsprache: "Griechisch", kategorie: "philosophie" },
  { titel: "Nikomachische Ethik", autor: "Aristoteles", originalsprache: "Griechisch", kategorie: "philosophie" },
  { titel: "Jenseits von Gut und Böse", autor: "Friedrich Nietzsche", originalsprache: "Deutsch", kategorie: "philosophie" },

  // Psychologie
  { titel: "Thinking, Fast and Slow", autor: "Daniel Kahneman", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "Resilient", autor: "Rick Hanson", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "Altered Traits", autor: "Daniel Goleman & Richard Davidson", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "Influence", autor: "Robert Cialdini", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "The Scout Mindset", autor: "Julia Galef", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "The Invisible Gorilla", autor: "Christopher Chabris & Daniel Simons", originalsprache: "Englisch", kategorie: "psychologie" },
  { titel: "The Righteous Mind", autor: "Jonathan Haidt", originalsprache: "Englisch", kategorie: "psychologie" },

  // Wirtschaft/Business
  { titel: "Poor Charlie's Almanack", autor: "Charlie Munger", originalsprache: "Englisch", kategorie: "wirtschaft_business" },
  { titel: "Zero to One", autor: "Peter Thiel", originalsprache: "Englisch", kategorie: "wirtschaft_business" },
  { titel: "The Wealth of Nations", autor: "Adam Smith", originalsprache: "Englisch", kategorie: "wirtschaft_business" },
  { titel: "Thinking in Systems", autor: "Donella Meadows", originalsprache: "Englisch", kategorie: "wirtschaft_business" },
  { titel: "High Output Management", autor: "Andrew Grove", originalsprache: "Englisch", kategorie: "wirtschaft_business" },
  { titel: "The Psychology of Money", autor: "Morgan Housel", originalsprache: "Englisch", kategorie: "wirtschaft_business" },

  // Geschichte
  { titel: "Guns, Germs, and Steel", autor: "Jared Diamond", originalsprache: "Englisch", kategorie: "geschichte" },
  { titel: "The Silk Roads", autor: "Peter Frankopan", originalsprache: "Englisch", kategorie: "geschichte" },
  { titel: "The Human Past", autor: "Chris Scarre", originalsprache: "Englisch", kategorie: "geschichte" },
  { titel: "The Dawn of Everything", autor: "David Graeber & David Wengrow", originalsprache: "Englisch", kategorie: "geschichte" },
  { titel: "The Rise and Fall of the Third Reich", autor: "William L. Shirer", originalsprache: "Englisch", kategorie: "geschichte" },

  // Naturwissenschaft
  { titel: "The Selfish Gene", autor: "Richard Dawkins", originalsprache: "Englisch", kategorie: "naturwissenschaft" },
  { titel: "Sapiens", autor: "Yuval Noah Harari", originalsprache: "Hebräisch", kategorie: "naturwissenschaft" },
  { titel: "The Signal and the Noise", autor: "Nate Silver", originalsprache: "Englisch", kategorie: "naturwissenschaft" },
  { titel: "The Ape that Understood the Universe", autor: "Steve Stewart-Williams", originalsprache: "Englisch", kategorie: "naturwissenschaft" },
  { titel: "Eine kurze Geschichte der Zeit", autor: "Stephen Hawking", originalsprache: "Englisch", kategorie: "naturwissenschaft" },
  { titel: "The Gene", autor: "Siddhartha Mukherjee", originalsprache: "Englisch", kategorie: "naturwissenschaft" },
  { titel: "The Demon-Haunted World", autor: "Carl Sagan", originalsprache: "Englisch", kategorie: "naturwissenschaft" },

  // Gesellschaft/Politik
  { titel: "Why Nations Fail", autor: "Daron Acemoglu & James A. Robinson", originalsprache: "Englisch", kategorie: "gesellschaft_politik" },
  { titel: "Prisoners of Geography", autor: "Tim Marshall", originalsprache: "Englisch", kategorie: "gesellschaft_politik" },
  { titel: "The Origins of Totalitarianism", autor: "Hannah Arendt", originalsprache: "Englisch", kategorie: "gesellschaft_politik" },
  { titel: "On Liberty", autor: "John Stuart Mill", originalsprache: "Englisch", kategorie: "gesellschaft_politik" },

  // Biografie/Memoir
  { titel: "Heroes for My Son", autor: "Brad Meltzer", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "Shoe Dog", autor: "Phil Knight", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "Steve Jobs", autor: "Walter Isaacson", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "Long Walk to Freedom", autor: "Nelson Mandela", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "The Autobiography of Malcolm X", autor: "Malcolm X & Alex Haley", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "Surely You're Joking, Mr. Feynman!", autor: "Richard Feynman", originalsprache: "Englisch", kategorie: "biografie_memoir" },
  { titel: "The Wright Brothers", autor: "David McCullough", originalsprache: "Englisch", kategorie: "biografie_memoir" },

  // Literatur/Klassiker
  { titel: "Die Brüder Karamasow", autor: "Fjodor Dostojewski", originalsprache: "Russisch", kategorie: "literatur_klassiker" },
  { titel: "Die Göttliche Komödie", autor: "Dante Alighieri", originalsprache: "Italienisch", kategorie: "literatur_klassiker" },
  { titel: "Schuld und Sühne", autor: "Fjodor Dostojewski", originalsprache: "Russisch", kategorie: "literatur_klassiker" },
  { titel: "Der Fremde", autor: "Albert Camus", originalsprache: "Französisch", kategorie: "literatur_klassiker" },
  { titel: "1984", autor: "George Orwell", originalsprache: "Englisch", kategorie: "literatur_klassiker" },
  { titel: "Der grosse Gatsby", autor: "F. Scott Fitzgerald", originalsprache: "Englisch", kategorie: "literatur_klassiker" },

  // Spiritualität/Sinnfragen
  { titel: "The Four Agreements", autor: "Don Miguel Ruiz", originalsprache: "Englisch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "Solve for Happy", autor: "Mo Gawdat", originalsprache: "Englisch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "The Power of Myth", autor: "Joseph Campbell & Bill Moyers", originalsprache: "Englisch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "Happiness", autor: "Matthieu Ricard", originalsprache: "Französisch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "Siddhartha", autor: "Hermann Hesse", originalsprache: "Deutsch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "Tao Te Ching", autor: "Laozi", originalsprache: "Chinesisch", kategorie: "spiritualitaet_sinnfragen" },
  { titel: "The Happiness Trap", autor: "Russ Harris", originalsprache: "Englisch", kategorie: "spiritualitaet_sinnfragen" },

  // Persönliche Entwicklung
  { titel: "Atomic Habits", autor: "James Clear", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Super Thinking", autor: "Gabriel Weinberg & Lauren McCann", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Tools of Titans", autor: "Tim Ferriss", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "The 7 Habits of Highly Effective People", autor: "Stephen R. Covey", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "As a Man Thinketh", autor: "James Allen", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "If I Could Tell You Just One Thing", autor: "Richard Reed", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Uncommon", autor: "Mark Divine", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Deep Work", autor: "Cal Newport", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Four Thousand Weeks", autor: "Oliver Burkeman", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
  { titel: "Slow Productivity", autor: "Cal Newport", originalsprache: "Englisch", kategorie: "persoenliche_entwicklung" },
];

async function main() {
  const { db } = await import("./index");
  const { buecher, konten, wunschlisteneintraege } = await import("./schema");
  const { and, eq } = await import("drizzle-orm");

  const [konto] = await db.select().from(konten).limit(1);
  if (!konto) {
    throw new Error(
      "Kein Konto gefunden — zuerst `npx tsx src/db/seed.ts` ausführen, um das Standard-Konto anzulegen."
    );
  }

  let buecherNeu = 0;
  let buecherVorhanden = 0;
  let eintraegeNeu = 0;
  let eintraegeVorhanden = 0;

  for (const b of buecherDaten) {
    let [buch] = await db
      .select()
      .from(buecher)
      .where(and(eq(buecher.titel, b.titel), eq(buecher.autor, b.autor)));

    if (!buch) {
      [buch] = await db
        .insert(buecher)
        .values({
          titel: b.titel,
          autor: b.autor,
          originalsprache: b.originalsprache,
          kategorie: b.kategorie,
        })
        .returning();
      buecherNeu++;
    } else {
      buecherVorhanden++;
    }

    const [eintrag] = await db
      .select()
      .from(wunschlisteneintraege)
      .where(
        and(
          eq(wunschlisteneintraege.kontoId, konto.id),
          eq(wunschlisteneintraege.buchId, buch.id)
        )
      );

    if (!eintrag) {
      await db.insert(wunschlisteneintraege).values({
        kontoId: konto.id,
        buchId: buch.id,
      });
      eintraegeNeu++;
    } else {
      eintraegeVorhanden++;
    }
  }

  console.log(
    `Bücher: ${buecherNeu} neu angelegt, ${buecherVorhanden} bereits vorhanden.`
  );
  console.log(
    `Wunschlisteneinträge: ${eintraegeNeu} neu angelegt, ${eintraegeVorhanden} bereits vorhanden.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
