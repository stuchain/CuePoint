/**
 * Where tracks come from on the Prepare page, and where they go (PREP-11).
 *
 * The source panel fills a Set from two places, Suggestions and the library,
 * and both put a track at one place: the **insertion point**. It is the gap
 * after the entry selected, between it and the next, or the end of the Set
 * with nothing selected. A track inserted there joins the chapter of the entry
 * before it, as the engine places an insert (PREP-02), so the chapter a
 * suggestion was narrowed by (DEC-105) is the chapter it lands in.
 *
 * Everything here is pure: the point, its words, the request Suggestions
 * sends for it, what a gap nothing bridges says, and where a track dropped on
 * the Set table goes. The rules (what fits, which chapter reaches a place) are
 * the engine's; this names the place a gesture pointed at, in its terms.
 */
import type {
  SetChapterPlan,
  SetEntry,
  SetKeyRelation,
  SetNoFit,
  SetPlan,
  SetSuggestionSideName,
  SetSuggestions,
  SetSuggestionsRequest,
  SimilarComponent,
} from "../../api/cuepointBridge.types";
import { WHOLE_LIBRARY, parseScope } from "../clean/cleanRules";
import { KEY_WORDS, formatBpm } from "../discover/similarReasons";
import { chapterName, showsHeadings } from "./prepareRows";

// ------------------------------------------------------------ the point

/** A gap in the running order, and where a track inserted there goes. */
export interface InsertionPoint {
  /** The entry before the gap; null only in an empty Set. */
  before: SetEntry | null;
  /** The entry after it; null at the end of the Set. */
  after: SetEntry | null;
  /** The chapter a track inserted here joins. */
  chapter: SetChapterPlan | null;
  /** `insertTrackInCollection`'s place: the position the track will take. */
  position: number;
}

function ordered<T extends { position: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/**
 * The gap after `focusedEntryId`, or at the end of the Set without one.
 *
 * An entry that is not in the Set any more (removed in another window) is no
 * selection, and the point falls back to the end rather than aiming at a gap
 * the engine would refuse as stale.
 */
export function insertionPoint(
  plan: SetPlan,
  entries: readonly SetEntry[],
  focusedEntryId: number | null,
): InsertionPoint {
  const running = ordered(entries);
  const chapters = ordered(plan.chapters);
  const chapterOf = (entry: SetEntry) =>
    chapters.find((chapter) => chapter.id === entry.chapter_id) ?? null;
  if (running.length === 0) {
    return { before: null, after: null, chapter: chapters[0] ?? null, position: 0 };
  }
  const at = focusedEntryId === null ? -1 : running.findIndex((e) => e.entry_id === focusedEntryId);
  const index = at >= 0 ? at : running.length - 1;
  const before = running[index];
  return {
    before,
    after: running[index + 1] ?? null,
    chapter: chapterOf(before),
    position: before.position + 1,
  };
}

/** A stable name for a gap: a list fitted to one gap belongs to that gap. */
export function gapKey(point: InsertionPoint): string {
  return `${point.before?.entry_id ?? "-"}:${point.after?.entry_id ?? "-"}:${point.chapter?.id ?? "-"}`;
}

/** What `insertTrackInCollection` is asked for one track at the point. */
export interface InsertPlace {
  position: number;
  chapter_id: number | null;
}

export function placeOf(point: InsertionPoint): InsertPlace {
  return { position: point.position, chapter_id: point.chapter?.id ?? null };
}

/** The words for a point, its track titles kept apart so a view can mark them. */
export type PointWords =
  | { kind: "empty" }
  | { kind: "between"; before: string; after: string; chapter: string | null }
  | { kind: "end"; before: string; chapter: string | null };

/**
 * How the panel names the point: "Between “A” and “B”, in Peak". The chapter
 * is named only when the Set draws headings: one unnamed chapter is a list
 * (DEC-103), and "in Chapter 1" would name something the table does not show.
 */
export function pointWords(point: InsertionPoint, chapters: readonly SetChapterPlan[]): PointWords {
  if (!point.before) return { kind: "empty" };
  const chapter = point.chapter && showsHeadings(chapters) ? chapterName(point.chapter) : null;
  const before = point.before.track.title;
  if (point.after) return { kind: "between", before, after: point.after.track.title, chapter };
  return { kind: "end", before, chapter };
}

/** The same, as one plain sentence. */
export function pointText(words: PointWords): string {
  const where = (chapter: string | null) => (chapter ? `, in ${chapter}` : "");
  switch (words.kind) {
    case "empty":
      return "At the start of the empty Set";
    case "between":
      return `Between “${words.before}” and “${words.after}”${where(words.chapter)}`;
    case "end":
      return `After “${words.before}”, at the end of the Set${where(words.chapter)}`;
  }
}

/**
 * The panel's first line: "Inserting: between “A” and “B”, in Peak" (PRP-9).
 * It sits above the tabs so the reason Insert is off is on screen.
 */
export function insertingText(words: PointWords): string {
  const text = pointText(words);
  return `Inserting: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

// ------------------------------------------------------------ the pool

/**
 * The pool, as the scope picker's value: `library`, `playlist:12`,
 * `collection:4` or `smart:5` (Clean's scope values, DEC-105's pools).
 */
export type PoolValue = string;

export const WHOLE_LIBRARY_POOL: PoolValue = WHOLE_LIBRARY;

/** The pool as the Library's own query parameters, on the Set route's names. */
export function poolParams(
  pool: PoolValue,
): Pick<SetSuggestionsRequest, "playlist_id" | "scope" | "collection_id"> {
  const scoped = parseScope(pool);
  return {
    playlist_id: scoped.playlistId,
    scope: scoped.scope,
    collection_id: scoped.collectionId,
  };
}

/**
 * A remembered pool that is still somewhere to look, else the library.
 *
 * A Collection deleted since, or a playlist a refresh removed, is not offered
 * by the picker, and a pool the picker cannot show would narrow the panel
 * without saying how.
 */
export function poolOrLibrary(
  pool: PoolValue,
  options: readonly { value: string; disabled?: boolean }[],
): PoolValue {
  return options.some((option) => option.value === pool && !option.disabled) ? pool : WHOLE_LIBRARY_POOL;
}

/** The pool's name for a sentence: the picker's label, without its indent. */
export function poolName(pool: PoolValue, options: readonly { value: string; label: string }[]): string {
  if (pool === WHOLE_LIBRARY_POOL) return "your library";
  const label = options.find((option) => option.value === pool)?.label.trim();
  return label ? `“${label}”` : "this pool";
}

// ------------------------------------------------------------ suggestions

/** How many suggestions the panel asks for: the engine's own default. */
export const SUGGESTION_LIMIT = 50;

/**
 * What Suggestions asks for the point (PREP-04's route).
 *
 * The chapter is named, so the range that narrows the list is the one of the
 * chapter an "Insert here" would put the track in. Null for an empty Set,
 * which has nothing to fit against (DEC-105).
 */
export function suggestionsRequest(
  setId: number,
  point: InsertionPoint,
  pool: PoolValue,
  against: SetSuggestionSideName | null,
): SetSuggestionsRequest | null {
  if (!point.before) return null;
  return {
    set_id: setId,
    before_entry_id: point.before.entry_id,
    after_entry_id: point.after?.entry_id ?? null,
    chapter_id: point.chapter?.id ?? null,
    against,
    limit: SUGGESTION_LIMIT,
    ...poolParams(pool),
  };
}

/** Joins "a", "a or b", "a, b or c". */
function either(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

const COMPONENT_WORDS: Record<SimilarComponent, string> = {
  tempo: "BPM",
  key: "key",
  genre: "genre",
  label: "label",
  artist: "artist",
};

/**
 * What a neighbour could not be compared by, one sentence per side.
 *
 * Only a missing BPM or key is drawn as a note: the tempo is the gate and the
 * key the wheel, so without one the list means something else. A missing
 * genre, label or artist is ordinary in a library and goes in `detail`, the
 * point line's title, rather than a line of the panel's height every time.
 */
export function unusedNotes(
  answer: Pick<SetSuggestions, "unused" | "sides">,
  titles: Partial<Record<SetSuggestionSideName, string>>,
): { notes: string[]; detail: string[] } {
  const notes: string[] = [];
  const detail: string[] = [];
  for (const side of answer.sides) {
    const unused = answer.unused[side] ?? [];
    const title = titles[side] ?? (side === "before" ? "The track before" : "The track after");
    const sentence = (components: SimilarComponent[]) =>
      `“${title}” has no ${either(components.map((c) => COMPONENT_WORDS[c]))} to compare.`;
    const heard = unused.filter((c) => c === "tempo" || c === "key");
    const rest = unused.filter((c) => c !== "tempo" && c !== "key");
    if (heard.length > 0) notes.push(sentence(heard));
    if (rest.length > 0) detail.push(sentence(rest));
  }
  return { notes, detail };
}

/** A key relation in the words the reasons and warnings use. */
export function keyRelationWords(relation: SetKeyRelation | null): string {
  switch (relation) {
    case "same":
      return KEY_WORDS.same;
    case "adjacent":
      return KEY_WORDS.adjacent;
    case "relative":
      return KEY_WORDS.relative;
    default:
      return "Keys clash";
  }
}

/**
 * Why nothing fits a gap, in words (DEC-105): how far apart its neighbours'
 * tempos are, and how their keys relate. It never says the gate was loosened,
 * because it never is.
 */
export function noFitText(noFit: SetNoFit, before: string, after: string): string {
  const { from, to, gap_percent: gap } = noFit.tempo;
  const tempo =
    `Nothing fits between “${before}” (${formatBpm(from)} BPM) and “${after}” ` +
    `(${formatBpm(to)} BPM): they are ${gap}% apart, and no tempo is close to both.`;
  if (!noFit.key) return tempo;
  const { from: a, to: b, relation } = noFit.key;
  return `${tempo} ${keyRelationWords(relation)}: ${a} → ${b}.`;
}

/** The buttons a gap nothing bridges offers: each side's own list. */
export function sideButtonLabel(side: SetSuggestionSideName, title: string): string {
  return side === "before" ? `Fit after “${title}”` : `Fit before “${title}”`;
}

/** What the list is fitted against when it is one side's. */
export function sideOnlyText(side: SetSuggestionSideName, title: string): string {
  return side === "before" ? `Fitting after “${title}” only` : `Fitting before “${title}” only`;
}

/** The chapter's range that narrowed the list, as a note, or null. */
export function rangeNote(answer: Pick<SetSuggestions, "bpm_range">, chapter: SetChapterPlan | null): string | null {
  const range = answer.bpm_range;
  if (!range) return null;
  const name = chapter ? chapterName(chapter) : "this chapter";
  const { min, max } = range;
  const bounds =
    min != null && max != null
      ? `${formatBpm(min)}–${formatBpm(max)} BPM`
      : min != null
        ? `from ${formatBpm(min)} BPM`
        : `up to ${formatBpm(max ?? 0)} BPM`;
  return `Only tracks inside ${name}'s range, ${bounds}.`;
}

/** What an answer with nothing in it says, when it is not a gap nothing bridges. */
export function emptyAnswerText(answer: Pick<SetSuggestions, "bpm_range">, pool: string): string {
  return answer.bpm_range
    ? `Nothing in ${pool} fits here inside the chapter's range.`
    : `Nothing in ${pool} fits here.`;
}

/** A suggestion's fit as the table says it: out of 100, whole (PRP-7). */
export function fitText(score: number): string {
  return `${Math.round(score)}/100`;
}

/** "In this Set" for a suggestion already played, with how often. */
export function inSetText(count: number): string | null {
  if (count <= 0) return null;
  const times = count === 1 ? "once" : count === 2 ? "twice" : `${count.toLocaleString()} times`;
  return `Already in this Set ${times}: inserting it plays it again`;
}

// ------------------------------------------------------------ inserting

/**
 * Whether `count` more entries fit, or the sentence saying why not.
 *
 * A Set holds at most `limit` entries (PREP-02). Checked before the first
 * insert, so a gesture either goes in whole or not at all rather than stopping
 * part-way at the engine's refusal.
 */
export function roomFor(count: number, current: number, limit: number): string | null {
  if (current + count <= limit) return null;
  return (
    `A Set holds at most ${limit.toLocaleString()} entries. This one has ` +
    `${current.toLocaleString()}, so ${count.toLocaleString()} more will not fit.`
  );
}

/**
 * The panel's one action: "Insert here", or "Insert 3 here" for several.
 * With nothing picked it says what to do instead of sitting off (PRP-9).
 */
export function insertLabel(count: number): string {
  if (count <= 0) return "Pick tracks";
  return count > 1 ? `Insert ${count.toLocaleString()} here` : "Insert here";
}

/** What an insert says afterwards: the track by name when it is one, known. */
export function insertedLine(titles: readonly (string | null)[], setName: string): string {
  if (titles.length === 1 && titles[0]) return `Inserted “${titles[0]}” into “${setName}”.`;
  const count = titles.length === 1 ? "1 track" : `${titles.length.toLocaleString()} tracks`;
  return `Inserted ${count} into “${setName}”.`;
}
