/**
 * Which values "Correct" also copies, remembered (C14, OQ5).
 *
 * One preference for both views: the ticks under the card in One at a time and
 * the "Correct" ticks over the Table are the same set, stored in one key. All on
 * by default except the key: replacing a key the user typed is the one value
 * Correct would take from them, so it is ticked only by choice, and a choice
 * made is remembered.
 */
import { useCallback, useState } from "react";

import { CARD_FIELDS, type CardField } from "./matchCard";

export const MATCH_TICKS_STORAGE_KEY = "cuepoint-clean-match-ticks";

const DEFAULT_TICKS: ReadonlySet<CardField> = new Set(CARD_FIELDS.filter((field) => field !== "key"));

export function loadMatchTicks(): ReadonlySet<CardField> {
  try {
    const stored = localStorage.getItem(MATCH_TICKS_STORAGE_KEY);
    if (stored === null) return DEFAULT_TICKS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_TICKS;
    return new Set(CARD_FIELDS.filter((field) => parsed.includes(field)));
  } catch {
    return DEFAULT_TICKS;
  }
}

export function saveMatchTicks(ticks: ReadonlySet<CardField>): void {
  try {
    localStorage.setItem(
      MATCH_TICKS_STORAGE_KEY,
      JSON.stringify(CARD_FIELDS.filter((field) => ticks.has(field))),
    );
  } catch {
    // Remembering is a convenience; the ticks work without it.
  }
}

interface MatchTicks {
  ticks: ReadonlySet<CardField>;
  toggle: (field: CardField) => void;
}

export function useMatchTicks(): MatchTicks {
  const [ticks, setTicks] = useState<ReadonlySet<CardField>>(loadMatchTicks);
  const toggle = useCallback((field: CardField) => {
    setTicks((previous) => {
      const next = new Set(previous);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      saveMatchTicks(next);
      return next;
    });
  }, []);
  return { ticks, toggle };
}
