/**
 * The Set table's rows, and what a gesture on them asks of the engine (PREP-10).
 *
 * The table is a `TrackTable` over rows of its own type (DEC-112): an entry,
 * or a chapter's heading. Headings are rows because the table lays out one
 * height per row, and a heading that was a table feature would teach
 * `TrackTable` about Sets. A Set with one unnamed chapter draws no heading, so
 * a Set that never uses chapters looks like a list (DEC-103).
 *
 * Everything here is pure: which rows there are, what a drop means, which
 * place a chapter change moves an entry to. The engine keeps the rules (which
 * chapter reaches a place, contiguity); this only names the place a gesture
 * pointed at, in the engine's terms (`moveEntry`'s final position and chapter).
 */
import type {
  SetAnalysis,
  SetChapterPlan,
  SetEntries,
  SetEntry,
  SetNotice,
  SetPlan,
  SetWarning,
} from "../../api/cuepointBridge.types";

export interface HeadingRow {
  kind: "heading";
  chapter: SetChapterPlan;
  /** The chapter's own checks: its target and its BPM range (PREP-05). */
  warnings: SetWarning[];
}

export interface EntryRow {
  kind: "entry";
  entry: SetEntry;
  chapter: SetChapterPlan | null;
  /** The warnings into this entry, from the one before it. */
  transition: SetWarning[];
  /** The entry's own: its file, its planned times. */
  warnings: SetWarning[];
  notices: SetNotice[];
}

export type PrepareRow = HeadingRow | EntryRow;

/** One id space for both kinds, as the table's selection needs: headings are negative. */
export function rowKey(row: PrepareRow): number {
  return row.kind === "entry" ? row.entry.entry_id : -row.chapter.id;
}

export function isEntryRow(row: PrepareRow | undefined): row is EntryRow {
  return row?.kind === "entry";
}

/** DEC-103: one unnamed chapter is a list, and draws no heading. */
export function showsHeadings(chapters: readonly SetChapterPlan[]): boolean {
  return chapters.length > 1 || (chapters.length === 1 && chapters[0].name !== "");
}

/** How a chapter is called: its name, or its place, as the engine's messages say it. */
export function chapterName(chapter: Pick<SetChapterPlan, "name" | "position">): string {
  return chapter.name !== "" ? chapter.name : `Chapter ${chapter.position + 1}`;
}

/**
 * The rows, chapter by chapter, each chapter's entries in Set order.
 *
 * The plan and the entries are two reads. The page reads them together after
 * every edit, so they agree; an entry whose chapter the plan does not know
 * still gets a row, at the end, rather than vanishing from a running order.
 */
export function buildSetRows(
  plan: SetPlan,
  entries: SetEntries,
  analysis: SetAnalysis | null,
): PrepareRow[] {
  const chapters = [...plan.chapters].sort((a, b) => a.position - b.position);
  const headings = showsHeadings(chapters);
  const into = new Map<number, SetWarning[]>();
  for (const transition of analysis?.transitions ?? []) {
    into.set(transition.to_entry_id, transition.warnings);
  }
  const own = new Map((analysis?.entries ?? []).map((found) => [found.entry_id, found]));
  const chapterWarnings = new Map(
    (analysis?.chapters ?? []).map((found) => [found.chapter_id, found.warnings]),
  );

  const entryRow = (entry: SetEntry, chapter: SetChapterPlan | null): EntryRow => ({
    kind: "entry",
    entry,
    chapter,
    transition: into.get(entry.entry_id) ?? [],
    warnings: own.get(entry.entry_id)?.warnings ?? [],
    notices: own.get(entry.entry_id)?.notices ?? [],
  });

  const ordered = [...entries.entries].sort((a, b) => a.position - b.position);
  const rows: PrepareRow[] = [];
  const placed = new Set<number>();
  for (const chapter of chapters) {
    if (headings) {
      rows.push({ kind: "heading", chapter, warnings: chapterWarnings.get(chapter.id) ?? [] });
    }
    for (const entry of ordered) {
      if (entry.chapter_id !== chapter.id) continue;
      rows.push(entryRow(entry, chapter));
      placed.add(entry.entry_id);
    }
  }
  for (const entry of ordered) {
    if (!placed.has(entry.entry_id)) rows.push(entryRow(entry, null));
  }
  return rows;
}

/** The entries in the table's order: the running order, repeats included. */
export function entriesOf(rows: readonly PrepareRow[]): SetEntry[] {
  return rows.filter(isEntryRow).map((row) => row.entry);
}

/** How many entries come before a row index: a place in the Set. */
export function entriesBefore(rows: readonly PrepareRow[], index: number): number {
  let count = 0;
  for (let at = 0; at < index && at < rows.length; at += 1) {
    if (rows[at].kind === "entry") count += 1;
  }
  return count;
}

/** A place in the Set: the position an entry takes there, and its chapter. */
interface DropPlace {
  position: number;
  chapter_id: number;
}

/**
 * Where a drop on the Set table lands, counted with nothing moving out of the
 * way: the place a new track dropped there takes (PREP-11).
 *
 * `insertAt` is the table's insertion point among the rows and `over` the row
 * the drop landed on. A drop on a heading goes to that chapter's start,
 * whichever half it landed on. A drop on an entry goes before or after it, in
 * that entry's chapter, which settles the one place two chapters could both
 * claim: the end of one and the start of the next.
 */
export function dropPlace(
  rows: readonly PrepareRow[],
  insertAt: number,
  over: number,
): DropPlace | null {
  const target = rows[over];
  if (!target) return null;
  if (target.kind === "heading") {
    return { position: entriesBefore(rows, over), chapter_id: target.chapter.id };
  }
  return {
    position: entriesBefore(rows, insertAt),
    chapter_id: target.chapter?.id ?? target.entry.chapter_id,
  };
}

/** What `sets.moveEntry` is asked: the entry's final place, and its chapter. */
interface EntryMove {
  entry_id: number;
  position: number;
  chapter_id: number;
}

/**
 * Where a dropped entry goes (PREP-10's drag): `dropPlace`'s place, counted as
 * the engine counts a move.
 *
 * The engine's position is where the entry ends up, counted without it, so a
 * move down the list lands one place earlier than the gap it was dropped in.
 * Null when the drop would change nothing.
 */
export function dropMove(
  rows: readonly PrepareRow[],
  moving: SetEntry,
  insertAt: number,
  over: number,
): EntryMove | null {
  const place = dropPlace(rows, insertAt, over);
  if (!place) return null;
  const position = place.position > moving.position ? place.position - 1 : place.position;
  if (position === moving.position && place.chapter_id === moving.chapter_id) return null;
  return { entry_id: moving.entry_id, position, chapter_id: place.chapter_id };
}

/**
 * Where an entry goes when the Inspector moves it to another chapter.
 *
 * The nearest place in that chapter: its start for a chapter later in the Set,
 * its end for one earlier, so the entry travels no further than it must. Null
 * for the chapter it is already in.
 */
export function chapterMove(
  plan: SetPlan,
  entry: SetEntry,
  chapterId: number,
): EntryMove | null {
  if (chapterId === entry.chapter_id) return null;
  const chapters = [...plan.chapters].sort((a, b) => a.position - b.position);
  const target = chapters.find((chapter) => chapter.id === chapterId);
  const current = chapters.find((chapter) => chapter.id === entry.chapter_id);
  if (!target) return null;
  let start = 0;
  for (const chapter of chapters) {
    if (chapter.id === target.id) break;
    start += chapter.entry_ids.length;
  }
  const later = current ? target.position > current.position : true;
  // Counted without the entry, which sits before a later chapter and after an
  // earlier one.
  const position = later ? start - 1 : start + target.entry_ids.length;
  return { entry_id: entry.entry_id, position: Math.max(0, position), chapter_id: chapterId };
}

/** Whether "Start a chapter here" can start one: not at a chapter's first entry. */
export function canSplitAt(rows: readonly PrepareRow[], entryId: number): boolean {
  const at = rows.findIndex((row) => row.kind === "entry" && row.entry.entry_id === entryId);
  if (at < 0) return false;
  const row = rows[at] as EntryRow;
  const previous = rows
    .slice(0, at)
    .reverse()
    .find((candidate): candidate is EntryRow => candidate.kind === "entry");
  return previous !== undefined && previous.entry.chapter_id === row.entry.chapter_id;
}

/** Where "Insert a repeat after" puts the copy: straight after, in the same chapter. */
export function repeatAfter(entry: SetEntry): { position: number; chapter_id: number } {
  return { position: entry.position + 1, chapter_id: entry.chapter_id };
}
