// app/notizen/EntfernenButton.tsx
//
// Kleiner Entfernen-Link für eine Hervorhebung in der Notizen-Übersicht.
// Server Component (page.tsx) kann kein onClick haben — dafür dieser
// schlanke Client Component, der nach dem Löschen die Seite neu lädt
// (router.refresh()), da die Gruppierung serverseitig passiert.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { hervorhebungLoeschen } from "./actions";

export default function EntfernenButton({ id }: { id: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function entfernen() {
    startTransition(async () => {
      await hervorhebungLoeschen(id);
      router.refresh();
    });
  }

  return (
    <button
      onClick={entfernen}
      style={{
        border: "none",
        background: "none",
        color: "rgba(36,35,31,.5)",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: 13,
        cursor: "pointer",
        padding: 0,
        alignSelf: "flex-start",
      }}
    >
      Entfernen
    </button>
  );
}
