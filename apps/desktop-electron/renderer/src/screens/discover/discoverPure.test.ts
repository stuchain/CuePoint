/**
 * The Discover page's pure parts (DISCOVER-10): the remembered tab, what each
 * Beatport state says, what each selection offers, the New run form's rules,
 * and the sentences — each read over the engine's own answers where it has
 * one (`discoverPage.fixture.json`, produced by the Python suite).
 */
import { render } from "@testing-library/react";
import { Fragment, createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  BeatportPlaylistResult,
  BeatportResolveResult,
  DiscoverLimits,
  DiscoverOptions,
  DiscoverRefusal,
  DiscoverRunList,
  DiscoverRunTracksPage,
  DiscoveryRunResult,
  WantlistPage,
} from "../../api/cuepointBridge.types";
import fixture from "./discoverPage.fixture.json";
import { MAX_OPEN_PAGES, runActions, wantlistActions } from "./beatportActions";
import { camelotOf } from "./beatportKey";
import { RUN_COLUMNS, WANTLIST_COLUMNS } from "./beatportColumns";
import { beatportNotice, beatportUsable, refusalState, unusableReason } from "./beatportState";
import {
  artistsText,
  chartsLine,
  discoverFacts,
  discoveryEnded,
  foundLine,
  formatIsoRange,
  lookingUpLine,
  pushOutcome,
  refusalText,
  releasesLine,
  resolveOutcome,
  resolvePrompt,
  runFound,
  runOutcome,
  runScopeLine,
  runStateLabel,
  runStopLine,
  runStateTone,
  runSummary,
  scopeLine,
  searchTitle,
  sourceText,
  sourcesText,
  stoppedBecause,
  trackName,
} from "./discoverFormat";
import {
  DEFAULT_DISCOVER_SECTION,
  DISCOVER_SECTION_STORAGE_KEY,
  DISCOVER_SECTIONS,
  loadDiscoverSection,
  saveDiscoverSection,
} from "./discoverSections";
import {
  windowShort,
  defaultForm,
  NO_MEMBERS,
  formProblems,
  runRequest,
  scopeCount,
  type NewRunForm,
} from "./newRun";

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const LIMITS: DiscoverLimits = OPTIONS.limits;
const RUNS = (fixture.runs.value as unknown as DiscoverRunList).runs;
const FAILED = RUNS[0]!;
const FINISHED = RUNS[1]!;
const HIDDEN = fixture.run_tracks_hidden.value as unknown as DiscoverRunTracksPage;
const WANTED = fixture.wantlist_all.value as unknown as WantlistPage;

function refusal(code: DiscoverRefusal["code"], extra: Partial<DiscoverRefusal> = {}) {
  return {
    code,
    message: "engine words",
    reason: null,
    retry_after: null,
    job_id: null,
    job_type: null,
    ...extra,
  } satisfies DiscoverRefusal;
}

afterEach(() => localStorage.clear());

describe("the remembered tab", () => {
  it("has the three tabs FLW-15 names, and never says Run", () => {
    expect(DISCOVER_SECTIONS.map((section) => section.label)).toEqual([
      "Results",
      "New dig",
      "Wantlist",
    ]);
  });

  it("opens on Results the first time, and on the tab last used after", () => {
    expect(loadDiscoverSection()).toBe(DEFAULT_DISCOVER_SECTION);
    expect(DEFAULT_DISCOVER_SECTION).toBe("results");
    saveDiscoverSection("wantlist");
    expect(loadDiscoverSection()).toBe("wantlist");
    saveDiscoverSection("new");
    expect(loadDiscoverSection()).toBe("new");
  });

  it("opens on Results for anything stored that is not a tab, the old Runs included", () => {
    localStorage.setItem(DISCOVER_SECTION_STORAGE_KEY, "charts");
    expect(loadDiscoverSection()).toBe("results");
    localStorage.setItem(DISCOVER_SECTION_STORAGE_KEY, "runs");
    expect(loadDiscoverSection()).toBe("results");
  });
});

describe("Beatport's state", () => {
  it("says nothing when Beatport answered", () => {
    expect(fixture.options_ok.value.beatport.state).toBe("ok");
    expect(beatportNotice("ok")).toBeNull();
  });

  it.each([
    ["options_no_token", "Sign in to Beatport to search its charts and releases.", "signin", "Sign in to Beatport"],
    ["options_rejected", "Beatport sign-in ended or was refused.", "signin", "Sign in again"],
    ["options_forbidden", "Beatport refused this sign-in.", "signin", "Sign in again"],
    ["options_rate_limited", "Beatport is limiting requests", "retry", "Try again"],
    ["options_unavailable", "Beatport cannot be reached", "retry", "Try again"],
  ] as const)("draws %s from the engine's class", (state, headline, action, label) => {
    const beatport = (fixture[state].value as unknown as DiscoverOptions).beatport;
    const notice = beatportNotice(beatport.state, beatport.message, beatport.retry_after)!;
    expect(notice.headline).toBe(headline);
    expect(notice.action).toBe(action);
    expect(notice.actionLabel).toBe(label);
    // One line: a hint only where it says something more.
    expect(notice.hint.length).toBeLessThan(80);
    expect(notice.hint).not.toContain("still open without it");
  });

  it("is one line for a missing, rejected or refused token (C15a)", () => {
    expect(beatportNotice("no_token")!.hint).toBe("");
    expect(beatportNotice("rejected")!.hint).toBe("");
    expect(beatportNotice("forbidden")!.hint).toBe("");
    expect(beatportNotice("unavailable")!.hint).toBe("");
  });

  it("never says scope in a refusal (DSC-3)", () => {
    const forbidden = beatportNotice("forbidden")!;
    expect(`${forbidden.headline} ${forbidden.hint}`).not.toMatch(/scope/i);
  });

  it("says how long a rate limit asked for, and why Beatport was out of reach", () => {
    expect(beatportNotice("rate_limited", null, 12)!.hint).toBe("Wait 12 seconds.");
    expect(beatportNotice("rate_limited", null, 1)!.hint).toBe("Wait 1 second.");
    expect(beatportNotice("rate_limited", null, 300)!.hint).toBe("Wait 5 minutes.");
    expect(beatportNotice("rate_limited", null, null)!.hint).toBe("Wait a little while.");
    expect(beatportNotice("unavailable", "Beatport answered 503.")!.hint).toBe(
      "Beatport answered 503.",
    );
    expect(beatportNotice("unavailable", "Beatport answered 503")!.hint).toBe(
      "Beatport answered 503.",
    );
  });

  it("offers searches and playlists unless the token is missing or refused", () => {
    expect(beatportUsable("ok")).toBe(true);
    expect(beatportUsable("rate_limited")).toBe(true);
    expect(beatportUsable("unavailable")).toBe(true);
    for (const state of ["no_token", "rejected", "forbidden"] as const) {
      expect(beatportUsable(state)).toBe(false);
      expect(unusableReason(state)).toBe(
        state === "forbidden" ? "Beatport refused this sign-in" : "Needs a Beatport sign-in",
      );
    }
    expect(unusableReason("ok")).toBeNull();
  });

  it("reads a Beatport refusal's class, and only a Beatport refusal's", () => {
    expect(refusalState(fixture.refusal_no_token.refusal as DiscoverRefusal)).toBe("no_token");
    expect(refusalState(fixture.refusal_busy.refusal as DiscoverRefusal)).toBeNull();
    expect(refusalState(null)).toBeNull();
    expect(refusalState(refusal("BEATPORT_REFUSED"))).toBe("unavailable");
  });
});

describe("what a selection offers", () => {
  const usable = { pushable: true, pushReason: null, total: 5 };
  const labels = (list: Array<{ label: string }>) => list.map((a) => a.label);

  it("always shows a run's three actions; those that need rows wait for them (DEC-209)", () => {
    const none = runActions(0, { ...usable, needsRows: true });
    expect(labels(none)).toEqual([
      "Add to wantlist",
      "Add to a Beatport playlist…",
      "Open on Beatport",
    ]);
    // All three wait for rows (M189).
    expect(none.map((a) => a.disabled)).toEqual([true, true, true]);
    expect(none[0]!.reason).toBe("Select tracks in the table first");
    expect(none[1]!.reason).toBe("Select tracks in the table first");
    expect(none[2]!.reason).toBe("Select tracks in the table first");
    const some = runActions(3, usable);
    expect(some.map((a) => a.disabled)).toEqual([false, false, false]);
    expect(some.map((a) => a.reason)).toEqual([null, null, null]);
  });

  it("makes a playlist of the selected rows only in a search's table, with no note between the buttons (C236, M189)", () => {
    const playlist = (count: number, total: number) =>
      runActions(count, { ...usable, total, needsRows: true }).find((a) => a.id === "push")!;
    expect(playlist(0, 48)).toMatchObject({ disabled: true, label: "Add to a Beatport playlist…" });
    expect(playlist(3, 48)).toMatchObject({ disabled: false });
    expect(playlist(0, 48).note).toBeNull();
    expect(playlist(3, 48).note).toBeNull();
  });

  it("keeps the wantlist's playlist open with nothing selected: it takes every row shown", () => {
    const playlist = (count: number, total: number) =>
      wantlistActions(Array.from({ length: count }, () => ({ bought_at: null })), { ...usable, total }).find(
        (a) => a.id === "push",
      )!;
    expect(playlist(0, 48)).toMatchObject({ disabled: false });
    expect(playlist(0, 0)).toMatchObject({ disabled: true, reason: "Nothing to put in a playlist" });
  });

  it("opens at most ten pages at once", () => {
    const open = (count: number) => runActions(count, usable).find((a) => a.id === "open")!;
    expect(open(MAX_OPEN_PAGES).disabled).toBe(false);
    expect(open(MAX_OPEN_PAGES + 1).disabled).toBe(true);
    expect(open(MAX_OPEN_PAGES + 1).reason).toBe("Opens at most 10 pages at once");
  });

  it("does not offer a playlist without a token Beatport accepts", () => {
    const push = runActions(2, { pushable: false, pushReason: "Needs a token.", total: 5 })[1]!;
    expect(push).toMatchObject({ id: "push", disabled: true, reason: "Needs a token." });
  });

  it("always shows the wantlist's actions, with the reason for each that waits", () => {
    const none = wantlistActions([], usable);
    expect(none.map((a) => a.id)).toEqual(["push", "open", "note", "bought", "remove"]);
    expect(none.map((a) => a.disabled)).toEqual([false, true, true, true, true]);
    expect(none[2]!.reason).toBe("Select one track to edit its note");
    expect(none[4]!.reason).toBe("Select tracks in the table first");
    const one = wantlistActions([{ bought_at: null }], usable);
    expect(one.map((a) => a.disabled)).toEqual([false, false, false, false, false]);
    const two = wantlistActions([{ bought_at: null }, { bought_at: null }], usable);
    expect(two.map((a) => [a.id, a.disabled])).toEqual([
      ["push", false],
      ["open", false],
      ["note", true],
      ["bought", false],
      ["remove", false],
    ]);
    expect(two[2]!.reason).toBe("Select one track to edit its note");
  });

  it("undoes a bought mark when everything selected is marked", () => {
    const bought = WANTED.rows.find((row) => row.bought_at !== null)!;
    const notBought = WANTED.rows.find((row) => row.bought_at === null)!;
    expect(wantlistActions([bought], usable).map((a) => a.label)).toContain("Mark not bought");
    expect(wantlistActions([bought, notBought], usable).map((a) => a.label)).toContain(
      "Mark bought",
    );
    expect(wantlistActions([], usable).map((a) => a.label)).toContain("Mark bought");
  });
});

describe("the New dig form", () => {
  const form = (patch: Partial<NewRunForm> = {}): NewRunForm => ({
    ...defaultForm(OPTIONS.defaults),
    ...patch,
  });

  it("starts from the engine's defaults, every artist and label", () => {
    expect(defaultForm(OPTIONS.defaults)).toEqual({
      genreIds: OPTIONS.defaults.genre_ids,
      chartsFrom: OPTIONS.defaults.charts_from,
      chartsTo: OPTIONS.defaults.charts_to,
      artists: "all",
      artistListId: null,
      labels: "all",
      labelListId: null,
    });
    expect(formProblems(form(), LIMITS)).toEqual([]);
  });

  it("says the engine's default 30-day window as 30 days, and other windows by their dates", () => {
    expect(windowShort(form(), OPTIONS.defaults)).toBe("the last 30 days");
    expect(windowShort(form({ chartsFrom: "2026-09-01" }), OPTIONS.defaults)).toBe(
      formatIsoRange("2026-09-01", OPTIONS.defaults.charts_to),
    );
  });

  it("asks the engine for the whole library as null, none as an empty list", () => {
    expect(runRequest(form({ genreIds: [5] }))).toEqual({
      genre_ids: [5],
      artists: null,
      labels: null,
      charts_from: OPTIONS.defaults.charts_from,
      charts_to: OPTIONS.defaults.charts_to,
      releases_from: OPTIONS.defaults.charts_from,
      releases_to: OPTIONS.defaults.charts_to,
    });
    expect(
      runRequest(form({ artists: "list", artistListId: 4, labels: "none" }), {
        artists: ["Kiko"],
        labels: [],
      }),
    ).toMatchObject({ artists: ["Kiko"], labels: [] });
  });

  it("sends a saved list's names exactly as a hand-made selection was sent", () => {
    const request = runRequest(
      form({ artists: "list", artistListId: 1, labels: "list", labelListId: 2 }),
      { artists: ["Kiko", "Mara Veil"], labels: ["Afterlife"] },
    );
    expect(request).toMatchObject({ artists: ["Kiko", "Mara Veil"], labels: ["Afterlife"] });
  });

  it("counts what a scope covers: every one, a list's, or none", () => {
    expect(scopeCount("all", 200, [])).toBe(200);
    expect(scopeCount("list", 200, ["a", "b"])).toBe(2);
    expect(scopeCount("none", 200, ["a"])).toBe(0);
  });

  it("sends include_user_charts only when asked, and only with a genre", () => {
    expect(runRequest(form({ genreIds: [5] }))).not.toHaveProperty("include_user_charts");
    expect(runRequest(form({ genreIds: [5] }), NO_MEMBERS, true)).toMatchObject({
      include_user_charts: true,
    });
    expect(runRequest(form({ genreIds: [] }), NO_MEMBERS, true)).not.toHaveProperty(
      "include_user_charts",
    );
  });

  it("sends no chart dates when no genre is chosen, but always the one window as releases", () => {
    const request = runRequest(
      form({ genreIds: [], chartsFrom: "2026-09-01", chartsTo: "2026-09-30" }),
    );
    expect(request).not.toHaveProperty("charts_from");
    expect(request).not.toHaveProperty("charts_to");
    expect(request).not.toHaveProperty("new_releases_days");
    expect(request).toMatchObject({ releases_from: "2026-09-01", releases_to: "2026-09-30" });
  });

  it.each([
    [{ genreIds: Array.from({ length: 51 }, (_, i) => i + 1) }, "Choose at most 50 genres."],
    [{ genreIds: [5], chartsFrom: "2026-02-31" }, "Enter both dates."],
    [{ genreIds: [], chartsFrom: "2026-02-31" }, "Enter both dates."],
    [{ chartsTo: "" }, "Enter both dates."],
    [{ chartsFrom: "soon" }, "Enter both dates."],
    [{ chartsFrom: "2026-09-02", chartsTo: "2026-09-01" }, "The start date is after the end date."],
    [
      { genreIds: [], chartsFrom: "2025-01-01", chartsTo: "2026-01-02" },
      "Dates can span at most 366 days.",
    ],
    [{ artists: "list" }, "Choose a saved list of artists, or look for every one."],
    [{ labels: "list" }, "Choose a saved list of labels, or look for every one."],
    [
      { artists: "list", artistListId: 3 },
      "That list has no artists. Add some, or look for every one.",
    ],
    [
      { labels: "list", labelListId: 3 },
      "That list has no labels. Add some, or look for every one.",
    ],
    [
      { artists: "none", labels: "none", genreIds: [] },
      "A dig needs artists, labels or a genre to look for.",
    ],
  ] as Array<[Partial<NewRunForm>, string]>)("refuses %j", (patch, problem) => {
    expect(formProblems(form(patch), LIMITS)).toEqual([problem]);
  });

  it("takes no artists with a genre: it reads the genre's general charts", () => {
    expect(formProblems(form({ artists: "none", genreIds: [5] }), LIMITS)).toEqual([]);
    expect(formProblems(form({ artists: "none", labels: "none", genreIds: [5] }), LIMITS)).toEqual([]);
  });

  it("takes a saved list that has names", () => {
    const chosen = form({ artists: "list", artistListId: 1 });
    expect(formProblems(chosen, LIMITS, { artists: ["Kiko"], labels: [] })).toEqual([]);
  });

  it("takes a chart window of exactly the longest the engine takes", () => {
    const edge = form({ genreIds: [5], chartsFrom: "2025-01-01", chartsTo: "2026-01-02" });
    expect(formProblems({ ...edge, chartsFrom: "2025-01-02" }, LIMITS)).toEqual([]);
  });
});

describe("the sentences", () => {
  it("says what a dig can look through, for the page's facts line", () => {
    const facet = (total_values: number) => ({ total_values });
    expect(discoverFacts({ artists: facet(200), labels: facet(121) })).toEqual({
      count: 200,
      noun: "artist",
      facts: ["121 labels"],
    });
    expect(discoverFacts({ artists: facet(1), labels: facet(1) })).toEqual({
      count: 1,
      noun: "artist",
      facts: ["1 label"],
    });
  });

  it("says a dig the app's closing interrupted was stopped by that", () => {
    const interrupted = { ...FAILED, error: "CuePoint stopped before the run finished", error_class: null };
    expect(runStopLine(interrupted)).toBe("Stopped because CuePoint was closed.");
    expect(runOutcome(interrupted)).toMatch(/^Stopped because CuePoint was closed, after /);
    expect(runStopLine({ ...FAILED, error: "boom", error_class: null })).toBe(
      "Stopped because of an error.",
    );
  });

  it("names a run's state and how it ended, from the engine's runs", () => {
    expect(runStateLabel(FINISHED)).toBe("Done");
    expect(runStateLabel(FAILED)).toBe("Stopped");
    expect(runStateTone(FAILED)).toBe("warning");
    expect(runStateLabel({ ...FINISHED, running: true })).toBe("Running");
    expect(runStateLabel({ ...FINISHED, outcome: "cancelled" })).toBe("Stopped");
    expect(runOutcome(FINISHED)).toBe("Dig found 7 tracks from 3 charts and 2 releases.");
    expect(runOutcome(FAILED)).toBe(
      "Stopped because Beatport refused the sign-in, after 0 tracks.",
    );
    expect(runOutcome({ ...FINISHED, running: true })).toBe(
      "Running: 7 tracks from 3 charts and 2 releases so far.",
    );
    expect(runOutcome({ ...FINISHED, outcome: "cancelled" })).toMatch(/^Stopped after/);
    expect(runFound({ tracks_found: 1, charts_read: 1, releases_read: 1 })).toBe(
      "1 track from 1 chart and 1 release",
    );
    // A part that is nothing is left out (M422).
    expect(runFound({ tracks_found: 6, charts_read: 1, releases_read: 0 })).toBe("6 tracks from 1 chart");
  });

  it("sums a run's scope up in one short line, leaving empty parts out", () => {
    const genres = [{ id: 5, name: "House" }] as unknown as typeof OPTIONS.genres;
    const run = (params: Partial<typeof FINISHED.params>) => ({
      ...FINISHED,
      params: {
        ...FINISHED.params,
        genre_ids: [5],
        releases_from: null,
        releases_to: null,
        new_releases_days: 30,
        artists: { picked: null, count: 67, linked_ids: 0 },
        labels: { picked: null, count: 28, linked_ids: 0 },
        ...params,
      },
    });
    expect(runScopeLine(run({}), genres)).toBe("House · last 30 days · 67 artists · 28 labels");
    expect(
      runScopeLine(
        run({
          genre_ids: [],
          new_releases_days: null,
          artists: { picked: ["A"], count: 1, linked_ids: 0 },
          labels: { picked: [], count: 0, linked_ids: 0 },
        }),
        genres,
      ),
    ).toBe("1 artist");
    expect(runScopeLine(run({ releases_from: "2026-01-01", releases_to: "2026-02-01" }), genres)).toBe(
      `House · ${formatIsoRange("2026-01-01", "2026-02-01")} · 67 artists · 28 labels`,
    );
    expect(
      runScopeLine(
        run({
          genre_ids: [],
          new_releases_days: null,
          artists: { picked: [], count: 0, linked_ids: 0 },
          labels: { picked: [], count: 0, linked_ids: 0 },
        }),
        genres,
      ),
    ).toBe("What it looked for");
  });

  it("says what a run looked for", () => {
    const genres = OPTIONS.genres;
    expect(chartsLine(FINISHED, genres)).toBe(
      `Charts from ${formatIsoRange(FINISHED.params.charts_from!, FINISHED.params.charts_to!)} in House, Techno (Peak Time / Driving)`,
    );
    expect(chartsLine({ ...FINISHED, params: { ...FINISHED.params, genre_ids: [] } }, genres)).toBe(
      "No charts: no genre was chosen",
    );
    expect(chartsLine(FINISHED, [])).toContain("Genre 5, Genre 6");
    expect(releasesLine(FINISHED)).toBe(
      `Releases from ${formatIsoRange(FINISHED.params.releases_from!, FINISHED.params.releases_to!)}`,
    );
    expect(
      releasesLine({
        ...FINISHED,
        params: { ...FINISHED.params, releases_from: null, releases_to: null },
      }),
    ).toBe("Releases from the last 30 days");
    expect(scopeLine(FINISHED.params.artists, "artist", "artists")).toBe(
      "every artist in your library (3)",
    );
    expect(scopeLine({ picked: [], count: 0, linked_ids: 0 }, "label", "labels")).toBe("no labels");
    expect(scopeLine({ picked: ["A", "B"], count: 2, linked_ids: 0 }, "label", "labels")).toBe(
      "2 labels",
    );
    expect(
      runSummary(
        { ...FINISHED, params: { ...FINISHED.params, releases_from: null, releases_to: null } },
        genres,
      ),
    ).toBe("House, Techno (Peak Time / Driving) · Releases from the last 30 days");
    // A dig over chosen dates says those dates, not the default it no longer used.
    const dated = {
      ...FINISHED,
      params: {
        ...FINISHED.params,
        new_releases_days: null,
        releases_from: "2026-06-01",
        releases_to: "2026-06-20",
      },
    };
    expect(runSummary(dated, genres)).toBe(
      `House, Techno (Peak Time / Driving) · Releases from ${formatIsoRange("2026-06-01", "2026-06-20")}`,
    );
  });

  it("names a Beatport track and why a run found it", () => {
    const [first] = HIDDEN.rows;
    expect(trackName(first!)).toBe("Track 1 (Original Mix)");
    expect(trackName({ title: "Dub", mix_name: null })).toBe("Dub");
    expect(artistsText({ artists: ["A", "B"], remixers: [] })).toBe("A, B");
    expect(artistsText({ artists: ["A"], remixers: ["C"] })).toBe("A (remixed by C)");
    expect(sourcesText(first!.sources)).toBe("On a chart by Mara Veil: “Mara's September”");
    const release = HIDDEN.rows.flatMap((row) => row.sources).find(
      (source) => source.source_type === "label_release",
    )!;
    expect(sourceText(release)).toBe(`New on ${release.matched_on}: “${release.source_name}”`);
    expect(sourceText({ ...release, source_name: null })).toBe(`New on ${release.matched_on}`);
    expect(
      sourceText({ ...first!.sources[0]!, source_name: null }),
    ).toBe("On a chart by Mara Veil");
  });

  it("names a general genre chart by itself when nobody is named for it", () => {
    const chart = { ...fixture.run_tracks_all.value.rows[0]!.sources[0]!, source_type: "chart" as const };
    expect(sourceText({ ...chart, matched_on: "Journey", source_name: "Journey" })).toBe(
      "On the chart “Journey”",
    );
    expect(sourceText({ ...chart, matched_on: "DJEFF", source_name: "DJEFF picks" })).toBe(
      "On a chart by DJEFF: “DJEFF picks”",
    );
    expect(sourceText({ ...chart, source_type: "artist_release", matched_on: "Mara", source_name: "EP" })).toBe(
      "New from Mara: “EP”",
    );
  });

  it("titles a search by its date, and counts what it found on one line (DSC-2, DSC-6)", () => {
    expect(searchTitle(FINISHED.started_at)).toMatch(/^Dig of /);
    expect(searchTitle(FINISHED.started_at)).not.toMatch(/run/i);
    expect(foundLine(40, 12, true)).toBe("40 tracks · 12 already in your library (hidden)");
    expect(foundLine(40, 12, false)).toBe("40 tracks · 12 already in your library");
    expect(foundLine(40, 0, true)).toBe("40 tracks");
    expect(foundLine(1, 1, true)).toBe("1 track · 1 already in your library (hidden)");
  });

  it("says what a push, a resolve and a discovery did, from their results", () => {
    expect(pushOutcome(fixture.playlist_result as BeatportPlaylistResult)).toBe(
      "Made “Friday finds” on Beatport with 2 tracks. 1 track already in your library was left out.",
    );
    expect(pushOutcome(fixture.playlist_refused as BeatportPlaylistResult)).toBe(
      "Making the playlist stopped because Beatport refused the sign-in for this, before “Friday” was made.",
    );
    expect(
      pushOutcome({ ...(fixture.playlist_result as BeatportPlaylistResult), outcome: "cancelled" }),
    ).toMatch(/^Making the playlist stopped when asked, after adding 2 tracks/);
    expect(resolveOutcome(fixture.resolve_result as BeatportResolveResult)).toBe(
      "Looked up 2 tracks on Beatport.",
    );
    // M424: a stopped look-up says "Stopped", never "Stopped when asked".
    expect(
      resolveOutcome({ ...(fixture.resolve_result as BeatportResolveResult), outcome: "cancelled" }),
    ).toBe("Stopped. Looked up 2 tracks on Beatport.");
    expect(discoveryEnded(fixture.discovery_result as DiscoveryRunResult)).toBe(
      "Dig found 7 tracks from 3 charts and 2 releases.",
    );
    expect(stoppedBecause(null)).toBe("of an error");
  });

  it("words a busy refusal for a person, and every other as CuePoint did", () => {
    expect(refusalText(fixture.refusal_busy.refusal as DiscoverRefusal)).toBe(
      "A dig is already running. It is in the Results tab.",
    );
    expect(refusalText(refusal("DISCOVER_BUSY", { job_type: "beatport_playlist" }))).toBe(
      "A Beatport playlist is already being made. Try again when it has finished.",
    );
    expect(refusalText(refusal("DISCOVER_BUSY", { job_type: "beatport_resolve" }))).toBe(
      "Tracks are already being looked up on Beatport.",
    );
    expect(refusalText(refusal("DISCOVER_BUSY", { job_type: "something" }))).toMatch(
      /^Another Discover task is running/,
    );
    expect(refusalText(fixture.refusal_note_too_long.refusal as DiscoverRefusal)).toBe(
      "A note is at most 1000 characters",
    );
  });

  it("offers a lookup for the tracks the engine counted, in plain words (DSC-4)", () => {
    expect(resolvePrompt(OPTIONS.resolve.to_read)).toBe("2 matched tracks have no Beatport artist yet");
    expect(resolvePrompt(1)).toBe("1 matched track has no Beatport artist yet");
    expect(resolvePrompt(283)).toBe("283 matched tracks have no Beatport artist yet");
    expect(lookingUpLine(283)).toBe("Looking up 283…");
    expect(lookingUpLine(0)).toBe("Looking up tracks…");
    for (const words of [resolvePrompt(2), lookingUpLine(2)]) {
      expect(words).not.toMatch(/\bid\b|resolve|identit/i);
    }
  });
});

describe("the columns", () => {
  it("sorts only by what the engine sorts by", () => {
    const sorts = (columns: ReadonlyArray<{ sortKey?: string }>) =>
      columns.flatMap((column) => (column.sortKey ? [column.sortKey] : [])).sort();
    expect(sorts(RUN_COLUMNS)).toEqual(["artist", "position", "release_date", "title"]);
    expect(sorts(WANTLIST_COLUMNS)).toEqual(["added_at", "artist", "release_date", "title"]);
  });

  it("draws the specification's columns for a run", () => {
    // D12/M85: BPM before Key; Label, Released and From wait in the Columns list.
    expect(RUN_COLUMNS.filter((c) => !c.hiddenByDefault).map((c) => c.header)).toEqual([
      "#",
      "Title",
      "Artist",
      "BPM",
      "Key",
      "Genre",
      "In your library",
      "Wantlist",
    ]);
  });

  it("draws a run's row, counting its order from one", () => {
    const row = HIDDEN.rows[0]!;
    const cell = (id: string) => RUN_COLUMNS.find((c) => c.id === id)!.render(row);
    expect(cell("position")).toBe("1");
    expect(cell("bpm")).toBe("124");
    expect(cell("owned")).toBe("");
    expect(cell("on_wantlist")).toBe("");
    expect(RUN_COLUMNS.find((c) => c.id === "owned")!.header).toBe("In your library");
    const all = fixture.run_tracks_all.value as unknown as DiscoverRunTracksPage;
    const owned = all.rows.find((r) => r.owned)!;
    const wanted = all.rows.find((r) => r.on_wantlist)!;
    expect(RUN_COLUMNS.find((c) => c.id === "owned")!.render(owned)).toBe("In your library");
    expect(RUN_COLUMNS.find((c) => c.id === "on_wantlist")!.render(wanted)).toBe("On wantlist");
  });

  it("draws the wantlist's note and marks", () => {
    const noted = WANTED.rows.find((row) => row.note)!;
    expect(WANTLIST_COLUMNS.find((c) => c.id === "note")!.render(noted)).toBe(
      "For the Friday warm-up",
    );
    const bought = WANTED.rows.find((row) => row.bought_at)!;
    expect(WANTLIST_COLUMNS.find((c) => c.id === "bought")!.render(bought)).not.toBe("");
  });
});

describe("Beatport's key as the Camelot code the wheel lights (DEC-201)", () => {
  it.each([
    ["Am", "8A"],
    ["C", "8B"],
    ["F#m", "11A"],
    ["Gb", "2B"],
    ["Ebm", "2A"],
    ["Bbm", "3A"],
    ["G#m", "1A"],
    ["B", "1B"],
    ["A Minor", "8A"],
    ["F# Major", "2B"],
    ["Eb Minor", "2A"],
    ["8A", "8A"],
    ["12b", "12B"],
    ["  9A ", "9A"],
  ])("reads %s as %s", (text, camelot) => {
    expect(camelotOf(text)).toBe(camelot);
  });

  it.each([null, undefined, "", "  ", "H", "13A", "0B", "loud", "Cmaj7"])(
    "reads %j as no key",
    (text) => {
      expect(camelotOf(text)).toBeNull();
    },
  );

  it("draws a row's key as the Library's Camelot chip, and the wheel is told the same code", () => {
    const row = { ...HIDDEN.rows[0]!, key: "Am" };
    const column = RUN_COLUMNS.find((c) => c.id === "key")!;
    const { container, unmount } = render(createElement(Fragment, null, column.render(row)));
    const chip = container.querySelector(".key-chip");
    expect(chip?.textContent).toBe("8A");
    expect(chip?.classList.contains("key-chip--8A")).toBe(true);
    unmount();
    // No key is a dash (DEC-201); copied text stays the bare code, or nothing.
    expect(render(createElement(Fragment, null, column.render({ ...row, key: null }))).container.textContent).toBe("—");
    expect(column.text!(row)).toBe("8A");
    expect(column.text!({ ...row, key: null })).toBe("");
  });
});
