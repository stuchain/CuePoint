/**
 * The Discover page's pure parts (DISCOVER-10): the remembered tab, what each
 * Beatport state says, what each selection offers, the New run form's rules,
 * and the sentences — each read over the engine's own answers where it has
 * one (`discoverPage.fixture.json`, produced by the Python suite).
 */
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
import { RUN_COLUMNS, WANTLIST_COLUMNS } from "./beatportColumns";
import { beatportNotice, beatportUsable, refusalState, unusableReason } from "./beatportState";
import {
  artistsText,
  chartsLine,
  discoveryEnded,
  hiddenLine,
  pushOutcome,
  refusalText,
  releasesLine,
  resolveOutcome,
  resolvePrompt,
  runFound,
  runOutcome,
  runStateLabel,
  runSummary,
  scopeLine,
  sourceText,
  sourcesText,
  stoppedBecause,
  trackName,
} from "./discoverFormat";
import {
  DEFAULT_DISCOVER_SECTION,
  DISCOVER_SECTION_STORAGE_KEY,
  loadDiscoverSection,
  saveDiscoverSection,
} from "./discoverSections";
import { defaultForm, formProblems, runRequest, type NewRunForm } from "./newRun";

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
  it("opens on Runs the first time, and on the tab last used after", () => {
    expect(loadDiscoverSection()).toBe(DEFAULT_DISCOVER_SECTION);
    expect(DEFAULT_DISCOVER_SECTION).toBe("runs");
    saveDiscoverSection("wantlist");
    expect(loadDiscoverSection()).toBe("wantlist");
  });

  it("opens on Runs for anything stored that is not a tab", () => {
    localStorage.setItem(DISCOVER_SECTION_STORAGE_KEY, "charts");
    expect(loadDiscoverSection()).toBe("runs");
  });
});

describe("Beatport's state", () => {
  it("says nothing when Beatport answered", () => {
    expect(fixture.options_ok.value.beatport.state).toBe("ok");
    expect(beatportNotice("ok")).toBeNull();
  });

  it.each([
    ["options_no_token", "Beatport is not connected", "settings"],
    ["options_rejected", "Beatport rejected the token", "settings"],
    ["options_forbidden", "Beatport refused this token", "settings"],
    ["options_rate_limited", "Beatport is limiting requests", "retry"],
    ["options_unavailable", "Beatport cannot be reached", "retry"],
  ] as const)("draws %s from the engine's class", (state, headline, action) => {
    const beatport = (fixture[state].value as unknown as DiscoverOptions).beatport;
    const notice = beatportNotice(beatport.state, beatport.message, beatport.retry_after)!;
    expect(notice.headline).toBe(headline);
    expect(notice.action).toBe(action);
    // Every one says the page still works without Beatport (DEC-098).
    expect(notice.hint).toContain("Past runs and your wantlist still open without it.");
  });

  it("says how long a rate limit asked for, and why Beatport was out of reach", () => {
    expect(beatportNotice("rate_limited", null, 12)!.hint).toContain("in 12 seconds");
    expect(beatportNotice("rate_limited", null, 1)!.hint).toContain("in 1 second.");
    expect(beatportNotice("rate_limited", null, 300)!.hint).toContain("in 5 minutes");
    expect(beatportNotice("rate_limited", null, null)!.hint).toContain("in a little while");
    expect(beatportNotice("unavailable", "Beatport answered 503")!.hint).toMatch(
      /^Beatport answered 503\. Check the connection/,
    );
  });

  it("offers runs and pushes unless the token is missing or refused", () => {
    expect(beatportUsable("ok")).toBe(true);
    expect(beatportUsable("rate_limited")).toBe(true);
    expect(beatportUsable("unavailable")).toBe(true);
    for (const state of ["no_token", "rejected", "forbidden"] as const) {
      expect(beatportUsable(state)).toBe(false);
      expect(unusableReason(state)).toMatch(/Settings/);
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

  it("offers a run's whole table to a push when nothing is selected", () => {
    expect(runActions(0, usable).map((a) => a.id)).toEqual(["push"]);
    expect(runActions(0, { ...usable, total: 0 })[0]!.disabled).toBe(true);
  });

  it("offers a run's rows the wantlist, a push and Beatport's page", () => {
    expect(runActions(1, usable).map((a) => a.label)).toEqual([
      "Add to wantlist",
      "Push to Beatport playlist…",
      "Open on Beatport",
    ]);
    expect(runActions(3, usable).map((a) => a.id)).toEqual(["add_to_wantlist", "push", "open"]);
  });

  it("opens at most ten pages at once", () => {
    const open = (count: number) => runActions(count, usable).find((a) => a.id === "open")!;
    expect(open(MAX_OPEN_PAGES).disabled).toBe(false);
    expect(open(MAX_OPEN_PAGES + 1).disabled).toBe(true);
    expect(open(MAX_OPEN_PAGES + 1).reason).toBe("Opens at most 10 pages at once.");
  });

  it("does not offer a push without a token Beatport accepts", () => {
    const push = runActions(2, { pushable: false, pushReason: "Needs a token.", total: 5 })[1]!;
    expect(push).toMatchObject({ id: "push", disabled: true, reason: "Needs a token." });
  });

  it("offers a wanted track a note, a bought mark and leaving, by how many", () => {
    expect(wantlistActions([], usable).map((a) => a.id)).toEqual(["push"]);
    expect(wantlistActions([{ bought_at: null }], usable).map((a) => a.id)).toEqual([
      "push",
      "open",
      "note",
      "bought",
      "remove",
    ]);
    expect(
      wantlistActions([{ bought_at: null }, { bought_at: null }], usable).map((a) => a.id),
    ).toEqual(["push", "open", "bought", "remove"]);
  });

  it("undoes a bought mark when everything selected is marked", () => {
    const bought = WANTED.rows.find((row) => row.bought_at !== null)!;
    const notBought = WANTED.rows.find((row) => row.bought_at === null)!;
    expect(wantlistActions([bought], usable).map((a) => a.label)).toContain("Mark not bought");
    expect(wantlistActions([bought, notBought], usable).map((a) => a.label)).toContain(
      "Mark bought",
    );
  });
});

describe("the New run form", () => {
  const form = (patch: Partial<NewRunForm> = {}): NewRunForm => ({
    ...defaultForm(OPTIONS.defaults),
    ...patch,
  });

  it("starts from the engine's defaults, every artist and label", () => {
    expect(defaultForm(OPTIONS.defaults)).toEqual({
      genreIds: OPTIONS.defaults.genre_ids,
      chartsFrom: OPTIONS.defaults.charts_from,
      chartsTo: OPTIONS.defaults.charts_to,
      days: "30",
      artists: "all",
      pickedArtists: [],
      labels: "all",
      pickedLabels: [],
    });
    expect(formProblems(form(), LIMITS)).toEqual([]);
  });

  it("asks the engine for the whole library as null, none as an empty list", () => {
    expect(runRequest(form({ genreIds: [5] }))).toEqual({
      genre_ids: [5],
      new_releases_days: 30,
      artists: null,
      labels: null,
      charts_from: OPTIONS.defaults.charts_from,
      charts_to: OPTIONS.defaults.charts_to,
    });
    expect(
      runRequest(form({ artists: "picked", pickedArtists: ["Kiko"], labels: "none" })),
    ).toMatchObject({ artists: ["Kiko"], labels: [] });
  });

  it("sends no chart dates when no genre is chosen", () => {
    const request = runRequest(form({ genreIds: [] }));
    expect(request).not.toHaveProperty("charts_from");
    expect(request).not.toHaveProperty("charts_to");
  });

  it.each([
    [{ genreIds: Array.from({ length: 51 }, (_, i) => i + 1) }, "Choose at most 50 genres."],
    [{ genreIds: [5], chartsFrom: "2026-02-31" }, "Give both chart dates as dates."],
    [{ genreIds: [5], chartsFrom: "soon" }, "Give both chart dates as dates."],
    [
      { genreIds: [5], chartsFrom: "2026-09-02", chartsTo: "2026-09-01" },
      "The first chart date is after the last.",
    ],
    [
      { genreIds: [5], chartsFrom: "2025-01-01", chartsTo: "2026-01-02" },
      "Charts can span at most 366 days.",
    ],
    [{ days: "0" }, "Releases reach back from 1 to 366 days."],
    [{ days: "367" }, "Releases reach back from 1 to 366 days."],
    [{ days: "3.5" }, "Releases reach back from 1 to 366 days."],
    [{ artists: "picked" }, "Choose at least one artist, or look for every one."],
    [{ labels: "picked" }, "Choose at least one label, or look for every one."],
    [{ artists: "none", labels: "none" }, "A run needs artists or labels to look for."],
    [
      { artists: "none", genreIds: [5] },
      "Charts are found through your artists: choose some, or no genres.",
    ],
  ] as Array<[Partial<NewRunForm>, string]>)("refuses %j", (patch, problem) => {
    expect(formProblems(form(patch), LIMITS)).toEqual([problem]);
  });

  it("takes a chart window of exactly the longest the engine takes", () => {
    const edge = form({ genreIds: [5], chartsFrom: "2025-01-01", chartsTo: "2026-01-02" });
    expect(formProblems({ ...edge, chartsFrom: "2025-01-02" }, LIMITS)).toEqual([]);
  });
});

describe("the sentences", () => {
  it("names a run's state and how it ended, from the engine's runs", () => {
    expect(runStateLabel(FINISHED)).toBe("Finished");
    expect(runStateLabel(FAILED)).toBe("Failed");
    expect(runStateLabel({ ...FINISHED, running: true })).toBe("Running");
    expect(runStateLabel({ ...FINISHED, outcome: "cancelled" })).toBe("Stopped");
    expect(runOutcome(FINISHED)).toBe("Found 7 tracks from 3 charts and 2 releases.");
    expect(runOutcome(FAILED)).toBe(
      "Stopped because Beatport rejected the token, after 0 tracks from 0 charts and 0 releases.",
    );
    expect(runOutcome({ ...FINISHED, running: true })).toBe(
      "Running: 7 tracks from 3 charts and 2 releases so far.",
    );
    expect(runOutcome({ ...FINISHED, outcome: "cancelled" })).toMatch(/^Stopped when asked/);
    expect(runFound({ tracks_found: 1, charts_read: 1, releases_read: 1 })).toBe(
      "1 track from 1 chart and 1 release",
    );
  });

  it("says what a run looked for", () => {
    const genres = OPTIONS.genres;
    expect(chartsLine(FINISHED, genres)).toBe(
      `Charts from ${FINISHED.params.charts_from} to ${FINISHED.params.charts_to} in House, Techno (Peak Time / Driving)`,
    );
    expect(chartsLine({ ...FINISHED, params: { ...FINISHED.params, genre_ids: [] } }, genres)).toBe(
      "No charts: no genre was chosen",
    );
    expect(chartsLine(FINISHED, [])).toContain("Genre 5, Genre 6");
    expect(releasesLine(FINISHED)).toBe(
      `Releases from ${FINISHED.params.releases_from} to ${FINISHED.params.releases_to}`,
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
    expect(runSummary(FINISHED, genres)).toBe(
      "House, Techno (Peak Time / Driving) · 30 days of releases",
    );
  });

  it("names a Beatport track and why a run found it", () => {
    const [first] = HIDDEN.rows;
    expect(trackName(first!)).toBe("Track 1 (Original Mix)");
    expect(trackName({ title: "Dub", mix_name: null })).toBe("Dub");
    expect(artistsText({ artists: ["A", "B"], remixers: [] })).toBe("A, B");
    expect(artistsText({ artists: ["A"], remixers: ["C"] })).toBe("A (remixed by C)");
    expect(sourcesText(first!.sources)).toBe("Chart “Mara's September” by Mara Veil");
    const release = HIDDEN.rows.flatMap((row) => row.sources).find(
      (source) => source.source_type === "label_release",
    )!;
    expect(sourceText(release)).toBe(`${release.matched_on}: “${release.source_name}”`);
    expect(sourceText({ ...release, source_name: null })).toBe(`New on ${release.matched_on}`);
    expect(
      sourceText({ ...first!.sources[0]!, source_name: null }),
    ).toBe("A chart by Mara Veil");
  });

  it("counts owned tracks hidden (DEC-092)", () => {
    expect(hiddenLine(HIDDEN.hidden)).toBe("2 owned tracks hidden");
    expect(hiddenLine(1)).toBe("1 owned track hidden");
    expect(hiddenLine(0)).toBe("");
  });

  it("says what a push, a resolve and a discovery did, from their results", () => {
    expect(pushOutcome(fixture.playlist_result as BeatportPlaylistResult)).toBe(
      "Added 2 tracks to “Friday finds” on Beatport. 1 track you own was left out.",
    );
    expect(pushOutcome(fixture.playlist_refused as BeatportPlaylistResult)).toBe(
      "The push stopped because Beatport refused the token for this, before “Friday” was made.",
    );
    expect(
      pushOutcome({ ...(fixture.playlist_result as BeatportPlaylistResult), outcome: "cancelled" }),
    ).toMatch(/^The push stopped when asked, after adding 2 tracks/);
    expect(resolveOutcome(fixture.resolve_result as BeatportResolveResult)).toBe(
      "Read 2 tracks from Beatport.",
    );
    expect(discoveryEnded(fixture.discovery_result as DiscoveryRunResult)).toBe(
      "Discovery found 7 tracks from 3 charts and 2 releases.",
    );
    expect(stoppedBecause(null)).toBe("of an error");
  });

  it("words a busy refusal for a person, and every other as CuePoint did", () => {
    expect(refusalText(fixture.refusal_busy.refusal as DiscoverRefusal)).toBe(
      "A discovery run is already running. It is in the list of runs.",
    );
    expect(refusalText(refusal("DISCOVER_BUSY", { job_type: "beatport_playlist" }))).toMatch(
      /^A push to Beatport is already running/,
    );
    expect(refusalText(refusal("DISCOVER_BUSY", { job_type: "something" }))).toMatch(
      /^Another Discover task is running/,
    );
    expect(refusalText(fixture.refusal_note_too_long.refusal as DiscoverRefusal)).toBe(
      "A note is at most 1000 characters",
    );
  });

  it("offers a resolve for the tracks the engine counted", () => {
    expect(resolvePrompt(OPTIONS.resolve.to_read)).toMatch(
      /^2 matched tracks have not been read from Beatport yet\./,
    );
    expect(resolvePrompt(1)).toMatch(/^1 matched track has not been read/);
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
    expect(RUN_COLUMNS.filter((c) => !c.hiddenByDefault).map((c) => c.header)).toEqual([
      "#",
      "Title",
      "Artists",
      "Label",
      "Released",
      "BPM",
      "Key",
      "Genre",
      "Found in",
      "Owned",
      "Wantlist",
    ]);
  });

  it("draws a run's row, counting its order from one", () => {
    const row = HIDDEN.rows[0]!;
    const cell = (id: string) => RUN_COLUMNS.find((c) => c.id === id)!.render(row);
    expect(cell("position")).toBe("1");
    expect(cell("bpm")).toBe("124.0");
    expect(cell("owned")).toBe("");
    expect(cell("on_wantlist")).toBe("");
    const all = fixture.run_tracks_all.value as unknown as DiscoverRunTracksPage;
    const owned = all.rows.find((r) => r.owned)!;
    const wanted = all.rows.find((r) => r.on_wantlist)!;
    expect(RUN_COLUMNS.find((c) => c.id === "owned")!.render(owned)).toBe("Owned");
    expect(RUN_COLUMNS.find((c) => c.id === "on_wantlist")!.render(wanted)).toBe("Wanted");
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
