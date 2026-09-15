// app/buecherliste/LoeschenButton.tsx
//
// Löschen-Button für einen Wunschlisten-Eintrag (09/2026, Pendenz
// "Wunschliste: Einträge bearbeiten/löschen"). Anders als EntfernenButton
// bei den Notizen mit einer nativen confirm()-Sicherheitsabfrage — eine
// Hervorhebung zu entfernen ist folgenlos (der Text bleibt im Buch
// stehen), ein Wunschlisten-Eintrag ist dagegen die einzige Spur, dass man
// dieses Buch überhaupt lesen wollte.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { eintragLoeschen } from "./actions";

export default function LoeschenButton({ eintragId, titel }: { eintragId: string; titel: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function loeschen() {
    if (!window.confirm(`„${titel}“ von der Wunschliste entfernen?`)) return;
    startTransition(async () => {
      await eintragLoeschen(eintragId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={loeschen}
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: 600,
        fontSize: 13.5,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(36,35,31,.25)",
        background: "transparent",
        color: "rgba(36,35,31,.6)",
        cursor: "pointer",
      }}
    >
      Löschen
    </button>
  );
}
