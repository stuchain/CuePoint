import { useState } from "react";
import { useMotion } from "../../tokens/MotionContext";

/**
 * Which counts changed since the last render, for the state kind (PAGES-12).
 *
 * Returns, by key, how many times that key's count has changed while the kind was on: odd and
 * even values name different animations, so a second change restarts it. A count that is only
 * drawn (the first map, or a key the old map did not hold when it held nothing at all) is not a
 * change, and with the kind off or under reduced motion nothing is ever marked.
 */
export function useCountChanges(counts: ReadonlyMap<string, number>): ReadonlyMap<string, number> {
  const moves = useMotion("state");
  const [seen, setSeen] = useState<{ counts: ReadonlyMap<string, number>; marks: ReadonlyMap<string, number> }>({
    counts,
    marks: new Map(),
  });
  if (seen.counts !== counts) {
    const marks = new Map(seen.marks);
    if (moves && seen.counts.size > 0) {
      for (const [code, count] of counts) {
        if ((seen.counts.get(code) ?? 0) !== count) marks.set(code, (marks.get(code) ?? 0) + 1);
      }
    }
    setSeen({ counts, marks });
  }
  return seen.marks;
}

/** The attribute value for a key: absent until it has changed, then 1 or 0 by turns. */
export function changedMark(marks: ReadonlyMap<string, number>, code: string): number | undefined {
  const n = marks.get(code);
  return n ? n % 2 : undefined;
}
