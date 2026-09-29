/**
 * "New Set from…" in words and in the engine's terms (DEC-104, PREP-02).
 *
 * A Collection, a Smart Collection, a Rekordbox playlist and a selection each
 * become a Set the same way — their tracks copied, in order, into one chapter
 * — and each says something different about what "a copy" means for it. Those
 * sentences are the feature: a user who reads that a Smart Collection's copy
 * stops matching knows why the Set did not grow next week.
 */
import type { SetSource } from "../../api/cuepointBridge.types";

/**
 * The most entries a Set holds: the engine's `MAX_SET_ENTRIES` (PREP-02).
 *
 * The engine refuses more whatever this says; the renderer knows it so a
 * selection too large is refused before thousands of ids are read.
 * `newSetFrom.test.ts` holds it to the limit the engine sends with a Set's
 * entries.
 */
export const SET_ENTRY_LIMIT = 1_000;

/** What a Set made from a selection is called until the user names it. */
export const SELECTION_SET_NAME = "New Set";

/** Where a new Set is copied from, as the page knows it. */
export interface NewSetSource {
  kind: "collection" | "smart" | "playlist" | "selection";
  /** The source's id; 0 for a selection, which has none. */
  id: number;
  /** The source's name, or for a selection the name the Set starts with. */
  name: string;
  /** A selection's tracks, in the order the table showed them. */
  trackIds?: readonly number[];
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
  switch (source.kind) {
    case "playlist":
      return { kind: "playlist", id: source.id };
    case "selection":
      return { kind: "selection", track_ids: [...(source.trackIds ?? [])] };
    default:
      return { kind: "collection", id: source.id };
  }
}

/** "1 selected track", "12 selected tracks". */
function selectedTracks(count: number): string {
  return `${count.toLocaleString()} selected ${count === 1 ? "track" : "tracks"}`;
}

/** A selection as a source: its tracks, in order, with a name to start from. */
export function selectionSource(trackIds: readonly number[], parentId: number | null): NewSetSource {
  return { kind: "selection", id: 0, name: SELECTION_SET_NAME, trackIds, parentId };
}

/** The dialog's title: the source by name, or a selection by its size. */
export function newSetFromTitle(source: NewSetSource): string {
  return source.kind === "selection"
    ? `New Set from the ${selectedTracks(source.trackIds?.length ?? 0)}`
    : `New Set from “${source.name}”`;
}

/**
 * Why a selection cannot become a Set, or null when it can.
 *
 * Refused whole, with the numbers, as the engine refuses a source that holds
 * too many: a Set that silently took the first thousand would not be the
 * selection.
 */
export function selectionTooLarge(count: number, limit: number = SET_ENTRY_LIMIT): string | null {
  if (count <= limit) return null;
  return (
    `A Set holds at most ${limit.toLocaleString()} entries, and ${count.toLocaleString()} ` +
    `tracks are selected. Select fewer, or add them to a Collection instead.`
  );
}

/** What the dialog says the Set will start with, and what copying means here. */
export function newSetFromExplanation(source: NewSetSource): string {
  const name = `“${source.name}”`;
  switch (source.kind) {
    case "selection":
      return (
        `The Set starts with the ${selectedTracks(source.trackIds?.length ?? 0)}, in the ` +
        `order the table shows them, as one chapter. Nothing else changes.`
      );
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
