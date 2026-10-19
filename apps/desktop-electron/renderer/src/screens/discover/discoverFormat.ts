/**
 * The sentences the Discover page shows (DISCOVER-10).
 *
 * Pure functions, as the Library's and Clean's wording is: what a search looked
 * for, how it ended and what it found is what a person decides from, and it
 * deserves tests that read like the sentences. "Run" is the engine's word for a
 * search and appears in no sentence here (DSC-2).
 */
import type {
  BeatportErrorClass,
  BeatportPlaylistResult,
  BeatportResolveResult,
  BeatportTrackRow,
  DiscoverGenre,
  DiscoverRefusal,
  DiscoverRun,
  DiscoverRunScope,
  DiscoverRunSource,
  DiscoveryRunResult,
} from "../../api/cuepointBridge.types";
import { formatDay, formatDayTime, formatRange } from "../../format/dates";
import { formatCount, pluralize } from "../library/libraryFormat";

/**
 * A calendar day the engine wrote as "2026-09-01". Read as that day on this computer, not as
 * midnight UTC, which is the evening before west of Greenwich.
 */
function calendarDay(value: string | null | undefined): Date | string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : value;
}

/** A release date or a chart's day: "Sep 1", "Sep 1, 2025"; empty when there is none. */
export function formatIsoDay(value: string | null | undefined): string {
  return formatDay(calendarDay(value));
}

/** Two days as the app writes a range: "Sep 1 – Sep 26". */
export function formatIsoRange(from: string, to: string): string {
  return formatRange(calendarDay(from), calendarDay(to));
}

/** A moment as the app writes it everywhere: "Oct 15, 5:35 PM" on the computer's clock. */
export function formatWhen(value: string | null | undefined): string {
  return formatDayTime(value);
}

/** What stopped a run or a push, in the words that finish "…because". */
const STOPPED_BECAUSE: Record<BeatportErrorClass, string> = {
  no_token: "you are not signed in to Beatport",
  rejected: "Beatport refused the sign-in",
  forbidden: "Beatport refused the sign-in for this",
  rate_limited: "Beatport limited the requests",
  unavailable: "Beatport could not be reached",
};

export function stoppedBecause(errorClass: BeatportErrorClass | null): string {
  return errorClass ? STOPPED_BECAUSE[errorClass] : "of an error";
}

/** A past search's title: "Dig of Sep 27, 9:14 AM" (DSC-2). */
export function searchTitle(startedAt: string): string {
  return `Dig of ${formatWhen(startedAt)}`;
}

/** A search's state, as its badge says it. */
export function runStateLabel(run: DiscoverRun): string {
  if (run.running) return "Running";
  switch (run.outcome) {
    case "succeeded":
      return "Finished";
    case "cancelled":
      return "Stopped";
    case "failed":
      // A dig that fails keeps what it found, so it reads as stopped partway.
      return "Stopped";
    default:
      return "Ended";
  }
}

/** The badge's tone, from the run's state. */
export function runStateTone(run: DiscoverRun): "info" | "success" | "warning" | "error" {
  if (run.running) return "info";
  if (run.outcome === "succeeded") return "success";
  if (run.outcome === "cancelled" || run.outcome === "failed") return "warning";
  return "error";
}

/** Why Continue is off while another dig runs. */
export const CONTINUE_BUSY = "Another dig is running.";

/** A dig that stopped partway can be continued: the user's Stop, or Beatport's trouble. */
export function canContinueRun(run: Pick<DiscoverRun, "running" | "outcome">): boolean {
  return !run.running && (run.outcome === "cancelled" || run.outcome === "failed");
}

/** The text the engine gives a dig the app's closing left open. */
const INTERRUPTED_ERROR = "CuePoint stopped before the run finished";

/** What stopped a failed dig, in the words that finish "Stopped because…". */
function failedBecause(run: Pick<DiscoverRun, "error" | "error_class">): string {
  if (run.error_class) return stoppedBecause(run.error_class);
  return run.error === INTERRUPTED_ERROR ? "CuePoint was closed" : "of an error";
}

/** Why a dig stopped partway, for its card: "Stopped because Beatport could not be reached." */
export function runStopLine(run: Pick<DiscoverRun, "outcome" | "error" | "error_class">): string {
  if (run.outcome === "cancelled") return "Stopped when asked.";
  return `Stopped because ${failedBecause(run)}.`;
}

/** "146 tracks from 3 charts and 12 releases". */
export function runFound(
  run: Pick<DiscoverRun, "tracks_found" | "charts_read" | "releases_read">,
): string {
  return (
    `${pluralize(run.tracks_found, "track")} from ` +
    `${pluralize(run.charts_read, "chart")} and ${pluralize(run.releases_read, "release")}`
  );
}

/** How a run ended, as one sentence, or what it is doing while it runs. */
export function runOutcome(run: DiscoverRun): string {
  if (run.running) return `Running: ${runFound(run)} so far.`;
  if (run.outcome === "succeeded") return `Found ${runFound(run)}.`;
  if (run.outcome === "cancelled") return `Stopped when asked, after ${runFound(run)}.`;
  return `Stopped because ${failedBecause(run)}, after ${runFound(run)}.`;
}

/** Genre names for ids, in the run's order; an id the list lacks shows as one. */
function genreNames(ids: readonly number[], genres: readonly DiscoverGenre[]): string[] {
  const byId = new Map(genres.map((genre) => [genre.id, genre.name]));
  return ids.map((id) => byId.get(id) ?? `Genre ${id}`);
}

/**
 * An artist or label scope, as a run recorded it.
 *
 * `picked` null is the whole library; an empty list is none at all, which a
 * run can be asked for (charts only, or releases only).
 */
export function scopeLine(scope: DiscoverRunScope, one: string, many: string): string {
  if (scope.picked === null) return `every ${one} in your library (${formatCount(scope.count)})`;
  if (scope.picked.length === 0) return `no ${many}`;
  return pluralize(scope.picked.length, one, many);
}

/** "Charts from 2026-08-27 to 2026-09-26 in House, Techno". */
export function chartsLine(run: DiscoverRun, genres: readonly DiscoverGenre[]): string {
  const { genre_ids: ids, charts_from: from, charts_to: to } = run.params;
  if (ids.length === 0) return "No charts: no genre was chosen";
  const window = from && to ? ` from ${formatIsoRange(from, to)}` : "";
  return `Charts${window} in ${genreNames(ids, genres).join(", ")}`;
}

/** "Releases from the last 30 days". */
export function releasesLine(run: DiscoverRun): string {
  const { new_releases_days: days, releases_from: from, releases_to: to } = run.params;
  if (from && to) return `Releases from ${formatIsoRange(from, to)}`;
  if (days != null) return `Releases from the last ${pluralize(days, "day")}`;
  return "Releases";
}

/**
 * One short line for an open search's header: "House · last 30 days · 67 artists · 28 labels".
 * Parts that are empty are left out; the full wording is `chartsLine` and its siblings.
 */
export function runScopeLine(run: DiscoverRun, genres: readonly DiscoverGenre[]): string {
  const { genre_ids: ids, new_releases_days: days, releases_from: from, releases_to: to } = run.params;
  const count = (scope: DiscoverRunScope, one: string) => {
    const n = scope.picked === null ? scope.count : scope.picked.length;
    return n > 0 ? pluralize(n, one) : null;
  };
  const parts = [
    ids.length > 0 ? genreNames(ids, genres).join(", ") : null,
    from && to ? formatIsoRange(from, to) : days != null ? `last ${pluralize(days, "day")}` : null,
    count(run.params.artists, "artist"),
    count(run.params.labels, "label"),
  ];
  return parts.filter((part): part is string => part !== null).join(" · ") || "What it looked for";
}

/** What a search's end says, from the run it kept. */
export function discoveryEnded(result: DiscoveryRunResult): string {
  const found = runFound(result);
  if (result.outcome === "succeeded") return `The dig found ${found}.`;
  if (result.outcome === "cancelled") return `The dig stopped when asked, after ${found}.`;
  return `The dig stopped because ${stoppedBecause(result.error_class)}, after ${found}.`;
}

/** One line for the run list: what the run looked for, briefly. */
export function runSummary(run: DiscoverRun, genres: readonly DiscoverGenre[]): string {
  const parts = [
    run.params.genre_ids.length > 0
      ? genreNames(run.params.genre_ids, genres).join(", ")
      : "No charts",
    releasesLine(run),
  ];
  return parts.join(" · ");
}

/** A track's name as Beatport shows it: the title and its mix. */
export function trackName(row: Pick<BeatportTrackRow, "title" | "mix_name">): string {
  return row.mix_name ? `${row.title} (${row.mix_name})` : row.title;
}

/** Credited artists, then remixers, as Beatport lists them. */
export function artistsText(row: Pick<BeatportTrackRow, "artists" | "remixers">): string {
  const artists = row.artists.join(", ");
  if (row.remixers.length === 0) return artists;
  return `${artists} (remixed by ${row.remixers.join(", ")})`;
}

/**
 * Why a search found a track (DSC-8): "On a chart by {artist}: “{chart}”", "New
 * on {label}: “{release}”" or "New from {artist}: “{release}”", so the first
 * name is never a guess. A general genre chart nobody is named for (the engine
 * then names the chart itself) reads "On the chart “{chart}”".
 */
export function sourceText(source: DiscoverRunSource): string {
  const name = source.source_name ? `“${source.source_name}”` : null;
  if (
    source.source_type === "chart" &&
    name &&
    (!source.matched_on || source.matched_on === source.source_name)
  ) {
    return `On the chart ${name}`;
  }
  const lead =
    source.source_type === "chart"
      ? `On a chart by ${source.matched_on}`
      : source.source_type === "artist_release"
        ? `New from ${source.matched_on}`
        : `New on ${source.matched_on}`;
  return name ? `${lead}: ${name}` : lead;
}

/** Every reason, in the engine's order, for the "Why it's here" column. */
export function sourcesText(sources: readonly DiscoverRunSource[]): string {
  return sources.map(sourceText).join("; ");
}

/**
 * The one count line over a table (DSC-6, DEC-092): "40 found · 12 already in
 * your library (hidden)". Said once, so the number hidden is never a second line.
 */
export function foundLine(found: number, inLibrary: number, hiding: boolean): string {
  const count = `${formatCount(found)} found`;
  if (inLibrary <= 0) return count;
  return `${count} · ${formatCount(inLibrary)} already in your library${hiding ? " (hidden)" : ""}`;
}

/** What making a playlist did, for the page's notice (DSC-7). */
export function pushOutcome(result: BeatportPlaylistResult): string {
  const name = `“${result.name}”`;
  const skipped =
    result.skipped_owned > 0
      ? ` ${pluralize(result.skipped_owned, "track")} already in your library ${result.skipped_owned === 1 ? "was" : "were"} left out.`
      : "";
  const held =
    result.already_in_playlist > 0
      ? ` ${pluralize(result.already_in_playlist, "track")} already in the playlist ${result.already_in_playlist === 1 ? "was" : "were"} left out.`
      : "";
  const failed =
    result.failed > 0
      ? ` ${pluralize(result.failed, "track")} could not be added.`
      : "";
  if (result.outcome === "succeeded") {
    return result.existing_playlist
      ? `Added ${pluralize(result.added, "track")} to ${name} on Beatport.${skipped}${held}${failed}`
      : `Made ${name} on Beatport with ${pluralize(result.added, "track")}.${skipped}${failed}`;
  }
  const before = result.playlist_id
    ? `after adding ${pluralize(result.added, "track")} to ${name}`
    : `before ${name} was made`;
  if (result.outcome === "cancelled" || result.cancelled) {
    return `Making the playlist stopped when asked, ${before}.${skipped}`;
  }
  return `Making the playlist stopped because ${stoppedBecause(result.error_class)}, ${before}.${skipped}${failed}`;
}

/** What a lookup of tracks on Beatport did, for the page's notice (DSC-4). */
export function resolveOutcome(result: BeatportResolveResult): string {
  const read = `Looked up ${pluralize(result.resolved, "track")} on Beatport`;
  const missing =
    result.not_found > 0 ? `; Beatport no longer has ${formatCount(result.not_found)}` : "";
  if (result.outcome === "succeeded") return `${read}${missing}.`;
  if (result.outcome === "cancelled" || result.cancelled) return `Stopped when asked. ${read}${missing}.`;
  return `Stopped because ${stoppedBecause(result.error_class)}. ${read}${missing}.`;
}

/** What each Discover job is, for a sentence saying one is already running. */
const RUNNING_ALREADY: Record<string, string> = {
  discovery: "A dig is already running. It is in the Results tab.",
  beatport_playlist: "A Beatport playlist is already being made. Try again when it has finished.",
  beatport_resolve: "Tracks are already being looked up on Beatport.",
};

/**
 * A refusal, as the page shows it.
 *
 * The engine's own sentence, except for a busy job: its message names the job
 * by type and id, which is for a log rather than a person.
 */
export function refusalText(refusal: DiscoverRefusal): string {
  if (refusal.code === "DISCOVER_BUSY") {
    return (
      (refusal.job_type && RUNNING_ALREADY[refusal.job_type]) ??
      "Another Discover task is running. Try again when it has finished."
    );
  }
  return refusal.message;
}

/** The lookup prompt's sentence, for `toRead` tracks (DSC-4). */
export function resolvePrompt(toRead: number): string {
  return `${formatCount(toRead)} ${toRead === 1 ? "track needs" : "tracks need"} artist info`;
}

/** What the prompt says while the lookup works (DSC-12). */
export function lookingUpLine(toRead: number): string {
  // The count was read before the lookup began; once it has caught up it is 0.
  if (toRead <= 0) return "Looking up tracks…";
  return `Looking up ${formatCount(toRead)}…`;
}

/**
 * The facts line under the page title: what a dig can look through, from the library. Without
 * artists or labels it says why a dig has nothing to look by.
 */
export function discoverFacts(
  options: { artists: { total_values: number }; labels: { total_values: number } },
): string {
  const artists = options.artists.total_values;
  const labels = options.labels.total_values;
  if (artists === 0 && labels === 0) return "No artists or labels in your library yet";
  return `${pluralize(artists, "artist")} and ${pluralize(labels, "label")} in your library to dig by`;
}
