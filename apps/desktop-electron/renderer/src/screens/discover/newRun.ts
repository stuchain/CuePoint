/**
 * The New search form's rules (DISCOVER-10).
 *
 * The form refuses what the engine would, from the bounds `options` sends, so
 * a person learns what is wrong before pressing Start rather than after. The
 * engine still decides: its refusal, if it differs, is shown in its words.
 */
import type {
  DiscoverDefaults,
  DiscoverLimits,
  DiscoverRunRequest,
} from "../../api/cuepointBridge.types";

/** Every name in the library, only the names picked, or none at all. */
export type ScopeMode = "all" | "picked" | "none";

export interface NewRunForm {
  genreIds: number[];
  chartsFrom: string;
  chartsTo: string;
  /** As typed, so a half-typed number is not replaced under the cursor. */
  days: string;
  artists: ScopeMode;
  pickedArtists: string[];
  labels: ScopeMode;
  pickedLabels: string[];
}

export function defaultForm(defaults: DiscoverDefaults): NewRunForm {
  return {
    genreIds: [...defaults.genre_ids],
    chartsFrom: defaults.charts_from,
    chartsTo: defaults.charts_to,
    days: String(defaults.new_releases_days),
    artists: "all",
    pickedArtists: [],
    labels: "all",
    pickedLabels: [],
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar date's day number, or null when the text is not one. */
function dayOf(text: string): number | null {
  if (!ISO_DATE.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  // "2026-02-31" parses as 3 March: a date that round-trips is a real one.
  if (new Date(time).toISOString().slice(0, 10) !== text) return null;
  return Math.round(time / DAY_MS);
}

/** Each thing the engine would refuse, as the sentence to show. */
export function formProblems(form: NewRunForm, limits: DiscoverLimits): string[] {
  const problems: string[] = [];
  if (form.genreIds.length > limits.max_genres) {
    problems.push(`Choose at most ${limits.max_genres} genres.`);
  }
  if (form.genreIds.length > 0) {
    const from = dayOf(form.chartsFrom);
    const to = dayOf(form.chartsTo);
    if (from === null || to === null) {
      problems.push("Give both chart dates as dates.");
    } else if (from > to) {
      problems.push("The first chart date is after the last.");
    } else if (to - from + 1 > limits.max_window_days) {
      problems.push(`Charts can span at most ${limits.max_window_days} days.`);
    }
  }
  const days = Number(form.days);
  if (!/^\d+$/.test(form.days.trim()) || days < 1 || days > limits.max_window_days) {
    problems.push(`Releases reach back from 1 to ${limits.max_window_days} days.`);
  }
  if (form.artists === "picked" && form.pickedArtists.length === 0) {
    problems.push("Choose at least one artist, or look for every one.");
  }
  if (form.labels === "picked" && form.pickedLabels.length === 0) {
    problems.push("Choose at least one label, or look for every one.");
  }
  // Two rules the engine does not make, because it can run them and find
  // nothing: a search's charts are the ones your artists curated, and a search
  // with neither artists nor labels has nothing to look for.
  if (form.artists === "none" && form.labels === "none") {
    problems.push("A search needs artists or labels to look for.");
  } else if (form.artists === "none" && form.genreIds.length > 0) {
    problems.push("Charts come from your artists. Choose some artists, or untick every genre.");
  }
  return problems;
}

function scope(mode: ScopeMode, picked: readonly string[]): string[] | null {
  if (mode === "all") return null;
  return mode === "none" ? [] : [...picked];
}

/** What the engine is asked to run. */
export function runRequest(form: NewRunForm): DiscoverRunRequest {
  const request: DiscoverRunRequest = {
    genre_ids: [...form.genreIds],
    new_releases_days: Number(form.days),
    artists: scope(form.artists, form.pickedArtists),
    labels: scope(form.labels, form.pickedLabels),
  };
  // Chart dates mean nothing without a genre to read charts in.
  if (form.genreIds.length > 0) {
    request.charts_from = form.chartsFrom;
    request.charts_to = form.chartsTo;
  }
  return request;
}

/**
 * The chart dates in words, for the line shown above "More options" (DSC-5):
 * "Charts from the last 30 days." while they are the engine's default window,
 * the two dates once they are not.
 */
export function chartsWindowText(form: NewRunForm, defaults: DiscoverDefaults): string {
  const from = dayOf(form.chartsFrom);
  const to = dayOf(form.chartsTo);
  if (from === null || to === null) return "Charts from the dates below.";
  const isDefault =
    form.chartsFrom === defaults.charts_from && form.chartsTo === defaults.charts_to;
  const days = to - from;
  if (isDefault && days >= 1) return `Charts from the last ${days} days.`;
  return `Charts from ${form.chartsFrom} to ${form.chartsTo}.`;
}
