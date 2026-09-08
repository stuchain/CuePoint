/**
 * What the Inspector's editable zone says, as pure functions (ORG-10).
 *
 * DEC-057 stores two ratings and resolves them at read time, and the panel's
 * whole job is to make that legible: which layer is showing, what is
 * underneath it, and what clearing would fall back to. Those sentences are
 * here rather than inside the component because they are the step's actual
 * content — a label that says "Yours" over a value that came from Rekordbox is
 * the bug this file exists to make testable.
 *
 * The resolution itself mirrors `models/track_metadata.py`. It is deliberately
 * a *mirror* and not a second opinion: the engine's answer is what the panel
 * renders, and this recomputes it only for the moment between a click and the
 * response, so the stars do not wait for a round trip to move.
 */
import type { TrackFieldChange, TrackMetadata } from "../../api/cuepointBridge.types";
import { starsFor } from "./filterText";
import { formatWhen } from "./libraryFormat";

/** Five stars, the same scale the import converted Rekordbox's encoding to. */
export const RATING_STARS = 5;

/**
 * How long typing settles before a note is sent.
 *
 * Long enough that a sentence is one request rather than forty; short enough
 * that clicking away and back does not race it. The flush on track change is
 * what actually guarantees nothing is lost — this only decides how often the
 * common case writes.
 */
export const NOTES_DEBOUNCE_MS = 600;

/** The engine's limit (`MAX_NOTES_LENGTH`), so the field refuses before it does. */
export const NOTES_MAX_LENGTH = 10_000;

/** The engine's limit (`MAX_TAG_NAME_LENGTH`). */
export const TAG_NAME_MAX_LENGTH = 60;

/** How much of a value a history line shows before it is cut. */
const VALUE_LIMIT = 48;

/** The two layers a rating is resolved from — the part of the record that matters here. */
export type RatingLayers = Pick<TrackMetadata, "rating" | "rekordbox_rating">;

/**
 * Stars, or the words for the two things stars cannot draw.
 *
 * `starsFor` answers "unrated" for zero, which is right in a filter chip and
 * wrong in the middle of a sentence about what is underneath a rating.
 */
export function ratingText(value: number | null | undefined): string {
  if (value == null) return "—";
  return value === 0 ? "zero stars" : starsFor(value);
}

/**
 * Which of DEC-057's two layers the stars are showing, in words.
 *
 * Four combinations and four different sentences. The one that earns the
 * file is the first: a CuePoint rating over a Rekordbox one has to say what it
 * is covering, or "clear" is a button whose result cannot be predicted.
 */
export function describeRatingSource(metadata: RatingLayers): string {
  const yours = metadata.rating;
  const theirs = metadata.rekordbox_rating;
  if (yours != null && theirs != null) {
    return `Yours — Rekordbox's is ${ratingText(theirs)}`;
  }
  if (yours != null) return "Yours — Rekordbox never rated it";
  if (theirs != null) return "Rekordbox's";
  return "Not rated";
}

/**
 * What the clear control should say, or null when there is nothing to clear.
 *
 * "Clear override" only when there is something underneath to fall back to;
 * otherwise it is simply a clear, and calling it an override would name a
 * layer that is not there.
 */
export function clearRatingLabel(metadata: RatingLayers): string | null {
  if (metadata.rating == null) return null;
  return metadata.rekordbox_rating == null ? "Clear rating" : "Clear override";
}

/**
 * What clicking a star means.
 *
 * The comparison is against *your* rating, not the effective one. With
 * Rekordbox's four stars showing and no override, clicking the fourth star
 * writes your own four — which looks like nothing happened until you read the
 * line underneath, and is exactly right: you have said this is a four, and it
 * stays a four when the next refresh changes Rekordbox's mind.
 */
export function nextRating(yours: number | null, clicked: number): number | null {
  return yours === clicked ? null : clicked;
}

/** "1 star", "4 stars" — the accessible name of one radio in the group. */
export function starLabel(count: number): string {
  return `${count} ${count === 1 ? "star" : "stars"}`;
}

/**
 * The record as it would read with a different CuePoint rating.
 *
 * Mirrors `effective_rating` and `rating_source`. Used for the moment between
 * the click and the engine's answer, which then replaces it.
 */
export function withRating(metadata: TrackMetadata, rating: number | null): TrackMetadata {
  return {
    ...metadata,
    rating,
    effective_rating: rating ?? metadata.rekordbox_rating,
    rating_source:
      rating != null ? "cuepoint" : metadata.rekordbox_rating != null ? "rekordbox" : null,
  };
}

/** A note as the engine stores it: trimmed, and empty is nothing at all. */
export function normalizeNotes(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** How the notes field describes itself while it saves. */
export type NotesState = "idle" | "saving" | "saved";

/** Who made a change, as `track_history.source` records it. */
export function historySourceLabel(source: string): string {
  if (source === "cuepoint") return "You";
  if (source === "rekordbox") return "Rekordbox";
  if (source === "beatport") return "Beatport";
  return source;
}

/**
 * Field names as a person reads them.
 *
 * `cuepoint_rating` is deliberately not "Rating": the history's whole value is
 * being able to tell your rating from the one an import changed, and two rows
 * both labelled "Rating" would destroy that at exactly the moment it matters.
 */
const FIELD_LABELS: Record<string, string> = {
  cuepoint_rating: "Your rating",
  favorite: "Favorite",
  notes: "Your notes",
  tag: "Tag",
  title: "Title",
  artist: "Artist",
  remixer: "Remixer",
  album: "Album",
  label: "Label",
  genre: "Genre",
  key: "Key",
  bpm: "BPM",
  year: "Year",
  duration_seconds: "Length",
  rating: "Rekordbox rating",
  comment: "Rekordbox comment",
};

/** One entry of the History section, ready to render. */
export interface HistoryLine {
  /** What changed, in words. */
  title: string;
  /** The value before, when showing it adds anything the title does not say. */
  from: string | null;
  /** The value after. */
  to: string | null;
  /** Who did it. */
  who: string;
  /** True when it was the user rather than an import — the panel marks these. */
  mine: boolean;
  /** When, in the reader's own locale. */
  when: string;
}

function truncate(text: string): string {
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT - 1)}…` : text;
}

/** One history value as text: absent is an em dash, never an empty gap. */
function valueText(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "cuepoint_rating" || field === "rating") {
    return typeof value === "number" ? ratingText(value) : truncate(String(value));
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return truncate(String(value));
}

/**
 * One row of a track's history as a line the panel can draw.
 *
 * Tags and favorites become sentences rather than a from/to pair, because
 * `null → "Peak-time"` is a diff and "Tagged Peak-time" is what happened.
 */
export function historyLine(change: TrackFieldChange): HistoryLine {
  const who = historySourceLabel(change.source);
  const mine = change.source === "cuepoint";
  const when = formatWhen(change.changed_at);
  const base = { who, mine, when };

  if (change.field === "tag") {
    const added = change.new_value != null;
    const name = String(added ? change.new_value : change.old_value);
    return { ...base, title: added ? `Tagged ${name}` : `Untagged ${name}`, from: null, to: null };
  }

  if (change.field === "favorite") {
    return {
      ...base,
      title: change.new_value === true ? "Favorited" : "Unfavorited",
      from: null,
      to: null,
    };
  }

  return {
    ...base,
    title: FIELD_LABELS[change.field] ?? change.field,
    from: valueText(change.field, change.old_value),
    to: valueText(change.field, change.new_value),
  };
}
