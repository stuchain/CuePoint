/**
 * A card that says where Discover's other pages are (DSC-11).
 *
 * Artist and label pages and Similar tracks are reached from other places, so
 * a new user would not find them from Discover. The card points at the artist
 * and label names in the tables and at Similar tracks in a track's details,
 * once: dismissed, it stays away. It remembers in `localStorage` as a
 * convenience; without it the card simply shows again.
 */
import { useState } from "react";

import { Button } from "../../components/Button";

export const HINT_CARD_STORAGE_KEY = "cuepoint-discover-hint-dismissed";

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(HINT_CARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function DiscoverHintCard() {
  const [shown, setShown] = useState(() => !dismissedBefore());
  if (!shown) return null;
  return (
    <aside className="discover-hint" role="note" aria-label="Also in Discover">
      <p className="discover-hint__text">
        <strong>Also in Discover:</strong> click an artist or label name in a table to open its
        page, and open a track's Track details in the Library to find its Similar tracks, the
        tracks in your library that mix well with it.
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          setShown(false);
          try {
            localStorage.setItem(HINT_CARD_STORAGE_KEY, "1");
          } catch {
            // Remembering is a convenience.
          }
        }}
      >
        Got it
      </Button>
    </aside>
  );
}
