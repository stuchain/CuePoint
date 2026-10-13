/**
 * What a track and the candidate beside it say, field by field (C14).
 *
 * One at a time draws a card for each side; the Table draws the same facts as
 * "before → after" cells. Both read the rows built here, so a value is called
 * one thing wherever it is seen, and what Correct will copy (`correctPlan`) is
 * decided in one place and tested without rendering.
 *
 * Whether a value *differs* is the engine's answer where it gave one
 * (`MatchCandidate.differs`: the same key in two notations is not a
 * difference). A Table row carries no such answer, so there a value differs
 * when it is not the same text.
 *
 * **The key is not "applied"** (DEC-201, DEC-202): accepting a match already
 * makes Beatport's key the track's shown key, unless the track has a key of the
 * user's own. Only then is there something to tick: replacing it.
 */
import type {
  CorrectField,
  LibraryTrackRow,
  MatchCandidate,
} from "../../../api/cuepointBridge.types";
import { camelotOf as parseCamelot } from "../../../components/wheel/keyColour";
import { effective, formatBpm, formatDuration } from "../../library/trackValues";

/** A field a card names: the four Correct copies, and the key it may replace. */
export type CardField = CorrectField | "key";

/** The fields in the order a DJ reads them. */
export const CARD_FIELDS: readonly CardField[] = ["key", "bpm", "genre", "label", "year"];

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  key: "Key",
  bpm: "BPM",
  genre: "Genre",
  label: "Label",
  year: "Year",
};

/**
 * - `same`: both sides say it, and agree.
 * - `changes`: Correct would copy it.
 * - `none`: Beatport has nothing for it.
 * - `comes-with-correct`: the key, which Correct gives without a tick.
 * - `replaces-yours`: the key, where Beatport's would replace one the user typed.
 */
export type CardStatus = "same" | "changes" | "none" | "comes-with-correct" | "replaces-yours";

export interface CardRow {
  id: CardField;
  label: string;
  /** The track's value now; null when it has none. */
  yours: string | null;
  /** The candidate's value; null when it has none. */
  theirs: string | null;
  status: CardStatus;
  /** Whether a tick is offered for it. */
  tickable: boolean;
}

/**
 * A key as Camelot, the way the app shows keys: "A Minor" is 8A. Anything that
 * is not a key this knows is returned as it came, so a value is never hidden
 * because its notation is unfamiliar.
 */
export function camelotOf(key: string | null | undefined): string | null {
  const text = (key ?? "").trim();
  if (text === "") return null;
  return parseCamelot(text) ?? text;
}

function text(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const shown = String(value).trim();
  return shown === "" ? null : shown;
}

function sameText(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
}

/** The track's own values, as the Library shows them. */
export function yoursOf(row: LibraryTrackRow): Record<CardField, string | null> {
  return {
    key: text(row.effective_key),
    bpm: text(formatBpm(effective(row.effective_bpm, row.bpm))),
    genre: text(effective(row.effective_genre, row.genre)),
    label: text(effective(row.effective_label, row.label)),
    year: text(effective(row.effective_year, row.year)),
  };
}

/** The candidate's values, the key in Camelot. */
export function theirsOf(candidate: MatchCandidate): Record<CardField, string | null> {
  return {
    key: camelotOf(candidate.key),
    bpm: text(formatBpm(candidate.bpm)),
    genre: text(candidate.genre),
    label: text(candidate.label),
    year: text(candidate.release_year),
  };
}

/** The rows of the two cards for a track and the candidate chosen for it. */
export function cardRows(row: LibraryTrackRow, candidate: MatchCandidate | null): CardRow[] {
  const yours = yoursOf(row);
  const theirs = candidate ? theirsOf(candidate) : null;
  return CARD_FIELDS.map((id): CardRow => {
    const mine = yours[id];
    const theirValue = theirs?.[id] ?? null;
    const base = { id, label: CARD_FIELD_LABELS[id], yours: mine, theirs: theirValue };
    if (theirValue === null) return { ...base, status: "none", tickable: false };

    if (id === "key") {
      if (sameText(mine, theirValue)) return { ...base, status: "same", tickable: false };
      return row.key_source === "yours"
        ? { ...base, status: "replaces-yours", tickable: true }
        : { ...base, status: "comes-with-correct", tickable: false };
    }

    const engine = candidate?.differs?.[id] ?? null;
    const differs = engine !== null ? engine : mine === null || !sameText(mine, theirValue);
    return differs
      ? { ...base, status: "changes", tickable: true }
      : { ...base, status: "same", tickable: false };
  });
}

/** What Correct will send: the ticked fields that would change, and whether the key is replaced. */
export interface CorrectPlan {
  fields: CorrectField[];
  replaceKey: boolean;
}

export function correctPlan(ticks: ReadonlySet<CardField>, rows: readonly CardRow[]): CorrectPlan {
  const fields: CorrectField[] = [];
  let replaceKey = false;
  for (const entry of rows) {
    if (!entry.tickable || !ticks.has(entry.id)) continue;
    if (entry.id === "key") replaceKey = true;
    else fields.push(entry.id);
  }
  return { fields, replaceKey };
}

/** The fields a tick bar offers: the ones Correct could change. */
export function tickableRows(rows: readonly CardRow[]): CardRow[] {
  return rows.filter((entry) => entry.tickable);
}

/** The tracks' own length, which only the track's card has. */
export function lengthOf(row: LibraryTrackRow): string | null {
  return text(formatDuration(row.duration_seconds));
}

/** One cell of the Table: the value now and the proposal's, with whether Correct would change it. */
export interface ProposalCell {
  before: string | null;
  after: string | null;
  changes: boolean;
}

/**
 * A Table row's cells, read from the row and its `match_proposal`; null when
 * the row has no proposal. The key changes only where the user's own would be
 * replaced; otherwise it simply comes with Correct.
 */
export function proposalCells(row: LibraryTrackRow): Record<CardField, ProposalCell> | null {
  const proposal = row.match_proposal;
  if (!proposal) return null;
  const yours = yoursOf(row);
  const after: Record<CardField, string | null> = {
    key: camelotOf(proposal.key),
    bpm: text(formatBpm(proposal.bpm)),
    genre: text(proposal.genre),
    label: text(proposal.label),
    year: text(proposal.year),
  };
  const cells = {} as Record<CardField, ProposalCell>;
  for (const id of CARD_FIELDS) {
    const before = yours[id];
    const next = after[id];
    const differs = next !== null && !sameText(before, next);
    cells[id] = {
      before,
      after: next,
      changes: id === "key" ? differs && row.key_source === "yours" : differs,
    };
  }
  return cells;
}

/** What a Table row without a proposal says in place of its values. */
export function noProposalLine(row: LibraryTrackRow): string {
  switch (row.match_state) {
    case "needs_review":
      return "Several possible matches · choose in One at a time";
    case "no_match":
      return "Beatport found nothing";
    case "rejected":
      return "You said not this track";
    case "not_matched":
      return "Not looked up yet";
    default:
      return "No match to take";
  }
}
