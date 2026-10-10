/**
 * The Artist, Label and Similar pages' pure logic (DISCOVER-11).
 *
 * Addresses, the words each page says, a credit split into links, the
 * operations list's Discover entries, and the pages' columns — every one over
 * the engine's own answers (`discoverPages.fixture.json`, produced by
 * `test_discover_pages_fixture.py`) wherever the engine is what is described.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  EntityBeatportHalf,
  EntityPage,
  LibraryTrackDetail,
  SimilarReason,
  SimilarTracks,
  TrackCreditLink,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import {
  destinationToRemember,
  resolveLaunchDestination,
} from "../../components/shell/lastDestination";
import { findOwningDestination } from "../../components/shell/navRegistry";
import { creditSegments } from "../library/creditSegments";
import { beatportNameKey, describeRule } from "../library/filterText";
import { creditsFor, discoverMenuItems, pageArtists } from "../library/libraryDiscover";
import { libraryOpening, libraryRulesState } from "../library/libraryLink";
import { ENTITY_COLUMNS, RUN_COLUMNS } from "./beatportColumns";
import {
  beatportRef,
  entityPath,
  nameRef,
  similarLibraryState,
  pageOfRule,
  similarPath,
  trackIdFromRoute,
} from "./discoverLinks";
import {
  beatportHeadline,
  consideredLine,
  facetValueText,
  freshnessLine,
  identityHint,
  identityLabel,
  pageTitle,
  redirectedLine,
  relatedKind,
  relatedTitle,
  seedFacts,
  tracksLine,
  yearsText,
} from "./entityFormat";
import { libraryRowMenuItems } from "./libraryRowMenu";
import { SIMILAR_COLUMNS, reasonsText } from "./similarColumns";
import { describeSimilarReason, matchBand } from "./similarReasons";
import pages from "./discoverPages.fixture.json";
import reasonsFixture from "./similarReasons.fixture.json";

const page = (name: keyof typeof pages) =>
  (pages[name] as { value: unknown }).value as EntityPage;
const half = (name: keyof typeof pages) =>
  (pages[name] as { value: unknown }).value as EntityBeatportHalf;
const detail = (name: "detail_resolved" | "detail_unresolved") =>
  pages[name] as unknown as LibraryTrackDetail;

describe("addresses (DEC-094: routes under Discover)", () => {
  it("writes a page's reference into its address, escaped, and reads it back", () => {
    expect(entityPath("artist", "bp:301001")).toBe("/discover/artist/bp%3A301001");
    expect(entityPath("label", "name:AC/DC & Co")).toBe(
      "/discover/label/name%3AAC%2FDC%20%26%20Co",
    );
    expect(decodeURIComponent(entityPath("label", "name:AC/DC").split("/").pop()!)).toBe(
      "name:AC/DC",
    );
    expect(similarPath(12)).toBe("/discover/similar/12");
  });

  it("writes references as the engine does", () => {
    expect(nameRef("  Mara Veil ")).toBe("name:Mara Veil");
    expect(beatportRef(40211)).toBe("bp:40211");
  });

  it("reads a seed from an address only when it is a track id", () => {
    expect(trackIdFromRoute("12")).toBe(12);
    for (const bad of [undefined, "", "0", "012", "-3", "1.5", "abc", "99999999999999999999"]) {
      expect(trackIdFromRoute(bad), String(bad)).toBeNull();
    }
  });

  it("finds the page a filter clause names, and only when it names one", () => {
    expect(pageOfRule({ field: "artist_name", operator: "is", value: "Mara Veil" })).toEqual({
      kind: "artist",
      ref: "name:Mara Veil",
    });
    expect(pageOfRule({ field: "label_name", operator: "is", value: "Cold Room" })).toEqual({
      kind: "label",
      ref: "name:Cold Room",
    });
    expect(pageOfRule({ field: "beatport_artist", operator: "is", value: 301001 })).toEqual({
      kind: "artist",
      ref: "bp:301001",
    });
    expect(pageOfRule({ field: "beatport_label", operator: "is", value: "40211" })).toEqual({
      kind: "label",
      ref: "bp:40211",
    });
    for (const rule of [
      { field: "artist_name", operator: "is_not", value: "Mara Veil" },
      { field: "artist_name", operator: "any_of", value: ["A", "B"] },
      { field: "artist_name", operator: "is", value: "  " },
      { field: "beatport_artist", operator: "is", value: 0 },
      { field: "beatport_label", operator: "is", value: "x" },
      { field: "artist", operator: "is", value: "Mara Veil" },
      { field: "genre", operator: "is", value: "House" },
    ]) {
      expect(pageOfRule(rule), JSON.stringify(rule)).toBeNull();
    }
  });

  it("keeps Discover as the destination on its pages, and nothing else nested", () => {
    for (const path of [
      "/discover/artist/bp%3A1",
      "/discover/label/name%3Ax",
      "/discover/similar/3",
    ]) {
      expect(findOwningDestination(path)?.id, path).toBe("discover");
      expect(destinationToRemember(path)?.id, path).toBe("discover");
    }
    expect(resolveLaunchDestination("discover").id).toBe("discover");
    expect(destinationToRemember("/discoverx")).toBeNull();
    expect(destinationToRemember("/library/anything")).toBeNull();
    expect(destinationToRemember("/settings/x")).toBeNull();
  });
});

describe("what a page says (DEC-095: it says which identity it is)", () => {
  it("names its identity", () => {
    expect(identityLabel(page("page_artist_id"))).toBe("Linked to Beatport");
    expect(identityLabel(page("page_label_id"))).toBe("Linked to Beatport");
    expect(identityLabel(page("page_artist_name"))).toBe("Your tracks by this name");
    expect(identityLabel(page("page_label_name"))).toBe("Your tracks by this name");
  });

  it("explains a name group, and an id with the spellings it gathers", () => {
    expect(identityHint(page("page_artist_name"))).toContain(
      "CuePoint has not linked this artist to Beatport yet",
    );
    expect(identityHint(page("page_label_name"))).toContain("whose label spells this name");
    expect(identityHint(page("page_artist_name"))).toContain("whose credits spell this name");
    expect(identityHint(page("page_artist_id"))).toContain("credited as Mara Veil");
    expect(identityHint({ ...page("page_artist_id"), names: [] })).toBe(
      "Linked to Beatport, from your tracks matched there.",
    );
    expect(redirectedLine("artist")).toContain("linked this artist to Beatport");
    // No id is ever said aloud (DSC-9).
    for (const words of [
      identityHint(page("page_artist_name")),
      identityHint(page("page_artist_id")),
      redirectedLine("label"),
    ]) {
      expect(words).not.toMatch(/\bid\b/);
    }
  });

  it("titles a page by the engine's display name, and never by an id (DSC-9)", () => {
    expect(pageTitle(page("page_artist_id"))).toBe("Mara Veil");
    expect(pageTitle(page("page_label_name"))).toBe("Cold Room");
    expect(pageTitle({ display_name: "Unknown artist" })).toBe("Unknown artist");
    for (const name of Object.keys(pages).filter((key) => key.startsWith("page_"))) {
      const shown = (pages[name as keyof typeof pages] as { value: EntityPage | null }).value;
      if (shown) expect(pageTitle(shown)).not.toMatch(/\d{4,}/);
    }
  });

  it("says the header's facts", () => {
    expect(tracksLine(1)).toBe("1 track in your library");
    expect(tracksLine(page("page_artist_id").library.tracks)).toBe("2 tracks in your library");
    expect(yearsText({ first: 2024, last: 2025 })).toBe("2024–2025");
    expect(yearsText({ first: 2020, last: 2020 })).toBe("2020");
    expect(yearsText({ first: null, last: 2020 })).toBe("2020");
    expect(yearsText({ first: null, last: null })).toBeNull();
    expect(relatedTitle("artist")).toBe("Labels");
    expect(relatedTitle("label")).toBe("Artists");
    expect(relatedKind("artist")).toBe("label");
    expect(relatedKind("label")).toBe("artist");
    expect(facetValueText({ value: "House", count: 1200 })).toBe("House (1,200)");
  });

  it("heads every Beatport state it can be answered", () => {
    const heads = Object.fromEntries(
      (Object.keys(pages) as Array<keyof typeof pages>)
        .filter((name) => name.startsWith("half_"))
        .map((name) => [name, beatportHeadline(half(name))]),
    );
    expect(heads).toEqual({
      half_artist_ok: "On Beatport",
      half_label_ok: "On Beatport",
      half_label_owned_hidden: "On Beatport",
      half_found_by_name: "On Beatport",
      half_no_token: "Connect your Beatport account",
      half_rejected: "Beatport rejected the token",
      half_forbidden: "Beatport refused this token",
      half_rate_limited: "Beatport is limiting requests",
      half_unavailable: "Beatport cannot be reached",
      half_not_resolved_resolvable: "Not linked to Beatport yet",
      half_not_resolved: "Not linked to Beatport yet",
      half_shared: "Several Beatport artists share this name",
      half_not_on_beatport: "No match",
    });
  });

  it("says where a listing came from", () => {
    expect(freshnessLine(half("half_label_ok"))).toBe("Just read from Beatport.");
    expect(freshnessLine({ ...half("half_label_ok"), from_cache: true })).toBe(
      "Saved earlier from Beatport. Check Beatport again for the latest.",
    );
    expect(freshnessLine(half("half_no_token"))).toBeNull();
  });

  it("describes a seed and what its suggestions were compared with", () => {
    const seed = { ...detail("detail_resolved").track, effective_key: "8A" };
    expect(seedFacts(seed)).toBe("124.0 BPM · 8A · House");
    expect(seedFacts({ ...seed, effective_bpm: 126 })).toBe("126.0 BPM · 8A · House");
    // Rekordbox's key is never the fallback (DEC-201).
    expect(seedFacts({ ...seed, effective_key: null })).toBe("124.0 BPM · House");
    expect(seedFacts({ bpm: null, genre: null, effective_key: null })).toBe("");
    const similar = (pages.similar as { value: unknown }).value as SimilarTracks;
    expect(consideredLine(similar)).toBe(`Compared with ${similar.considered} tracks in your library.`);
    expect(consideredLine({ considered: 1, duplicates_excluded: 2 })).toBe(
      "Compared with 1 track in your library. 2 copies of this track left out.",
    );
  });
});

describe("a credit as links (the Inspector's)", () => {
  const link = (name: string, ref = `name:${name.toLowerCase()}`): TrackCreditLink => ({
    kind: "artist",
    name,
    role: "artist",
    ref,
    identity: ref.startsWith("bp:") ? "beatport" : "name",
  });

  it("keeps the credit's own words and links each name where it stands", () => {
    const segments = creditSegments("Mara Veil, DJEFF feat. Kiko", [
      link("Mara Veil"),
      link("DJEFF"),
      link("Kiko"),
    ]);
    expect(segments.map((segment) => [segment.text, segment.link?.name ?? null])).toEqual([
      ["Mara Veil", "Mara Veil"],
      [", ", null],
      ["DJEFF", "DJEFF"],
      [" feat. ", null],
      ["Kiko", "Kiko"],
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe("Mara Veil, DJEFF feat. Kiko");
  });

  it("finds each name after the one before it, so a name inside another is not taken", () => {
    const segments = creditSegments("Kikoman, Kiko", [link("Kikoman"), link("Kiko")]);
    expect(segments.filter((segment) => segment.link).map((segment) => segment.text)).toEqual([
      "Kikoman",
      "Kiko",
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe("Kikoman, Kiko");
  });

  it("adds a name the text does not spell as the split did, rather than losing it", () => {
    const segments = creditSegments("Mara  Veil", [link("Mara Veil")]);
    expect(segments.map((segment) => segment.text)).toEqual(["Mara  Veil", ", ", "Mara Veil"]);
    expect(segments[2].link?.name).toBe("Mara Veil");
    expect(creditSegments("", [link("A")]).map((segment) => segment.text)).toEqual(["A"]);
    expect(creditSegments("Just text", [])).toEqual([{ text: "Just text" }]);
  });

  it("splits the engine's own answer for a resolved track", () => {
    const { track, credits } = detail("detail_resolved");
    const segments = creditSegments(track.artist, credits!.artists);
    expect(segments.filter((segment) => segment.link).map((segment) => segment.link!.ref)).toEqual([
      "bp:301001",
      "name:kiko",
    ]);
  });
});

describe("the operations list's Discover entries", () => {
  const credits = (name: "detail_resolved" | "detail_unresolved") =>
    detail(name).credits as TrackCreditLinks;
  const handlers = () => ({ onSimilar: vi.fn(), onOpenPage: vi.fn() });

  it("offers nothing for no track or several", () => {
    expect(discoverMenuItems({ count: 0, credits: null }, handlers())).toEqual([]);
    expect(discoverMenuItems({ count: 2, credits: credits("detail_resolved") }, handlers())).toEqual([]);
  });

  it("keeps its shape before the credits are known, with the pages disabled", () => {
    const items = discoverMenuItems({ count: 1, credits: null }, handlers());
    expect(items.map((item) => [item.label, Boolean(item.disabled)])).toEqual([
      ["Similar tracks", false],
      ["Artist page", true],
      ["Label page", true],
    ]);
    expect(items[0].separatorBefore).toBe(true);
  });

  it("opens Similar tracks, each artist's page and the label's", () => {
    const on = handlers();
    const items = discoverMenuItems({ count: 1, credits: credits("detail_resolved") }, on);
    items[0].onSelect();
    expect(on.onSimilar).toHaveBeenCalledTimes(1);
    const artists = items[1];
    expect(artists.items?.map((item) => item.label)).toEqual(["Mara Veil", "Kiko"]);
    artists.items![0].onSelect();
    artists.items![1].onSelect();
    items[2].onSelect();
    expect(on.onOpenPage.mock.calls).toEqual([
      ["artist", "bp:301001"],
      ["artist", "name:kiko"],
      ["label", "bp:40211"],
    ]);
  });

  it("names remixers after the artists, and a single artist without a submenu", () => {
    const on = handlers();
    const items = discoverMenuItems({ count: 1, credits: credits("detail_unresolved") }, on);
    expect(items[1].items?.map((item) => item.label)).toEqual(["Kiko", "DJEFF (remixer)"]);
    const one = discoverMenuItems(
      { count: 1, credits: { ...credits("detail_unresolved"), remixers: [] } },
      on,
    );
    expect(one[1].items).toBeUndefined();
    one[1].onSelect();
    expect(on.onOpenPage).toHaveBeenCalledWith("artist", "name:kiko");
  });

  it("lists a person once however many roles they have, and disables what a track lacks", () => {
    const self = credits("detail_unresolved").artists[0];
    expect(
      pageArtists({ artists: [self], remixers: [{ ...self, role: "remixer" }], label: null }),
    ).toHaveLength(1);
    const items = discoverMenuItems(
      { count: 1, credits: { artists: [], remixers: [], label: null } },
      handlers(),
    );
    expect(items[1].disabled).toBe(true);
    expect(items[2].disabled).toBe(true);
  });

  it("reads the credits from the Inspector's detail when it is that track's, else asks", async () => {
    const held = detail("detail_resolved");
    const read = vi.fn(async () => detail("detail_unresolved"));
    (window as unknown as { cuepoint: unknown }).cuepoint = { getLibraryTrack: read };
    await expect(creditsFor(held.track.id!, held)).resolves.toBe(held.credits);
    expect(read).not.toHaveBeenCalled();
    await expect(creditsFor(3, held)).resolves.toEqual(detail("detail_unresolved").credits);
    expect(read).toHaveBeenCalledWith({ trackId: 3 });
    read.mockRejectedValueOnce(new Error("gone"));
    await expect(creditsFor(3, null)).resolves.toBeNull();
    (window as unknown as { cuepoint: unknown }).cuepoint = undefined;
    await expect(creditsFor(3, null)).resolves.toBeNull();
  });

  it("puts playback first, as the Library's menu does", () => {
    const play = { onPlay: vi.fn(), onPlayNext: vi.fn(), onAddToQueue: vi.fn() };
    expect(libraryRowMenuItems(0, play)).toEqual([]);
    expect(libraryRowMenuItems(1, play).map((item) => item.label)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
    ]);
    const many = libraryRowMenuItems(1200, play, [{ id: "x", label: "X", onSelect: vi.fn() }]);
    expect(many.map((item) => item.label)).toEqual(["Play 1,200 tracks", "Play next", "Add to queue", "X"]);
  });
});

describe("names for a page's rules in the Library", () => {
  const vocabulary = {
    fields: [
      { name: "beatport_artist", label: "Beatport artist", type: "beatport", operators: ["is"] },
    ],
    operators: { is: { arity: "single" as const } },
    facetable: [],
    sortable: [],
  } as unknown as Parameters<typeof describeRule>[0];
  const rule = { field: "beatport_artist", operator: "is", value: 301001 };

  it("reads an id rule as the name the page knew, and as the id without it", () => {
    const names = { beatport: new Map([[beatportNameKey("beatport_artist", 301001), "Mara Veil"]]) };
    expect(describeRule(vocabulary, rule, names)).toBe("Beatport artist is Mara Veil");
    expect(describeRule(vocabulary, rule)).toBe("Beatport artist is 301001");
  });

  it("carries the names with the rules to the Library, and only well-formed ones", () => {
    const rules = page("page_artist_id").rules;
    const state = libraryRulesState(rules, { "beatport_artist:301001": "Mara Veil" });
    expect(libraryOpening({ state, key: "k" })).toEqual({
      rules,
      token: "k",
      names: { "beatport_artist:301001": "Mara Veil" },
    });
    expect(libraryRulesState(rules, {})).toEqual(libraryRulesState(rules));
    expect(libraryOpening({ state: libraryRulesState(rules), key: "k" })).toEqual({ rules, token: "k" });
    const tampered = { ...state, cuepointLibraryRuleNames: { a: 3, b: " ", c: "Kiko" } };
    expect(libraryOpening({ state: tampered, key: "k" })?.names).toEqual({ c: "Kiko" });
    const broken = { ...state, cuepointLibraryRuleNames: ["x"] };
    expect(libraryOpening({ state: broken, key: "k" })?.names).toBeUndefined();
  });
});

describe("the pages' columns", () => {
  it("draws every reason the engine can emit, in words (DISCOVER-08, from the other side)", () => {
    const every = (reasonsFixture as unknown as { reasons: SimilarReason[] }).reasons;
    expect(every.length).toBeGreaterThanOrEqual(10);
    const reasonsColumn = SIMILAR_COLUMNS.find((column) => column.id === "reasons")!;
    for (const reason of every) {
      const row = { suggestion: { track_id: 1, score: reason.points, reasons: [reason] } };
      const text = reasonsColumn.text!(row as never);
      expect(text, JSON.stringify(reason)).toBe(describeSimilarReason(reason));
      expect(text).not.toBe("");
    }
    expect(reasonsText(every.slice(0, 2))).toBe(
      `${describeSimilarReason(every[0])} · ${describeSimilarReason(every[1])}`,
    );
  });

  it("orders suggestions as the engine did: no column sorts them", () => {
    // The reasons beside the title, where a narrow pane still shows them.
    expect(SIMILAR_COLUMNS.slice(0, 3).map((column) => column.id)).toEqual([
      "title",
      "reasons",
      "score",
    ]);
    expect(SIMILAR_COLUMNS.filter((column) => column.sortKey)).toEqual([]);
    const similar = (pages.similar as { value: unknown }).value as SimilarTracks;
    const score = SIMILAR_COLUMNS.find((column) => column.id === "score")!;
    expect(score.header).toBe("Match");
    expect(score.text!({ suggestion: similar.suggestions[0] } as never)).toBe(
      matchBand(similar.suggestions[0].score),
    );
  });

  it("gives a page's Beatport half the run's columns without the run's", () => {
    expect(ENTITY_COLUMNS.map((column) => column.id)).toEqual([
      ...RUN_COLUMNS.map((column) => column.id).filter(
        (id) => id !== "position" && id !== "sources",
      ),
    ]);
    expect(ENTITY_COLUMNS.filter((column) => column.sortKey)).toEqual([]);
    const row = half("half_label_ok").page!.rows[0];
    const owned = ENTITY_COLUMNS.find((column) => column.id === "owned")!;
    expect(owned.header).toBe("In your library");
    expect(owned.render({ ...row, owned: true })).toBe("In your library");
    expect(owned.render({ ...row, owned: false })).toBe("");
  });
});

describe("Similar tracks' Open in Library", () => {
  const seed = { id: 1, title: "Build" };
  const opened = (shown: number[], selected: number[]) => {
    const { state, title } = similarLibraryState(seed, shown, selected);
    return { opening: libraryOpening({ state, key: "k" }), title };
  };

  it("carries the seed and every shown suggestion when nothing is selected", () => {
    const { opening, title } = opened([2, 3, 4], []);
    expect(opening?.rules.rules[0]).toEqual({ field: "track", operator: "any_of", value: [1, 2, 3, 4] });
    expect(opening?.names).toEqual({ "rule:track:[1,2,3,4]": "Similar to “Build” (4 tracks)" });
    expect(title).toBe("Opens these 4 tracks in the Library");
  });

  it("carries the seed and only the selected suggestions", () => {
    const { opening, title } = opened([2, 3, 4], [4, 2]);
    expect(opening?.rules.rules[0].value).toEqual([1, 4, 2]);
    expect(opening?.names).toEqual({ "rule:track:[1,4,2]": "Similar to “Build” (3 tracks)" });
    expect(title).toBe("Opens the 2 selected tracks and “Build” in the Library");
  });

  it("does not repeat the seed", () => {
    expect(opened([1, 2, 2], []).opening?.rules.rules[0].value).toEqual([1, 2]);
    expect(opened([2], [1, 2]).opening?.rules.rules[0].value).toEqual([1, 2]);
  });

  it("is just the seed when there are no suggestions", () => {
    const { opening, title } = opened([], []);
    expect(title).toBe("Opens “Build” in the Library");
    expect(opening?.rules.rules[0].value).toEqual([1]);
    expect(opening?.names).toEqual({ "rule:track:[1]": "Similar to “Build” (1 track)" });
  });
});
