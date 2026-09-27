/**
 * What an Artist or Label page says (DISCOVER-11, DEC-094, DEC-095).
 *
 * Every sentence the two pages and Similar tracks show, from the engine's
 * answers and nothing else, so each can be tested without drawing a page.
 */
import type {
  DiscoverFacet,
  EntityBeatportHalf,
  EntityKind,
  EntityPage,
  EntityYears,
  LibraryTrackRow,
  SimilarTracks,
} from "../../api/cuepointBridge.types";
import { formatCount, pluralize } from "../library/libraryFormat";
import { beatportNotice } from "./beatportState";

/** "artist" or "label", for sentences. */
export function nounOf(kind: EntityKind): string {
  return kind === "label" ? "label" : "artist";
}

/** "Artist" or "Label", for a heading. */
export function kindTitle(kind: EntityKind): string {
  return kind === "label" ? "Label" : "Artist";
}

/**
 * Which identity the page is (DEC-095): an id, or a group of tracks by name.
 * The page always says which, because a name can be two people.
 */
export function identityLabel(page: Pick<EntityPage, "kind" | "identity">): string {
  return page.identity === "beatport" ? `Beatport ${nounOf(page.kind)}` : "Grouped by name";
}

/** What the identity means, in a sentence. */
export function identityHint(page: Pick<EntityPage, "kind" | "identity" | "names">): string {
  const noun = nounOf(page.kind);
  if (page.identity === "name") {
    return (
      `These are your tracks whose ${page.kind === "label" ? "label spells" : "credits spell"} this ` +
      `name, whatever the case or accents. CuePoint does not know this ${noun}'s Beatport id yet.`
    );
  }
  const spellings = page.names.map((entry) => entry.name);
  if (spellings.length === 0) {
    return `Known by its Beatport id, from your tracks matched on Beatport.`;
  }
  return (
    `Known by its Beatport id, from your tracks matched on Beatport. It includes your other ` +
    `tracks credited as ${spellings.join(", ")}.`
  );
}

/** What to call a page, when neither Beatport nor the library spells it. */
export function pageTitle(page: Pick<EntityPage, "kind" | "name" | "name_key" | "beatport_id">): string {
  if (page.name) return page.name;
  if (page.beatport_id !== null) return `Beatport ${nounOf(page.kind)} ${page.beatport_id}`;
  return page.name_key ?? "";
}

/** "2014–2024", "2019", or null when no track has a year. */
export function yearsText(years: EntityYears): string | null {
  const { first, last } = years;
  if (first === null && last === null) return null;
  if (first === null || last === null || first === last) return String(first ?? last);
  return `${first}–${last}`;
}

/** "12 tracks in your library". */
export function tracksLine(tracks: number): string {
  return `${pluralize(tracks, "track")} in your library`;
}

/** The header's facet of the related kind: an artist's labels, a label's artists. */
export function relatedTitle(kind: EntityKind): string {
  return kind === "label" ? "Artists" : "Labels";
}

/** The kind a related value's page is: an artist's labels are labels. */
export function relatedKind(kind: EntityKind): EntityKind {
  return kind === "label" ? "artist" : "label";
}

/** "House (3)", as a facet value reads in a list. */
export function facetValueText(value: DiscoverFacet["values"][number]): string {
  return `${value.value} (${formatCount(value.count)})`;
}

/** Said when the name index is still being built (DISCOVER-03). */
export const INDEX_BUILDING =
  "CuePoint is still indexing artist and label names, so this page may be missing some of " +
  "your tracks until it finishes.";

/** Said above the Beatport half when a page was opened by a name now known by id. */
export function redirectedLine(kind: EntityKind): string {
  return `Opened by name. CuePoint has since found this ${nounOf(kind)} on Beatport, so the page is its Beatport ${nounOf(kind)}.`;
}

/** The headline over a Beatport half that has no tracks to show. */
export function beatportHeadline(half: Pick<EntityBeatportHalf, "state" | "reason" | "kind">): string {
  if (half.state === "name_only") {
    if (half.reason === "shared") return `Several Beatport ${nounOf(half.kind)}s share this name`;
    if (half.reason === "not_on_beatport") return `Not found on Beatport`;
    return "Known by name only";
  }
  if (half.state === "ok") return "On Beatport";
  return beatportNotice(half.state)?.headline ?? "Beatport could not answer";
}

/** "Read from Beatport" or "From CuePoint's copy", with when. */
export function freshnessLine(half: Pick<EntityBeatportHalf, "from_cache" | "fetched_at">): string | null {
  if (!half.fetched_at) return null;
  return half.from_cache ? "From CuePoint's copy of Beatport's listing." : "Just read from Beatport.";
}

/** A seed's header facts: "128.0 BPM · 8A · House". */
export function seedFacts(
  track: Pick<
    LibraryTrackRow,
    "bpm" | "key" | "genre" | "effective_bpm" | "effective_key" | "effective_genre"
  >,
): string {
  const bpm = track.effective_bpm ?? track.bpm;
  const key = track.effective_key ?? track.key;
  const genre = track.effective_genre ?? track.genre;
  return [bpm == null ? null : `${bpm.toFixed(1)} BPM`, key || null, genre || null]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** What a suggestion list was compared against, in a sentence. */
export function consideredLine(answer: Pick<SimilarTracks, "considered" | "duplicates_excluded">): string {
  const compared = `Compared with ${pluralize(answer.considered, "track")} in your library.`;
  if (answer.duplicates_excluded === 0) return compared;
  return `${compared} ${pluralize(answer.duplicates_excluded, "copy", "copies")} of this track left out.`;
}

/** Said when shared artists may be missing because the index is still building. */
export const SIMILAR_INDEX_BUILDING =
  "CuePoint is still indexing artist names, so shared artists may be missing from these reasons.";
