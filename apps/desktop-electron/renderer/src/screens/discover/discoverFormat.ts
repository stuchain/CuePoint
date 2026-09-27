/**
 * The sentences the Discover page shows (DISCOVER-10).
 *
 * Pure functions, as the Library's and Clean's wording is: what a run looked
 * for, how it ended and what it found is what a person decides from, and it
 * deserves tests that read like the sentences.
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
import { formatCount, formatWhen, pluralize } from "../library/libraryFormat";

export { formatWhen };

/** What stopped a run or a push, in the words that finish "…because". */
const STOPPED_BECAUSE: Record<BeatportErrorClass, string> = {
  no_token: "no Beatport token is set",
  rejected: "Beatport rejected the token",
  forbidden: "Beatport refused the token for this",
  rate_limited: "Beatport limited the requests",
  unavailable: "Beatport could not be reached",
};

export function stoppedBecause(errorClass: BeatportErrorClass | null): string {
  return errorClass ? STOPPED_BECAUSE[errorClass] : "of an error";
}

/** A run's state, as its badge says it. */
export function runStateLabel(run: DiscoverRun): string {
  if (run.running) return "Running";
  switch (run.outcome) {
    case "succeeded":
      return "Finished";
    case "cancelled":
      return "Stopped";
    case "failed":
      return "Failed";
    default:
      return "Ended";
  }
}

/** The badge's tone, from the run's state. */
export function runStateTone(run: DiscoverRun): "info" | "success" | "warning" | "error" {
  if (run.running) return "info";
  if (run.outcome === "succeeded") return "success";
  if (run.outcome === "cancelled") return "warning";
  return "error";
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
  const reason = run.error_class ? stoppedBecause(run.error_class) : "of an error";
  return `Stopped because ${reason}, after ${runFound(run)}.`;
}

/** Genre names for ids, in the run's order; an id the list lacks shows as one. */
export function genreNames(ids: readonly number[], genres: readonly DiscoverGenre[]): string[] {
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
  const window = from && to ? ` from ${from} to ${to}` : "";
  return `Charts${window} in ${genreNames(ids, genres).join(", ")}`;
}

/** "Releases from the last 30 days". */
export function releasesLine(run: DiscoverRun): string {
  const { new_releases_days: days, releases_from: from, releases_to: to } = run.params;
  if (from && to) return `Releases from ${from} to ${to}`;
  if (days != null) return `Releases from the last ${pluralize(days, "day")}`;
  return "Releases";
}

/** What a discovery job's end says, from the run it kept. */
export function discoveryEnded(result: DiscoveryRunResult): string {
  const found = runFound(result);
  if (result.outcome === "succeeded") return `Discovery found ${found}.`;
  if (result.outcome === "cancelled") return `Discovery stopped when asked, after ${found}.`;
  return `Discovery stopped because ${stoppedBecause(result.error_class)}, after ${found}.`;
}

/** One line for the run list: what the run looked for, briefly. */
export function runSummary(run: DiscoverRun, genres: readonly DiscoverGenre[]): string {
  const parts = [
    run.params.genre_ids.length > 0
      ? genreNames(run.params.genre_ids, genres).join(", ")
      : "No charts",
    run.params.new_releases_days != null
      ? `${formatCount(run.params.new_releases_days)} days of releases`
      : "Releases",
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

/** Why a run found a track: a chart and whose, or a label's release. */
export function sourceText(source: DiscoverRunSource): string {
  const name = source.source_name ? `“${source.source_name}”` : null;
  if (source.source_type === "chart") {
    return name ? `Chart ${name} by ${source.matched_on}` : `A chart by ${source.matched_on}`;
  }
  return name ? `${source.matched_on}: ${name}` : `New on ${source.matched_on}`;
}

/** Every reason, in the engine's order, for the Sources column. */
export function sourcesText(sources: readonly DiscoverRunSource[]): string {
  return sources.map(sourceText).join("; ");
}

/** "12 owned tracks hidden" (DEC-092), or nothing when none are. */
export function hiddenLine(hidden: number): string {
  if (hidden <= 0) return "";
  return `${pluralize(hidden, "owned track")} hidden`;
}

/** What a push did, for the page's notice. */
export function pushOutcome(result: BeatportPlaylistResult): string {
  const name = `“${result.name}”`;
  const skipped =
    result.skipped_owned > 0
      ? ` ${pluralize(result.skipped_owned, "track")} you own ${result.skipped_owned === 1 ? "was" : "were"} left out.`
      : "";
  const failed =
    result.failed > 0
      ? ` ${pluralize(result.failed, "track")} could not be added.`
      : "";
  if (result.outcome === "succeeded") {
    return `Added ${pluralize(result.added, "track")} to ${name} on Beatport.${skipped}${failed}`;
  }
  const before = result.playlist_id
    ? `after adding ${pluralize(result.added, "track")} to ${name}`
    : `before ${name} was made`;
  if (result.outcome === "cancelled" || result.cancelled) {
    return `The push stopped when asked, ${before}.${skipped}`;
  }
  return `The push stopped because ${stoppedBecause(result.error_class)}, ${before}.${skipped}${failed}`;
}

/** What a resolve did, for the page's notice. */
export function resolveOutcome(result: BeatportResolveResult): string {
  const read = `Read ${pluralize(result.resolved, "track")} from Beatport`;
  const missing =
    result.not_found > 0 ? `; Beatport no longer has ${formatCount(result.not_found)}` : "";
  if (result.outcome === "succeeded") return `${read}${missing}.`;
  if (result.outcome === "cancelled" || result.cancelled) return `Stopped when asked. ${read}${missing}.`;
  return `Stopped because ${stoppedBecause(result.error_class)}. ${read}${missing}.`;
}

/** What each Discover job is, for a sentence saying one is already running. */
const RUNNING_ALREADY: Record<string, string> = {
  discovery: "A discovery run is already running. It is in the list of runs.",
  beatport_playlist: "A push to Beatport is already running. Try again when it has finished.",
  beatport_resolve: "Beatport identities are already being resolved.",
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
      "Another Discover job is running. Try again when it has finished."
    );
  }
  return refusal.message;
}

/** The resolve prompt's sentence, for `to_read` tracks. */
export function resolvePrompt(toRead: number): string {
  return (
    `${pluralize(toRead, "matched track")} ${toRead === 1 ? "has" : "have"} not been read from ` +
    "Beatport yet. Reading them tells Discover which Beatport artists and labels your library " +
    "holds, so runs and pages find them by id rather than by name."
  );
}
