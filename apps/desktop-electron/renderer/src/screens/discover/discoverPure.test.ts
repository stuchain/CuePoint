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
import { camelotOf } from "./beatportKey";
import { RUN_COLUMNS, WANTLIST_COLUMNS } from "./beatportColumns";
import { beatportNotice, beatportUsable, refusalState, unusableReason } from "./beatportState";
import {
  artistsText,
  chartsLine,
  discoveryEnded,
  foundLine,
  lookingUpLine,
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
import { chartsWindowText, defaultForm, formProblems, runRequest, type NewRunForm } from "./newRun";

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
      "New search",
      "Results",
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
    ["options_no_token", "Connect your Beatport account", "settings"],
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
    expect(notice.hint).toContain("Your past searches and wantlist still open without it.");
  });

  it("explains the token in plain words, and where to find out how to get one (DSC-3)", () => {
    const notice = beatportNotice("no_token")!;
    expect(notice.hint).toBe(
      "Discover reads Beatport's charts and releases with your Beatport sign-in key (a “token”). " +
        "Paste it in Settings, where “How do I get a token?” shows where to find it. " +
        "Your past searches and wantlist still open without it.",
    );
    const refused = beatportNotice("forbidden")!;
    expect(refused.hint).toContain("Beatport accepted the key but won't allow this action with it.");
    expect(refused.hint).not.toMatch(/scope/i);
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

  it("offers searches and playlists unless the token is missing or refused", () => {
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
  const labels = (list: Array<{ label: string }>) => list.map((a) => a.label);

  it("always shows a run's three actions; those that need rows wait for them (DEC-209)", () => {
    const none = runActions(0, usable);
    expect(labels(none)).toEqual([
      "Add to wantlist",
      "Make a Beatport playlist…",
      "Open on Beatport",
    ]);
    expect(none.map((a) => a.disabled)).toEqual([true, false, true]);
    expect(none[0]!.reason).toBe("Select tracks in the table first.");
    expect(none[2]!.reason).toBe("Select tracks in the table first.");
    const some = runActions(3, usable);
    expect(some.map((a) => a.disabled)).toEqual([false, false, false]);
    expect(some.map((a) => a.reason)).toEqual([null, null, null]);
  });

  it("makes a playlist of every row shown when nothing is selected, and says so", () => {
    const playlist = (count: number, total: number) =>
      runActions(count, { ...usable, total }).find((a) => a.id === "push")!;
    expect(playlist(0, 48).note).toBe("All 48 shown");
    expect(playlist(0, 1).note).toBe("All 1 shown");
    expect(playlist(3, 48).note).toBe("3 selected");
    expect(playlist(0, 0)).toMatchObject({ disabled: true, reason: "Nothing to put in a playlist." });
    expect(playlist(0, 0).note).toBeNull();
  });

  it("opens at most ten pages at once", () => {
    const open = (count: number) => runActions(count, usable).find((a) => a.id === "open")!;
    expect(open(MAX_OPEN_PAGES).disabled).toBe(false);
    expect(open(MAX_OPEN_PAGES + 1).disabled).toBe(true);
    expect(open(MAX_OPEN_PAGES + 1).reason).toBe("Opens at most 10 pages at once.");
  });

  it("does not offer a playlist without a token Beatport accepts", () => {
    const push = runActions(2, { pushable: false, pushReason: "Needs a token.", total: 5 })[1]!;
    expect(push).toMatchObject({ id: "push", disabled: true, reason: "Needs a token." });
  });

  it("always shows the wantlist's actions, with the reason for each that waits", () => {
    const none = wantlistActions([], usable);
    expect(none.map((a) => a.id)).toEqual(["push", "open", "note", "bought", "remove"]);
    expect(none.map((a) => a.disabled)).toEqual([false, true, true, true, true]);
    expect(none[2]!.reason).toBe("Select one track to edit its note.");
    expect(none[4]!.reason).toBe("Select tracks in the table first.");
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
    expect(two[2]!.reason).toBe("Select one track to edit its note.");
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

describe("the New search form", () => {
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

  it("says the engine's default 30-day window as 30 days, and other windows by their dates", () => {
    expect(chartsWindowText(form(), OPTIONS.defaults)).toBe("Charts from the last 30 days.");
    expect(chartsWindowText(form({ chartsFrom: "2026-09-01" }), OPTIONS.defaults)).toBe(
      `Charts from 2026-09-01 to ${OPTIONS.defaults.charts_to}.`,
    );
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
    [{ artists: "none", labels: "none" }, "A search needs artists or labels to look for."],
    [
      { artists: "none", genreIds: [5] },
      "Charts come from your artists. Choose some artists, or untick every genre.",
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

  it("titles a search by its date, and counts what it found on one line (DSC-2, DSC-6)", () => {
    expect(searchTitle(FINISHED.started_at)).toMatch(/^Search of /);
    expect(searchTitle(FINISHED.started_at)).not.toMatch(/run/i);
    expect(foundLine(40, 12, true)).toBe("40 found · 12 already in your library (hidden)");
    expect(foundLine(40, 12, false)).toBe("40 found · 12 already in your library");
    expect(foundLine(40, 0, true)).toBe("40 found");
    expect(foundLine(1, 1, true)).toBe("1 found · 1 already in your library (hidden)");
  });

  it("says what a push, a resolve and a discovery did, from their results", () => {
    expect(pushOutcome(fixture.playlist_result as BeatportPlaylistResult)).toBe(
      "Made “Friday finds” on Beatport with 2 tracks. 1 track already in your library was left out.",
    );
    expect(pushOutcome(fixture.playlist_refused as BeatportPlaylistResult)).toBe(
      "Making the playlist stopped because Beatport refused the token for this, before “Friday” was made.",
    );
    expect(
      pushOutcome({ ...(fixture.playlist_result as BeatportPlaylistResult), outcome: "cancelled" }),
    ).toMatch(/^Making the playlist stopped when asked, after adding 2 tracks/);
    expect(resolveOutcome(fixture.resolve_result as BeatportResolveResult)).toBe(
      "Looked up 2 tracks on Beatport.",
    );
    expect(discoveryEnded(fixture.discovery_result as DiscoveryRunResult)).toBe(
      "The search found 7 tracks from 3 charts and 2 releases.",
    );
    expect(stoppedBecause(null)).toBe("of an error");
  });

  it("words a busy refusal for a person, and every other as CuePoint did", () => {
    expect(refusalText(fixture.refusal_busy.refusal as DiscoverRefusal)).toBe(
      "A search is already running. It is in the Results tab.",
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
    expect(resolvePrompt(OPTIONS.resolve.to_read)).toBe(
      "2 of your matched tracks still need their Beatport artist and label looked up. " +
        "This makes artist pages and searches more accurate.",
    );
    expect(resolvePrompt(1)).toMatch(/^1 of your matched tracks still needs their Beatport/);
    expect(lookingUpLine(2)).toBe("Looking up 2 tracks on Beatport…");
    expect(lookingUpLine(1)).toBe("Looking up 1 track on Beatport…");
    expect(lookingUpLine(0)).toBe("Looking up tracks on Beatport…");
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
    expect(RUN_COLUMNS.filter((c) => !c.hiddenByDefault).map((c) => c.header)).toEqual([
      "#",
      "Title",
      "Artists",
      "Label",
      "Released",
      "BPM",
      "Key",
      "Genre",
      "Why it's here",
      "In your library",
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

  it("draws a row's key as Camelot, and the wheel is told the same code", () => {
    const row = { ...HIDDEN.rows[0]!, key: "Am" };
    expect(RUN_COLUMNS.find((c) => c.id === "key")!.render(row)).toBe("8A");
    expect(RUN_COLUMNS.find((c) => c.id === "key")!.render({ ...row, key: null })).toBe("");
  });
});
