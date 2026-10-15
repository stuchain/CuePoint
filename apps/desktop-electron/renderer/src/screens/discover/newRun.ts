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

/** Every name in the library, the names in a saved list, or none at all. */
export type ScopeMode = "all" | "list" | "none";

export interface NewRunForm {
  genreIds: number[];
  chartsFrom: string;
  chartsTo: string;
  /** As typed, so a half-typed number is not replaced under the cursor. */
  days: string;
  artists: ScopeMode;
  /** The saved artist list a "list" scope reads, or null before one is chosen. */
  artistListId: number | null;
  labels: ScopeMode;
  labelListId: number | null;
}

/**
 * The names in the saved lists the form points at (empty when none is
 * chosen). The form holds which list; the engine holds what is in it.
 */
export interface ListMembers {
  artists: readonly string[];
  labels: readonly string[];
}

export const NO_MEMBERS: ListMembers = { artists: [], labels: [] };

export function defaultForm(defaults: DiscoverDefaults): NewRunForm {
  return {
    genreIds: [...defaults.genre_ids],
    chartsFrom: defaults.charts_from,
    chartsTo: defaults.charts_to,
    days: String(defaults.new_releases_days),
    artists: "all",
    artistListId: null,
    labels: "all",
    labelListId: null,
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
export function formProblems(
  form: NewRunForm,
  limits: DiscoverLimits,
  members: ListMembers = NO_MEMBERS,
): string[] {
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
  problems.push(...listProblem("artist", form.artists, form.artistListId, members.artists));
  problems.push(...listProblem("label", form.labels, form.labelListId, members.labels));
  // A rule the engine does not make, because it can run it and find nothing: a
  // dig with no artists, no labels and no genre has nothing to look for. (With no
  // artists but a genre, it reads that genre's general charts.)
  if (form.artists === "none" && form.labels === "none" && form.genreIds.length === 0) {
    problems.push("A dig needs artists, labels or a genre to look for.");
  }
  return problems;
}

/** What is wrong with a "saved list" scope, if it is one. */
function listProblem(
  noun: string,
  mode: ScopeMode,
  listId: number | null,
  members: readonly string[],
): string[] {
  if (mode !== "list") return [];
  if (listId === null) return [`Choose a saved list of ${noun}s, or look for every one.`];
  if (members.length === 0) return [`That list has no ${noun}s. Add some, or look for every one.`];
  return [];
}

function scope(mode: ScopeMode, members: readonly string[]): string[] | null {
  if (mode === "all") return null;
  return mode === "none" ? [] : [...members];
}

/**
 * What the engine is asked to run. A saved list is sent as its names, the same
 * request a hand-made selection was, so what a dig does is unchanged.
 */
export function runRequest(
  form: NewRunForm,
  members: ListMembers = NO_MEMBERS,
  includeUserCharts = false,
): DiscoverRunRequest {
  const request: DiscoverRunRequest = {
    genre_ids: [...form.genreIds],
    new_releases_days: Number(form.days),
    artists: scope(form.artists, members.artists),
    labels: scope(form.labels, members.labels),
  };
  // Chart dates mean nothing without a genre to read charts in.
  if (form.genreIds.length > 0) {
    request.charts_from = form.chartsFrom;
    request.charts_to = form.chartsTo;
    // Settings → Beatport; left out when off, which is the engine's default.
    if (includeUserCharts) request.include_user_charts = true;
  }
  return request;
}

/**
 * The chart dates in a few words, for the genres legend (DSC-5):
 * "last 30 days" while they are the engine's default window, the two dates
 * once they are not.
 */
export function chartsWindowShort(form: NewRunForm, defaults: DiscoverDefaults): string {
  const from = dayOf(form.chartsFrom);
  const to = dayOf(form.chartsTo);
  if (from === null || to === null) return "chosen dates";
  const isDefault =
    form.chartsFrom === defaults.charts_from && form.chartsTo === defaults.charts_to;
  const days = to - from;
  if (isDefault && days >= 1) return `last ${days} days`;
  return `${form.chartsFrom} to ${form.chartsTo}`;
}

/** How many names a scope covers, for the dig bar: every one, a list's, or none. */
export function scopeCount(mode: ScopeMode, total: number, members: readonly string[]): number {
  if (mode === "all") return total;
  return mode === "none" ? 0 : members.length;
}
