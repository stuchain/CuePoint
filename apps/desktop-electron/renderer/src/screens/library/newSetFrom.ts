/**
 * "New Set from…" in words and in the engine's terms (DEC-104, PREP-02).
 *
 * A Collection, a Smart Collection and a Rekordbox playlist each become a Set
 * the same way — their tracks copied, in order, into one chapter — and each
 * says something different about what "a copy" means for it. Those sentences
 * are the feature: a user who reads that a Smart Collection's copy stops
 * matching knows why the Set did not grow next week.
 */
import type { SetSource } from "../../api/cuepointBridge.types";

/** Where a new Set is copied from, as the page knows it. */
export interface NewSetSource {
  kind: "collection" | "smart" | "playlist";
  id: number;
  name: string;
  /**
   * Where the Set is filed unless the user picks elsewhere: beside a source in
   * CuePoint's tree, which is where they were looking; at the top level for a
   * Rekordbox playlist, whose folders are not CuePoint's.
   */
  parentId: number | null;
}

/**
 * The source as the engine takes it (PREP-08's `create-from`).
 *
 * A Smart Collection is a Collection node to the engine, which copies its
 * answer now in its saved sort; the renderer's distinction is only the words.
 */
export function setSourceOf(source: NewSetSource): SetSource {
  return source.kind === "playlist"
    ? { kind: "playlist", id: source.id }
    : { kind: "collection", id: source.id };
}

/** What the dialog says the Set will start with, and what copying means here. */
export function newSetFromExplanation(source: NewSetSource): string {
  const name = `“${source.name}”`;
  switch (source.kind) {
    case "smart":
      return (
        `The Set starts with the tracks ${name} matches right now, in its saved ` +
        `order, as one chapter. It is a copy: a track that starts matching later ` +
        `joins ${name} and not the Set.`
      );
    case "playlist":
      return (
        `The Set starts with the tracks in the Rekordbox playlist ${name}, in its ` +
        `order, as one chapter. It is a copy: refreshing from Rekordbox never ` +
        `changes the Set.`
      );
    default:
      return (
        `The Set starts with the tracks in ${name}, in its order and with any ` +
        `repeats, as one chapter. It is a copy: ${name} stays as it is, and ` +
        `changing either one leaves the other alone.`
      );
  }
}

/** What the page says once the Set is made. */
export function newSetMadeLine(name: string, entries: number): string {
  const counted = `${entries.toLocaleString()} ${entries === 1 ? "entry" : "entries"}`;
  return `Made the Set “${name}” with ${counted}.`;
}
