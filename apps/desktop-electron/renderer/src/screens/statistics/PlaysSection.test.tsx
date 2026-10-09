/**
 * The Plays section (STATS-05, DEC-166, DEC-167).
 *
 * The page against a faked bridge, because the section's choices are the page's reads: each
 * length and each "since" is the request the route gets (with the UTC offset in effect at the
 * local midnight of the day asked about), the rows are real buttons that open the Library on
 * exactly what they counted, and a kept list is a Collection named for the choice that made it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { StatisticsPlays } from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { reportUnexpected } from "../../reporting/reporting";
import { PlaysSection } from "./PlaysSection";
import {
  DEFAULT_PLAYS_CHOICE,
  PLAYS_STORAGE_KEY,
  collectionName,
  isPlaysSince,
  loadPlaysChoice,
  sinceDay,
  offsetAtMidnight,
  playsParams,
} from "./playsChoice";
import { StatisticsScreen } from "./StatisticsScreen";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
const mock = (name: string) => bridge[name] as Fn;

const SPREAD = { buckets: [], unknown: { label: "Unknown", count: 0, rules: null }, total: 0 };
const NOW = new Date(2026, 10, 20, 12, 0, 0); // Nov 20, 2026, local noon
const HISTORY_FROM = "2026-10-08T12:00:00Z";
const LAST_READ = "2026-11-02T12:00:00Z";

const rules = (field: string, value: unknown) => ({
  match: "all" as const,
  rules: [{ field, operator: "is", value }],
});
const count = (n: number, field = "play_count") => ({ count: n, rules: rules(field, n) });

function plays(overrides: Partial<StatisticsPlays> = {}): StatisticsPlays {
  return {
    since: null,
    since_clamped: false,
    history_from: HISTORY_FROM,
    last_read: LAST_READ,
    last_read_id: 7,
    tracks: [
      { id: 812, title: "Alpha", artist: "B", plays: 14 },
      { id: 90, title: "Bravo", artist: "C", plays: 7 },
      { id: 4, title: "Charlie", artist: "B", plays: 1 },
    ],
    artists: [
      {
        name: "B",
        name_key: "b",
        plays: 15,
        tracks: 2,
        rules: rules("artist_name", "B"),
        opens_more: false,
      },
    ],
    labels: [
      {
        name: "Warm",
        label_key: "warm",
        plays: 21,
        tracks: 2,
        rules: rules("label_name", "Warm"),
        opens_more: false,
      },
    ],
    never_played: count(3120),
    unknown: count(41),
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function install(overrides: Record<string, unknown> = {}) {
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: false, track_count: 4000 }),
    getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: [], total: 0 }),
    getCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    getStatisticsPlays: vi.fn().mockResolvedValue(plays()),
    getStatisticsSpreads: vi.fn().mockResolvedValue({
      scope: "library",
      total: 0,
      genre: SPREAD,
      tempo: SPREAD,
      year: SPREAD,
      date_added: SPREAD,
      rating: SPREAD,
      loudness: SPREAD,
    }),
    createCollectionFrom: vi.fn(),
    getStatisticsHealth: vi.fn().mockResolvedValue({
      scope: "library",
      total: 0,
      files: { present: count(0), missing: count(0) },
    }),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <StatisticsScreen />
      <Where />
    </MemoryRouter>,
  );
}

async function section() {
  const region = await screen.findByRole("region", { name: "Plays" });
  await within(region).findByRole("list", { name: "Most played" });
  return region;
}

const lastAsked = () => {
  const calls = mock("getStatisticsPlays").mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
};

const navigated = () => {
  const where = screen.getByTestId("where");
  return { path: where.textContent, state: JSON.parse(where.dataset.state ?? "null") };
};

describe("the Plays section (STATS-05)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    install();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  describe("the length of the list", () => {
    it.each([10, 25, 50, 100, 200])("asks the route for the top %i and remembers it", async (n) => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      if (n !== 10) await user.selectOptions(within(region).getByLabelText("Top"), `Top ${n}`);

      await waitFor(() => expect(lastAsked()).toMatchObject({ limit: n, scope: "library" }));
      expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}")).toEqual(
        n === 10 ? {} : { limit: n, since: "all" },
      );
    });

    it("starts from what was remembered", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 50, since: "30d" }));
      renderPage();
      const region = await section();

      expect(within(region).getByLabelText("Top")).toHaveValue("50");
      expect(within(region).getByLabelText("Since")).toHaveValue("30d");
      expect(lastAsked()).toMatchObject({ limit: 50, since: "2026-10-21", scope: "library" });
    });

    it("ignores a remembered choice it does not know", () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 7, since: "soon" }));
      expect(loadPlaysChoice()).toEqual(DEFAULT_PLAYS_CHOICE);
      window.localStorage.setItem(PLAYS_STORAGE_KEY, "not json");
      expect(loadPlaysChoice()).toEqual(DEFAULT_PLAYS_CHOICE);
    });
  });

  describe("the since choices", () => {
    it.each([
      ["7d", "The last 7 days", "2026-11-13"],
      ["30d", "The last 30 days", "2026-10-21"],
      ["90d", "The last 90 days", "2026-08-22"],
      ["year", "The last year", "2025-11-20"],
    ])("%s counts from %s", async (value, label, day) => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Since"), label);

      await waitFor(() => expect(lastAsked()).toMatchObject({ since: day, limit: 10 }));
      expect(lastAsked().tz).toMatch(/^[+-]\d\d:\d\d$/);
      expect(lastAsked()).not.toHaveProperty("sinceRead");
      expect(within(region).getByLabelText("Since")).toHaveValue(value);
    });

    it("counts from your last refresh by the id of the last read", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Since"), "Your last refresh");

      await waitFor(() => expect(lastAsked()).toMatchObject({ sinceRead: "7", limit: 10 }));
      expect(lastAsked()).not.toHaveProperty("since");
      expect(lastAsked()).not.toHaveProperty("tz");
    });

    it("asks again with the newest read when a refresh has happened since", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      const window7 = [{ id: 1, title: "Window seven", artist: "A", plays: 3 }];
      const window8 = [{ id: 2, title: "Window eight", artist: "A", plays: 2 }];
      let refreshed = false;
      const read = vi.fn((params: { sinceRead?: string }) => {
        // The route's newest read is 7 until a refresh happens, then 8. Asked about a read
        // that is no longer the newest, it still answers with the newest one's id.
        const newest = refreshed ? 8 : 7;
        if (params.sinceRead === undefined) return Promise.resolve(plays({ last_read_id: newest }));
        return Promise.resolve(
          plays({
            last_read_id: newest,
            tracks: params.sinceRead === "8" ? window8 : window7,
          }),
        );
      });
      install({ getStatisticsPlays: read });
      renderPage();
      const region = await section();

      expect(read.mock.calls[0]![0]).not.toHaveProperty("sinceRead");
      expect(read.mock.calls[read.mock.calls.length - 1]![0]).toMatchObject({ sinceRead: "7" });
      expect(
        await within(region).findByRole("button", { name: "1. Window seven by A, 3 plays" }),
      ).toBeVisible();

      refreshed = true;
      act(() => announceLibraryChange());

      expect(
        await within(region).findByRole("button", { name: "1. Window eight by A, 2 plays" }),
      ).toBeVisible();
      expect(read.mock.calls[read.mock.calls.length - 1]![0]).toMatchObject({ sinceRead: "8" });
      expect(within(region).queryByRole("button", { name: /Window seven/ })).toBeNull();
    });

    it("forgets a read the route no longer knows and learns the newest again", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      const gone = Object.assign(new Error("No read with id 7"), { status: 404, code: "NOT_FOUND" });
      const read = vi
        .fn()
        .mockResolvedValueOnce(plays({ last_read_id: 7 })) // learns 7
        .mockRejectedValueOnce(gone) // asked about 7: gone
        .mockResolvedValueOnce(plays({ last_read_id: 9 })) // learns 9
        .mockResolvedValue(plays({ last_read_id: 9 }));
      install({ getStatisticsPlays: read });
      renderPage();
      await section();

      await waitFor(() =>
        expect(read.mock.calls.map(([p]) => (p as { sinceRead?: string }).sinceRead)).toEqual([
          undefined,
          "7",
          undefined,
          "9",
        ]),
      );
      expect(reportUnexpected).not.toHaveBeenCalled();
    });

    it("counts all time without a date", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "7d" }));
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Since"), "All time");

      await waitFor(() => expect(lastAsked()).toEqual({ limit: 10, scope: "library" }));
    });

    it("counts from a date, with the offset in effect at that date's own midnight", async () => {
      // Summer time (UTC+02:00) from April to October, winter time (UTC+01:00) otherwise,
      // so today (November) and the date asked about (September) disagree.
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockImplementation(function (this: Date) {
        const month = this.getMonth();
        return month >= 3 && month <= 9 ? -120 : -60;
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Since"), "A date…");
      // Until a date is typed the list stays as it was.
      expect(lastAsked()).toEqual({ limit: 10, scope: "library" });
      await user.type(within(region).getByLabelText("Since date"), "2026-09-01");

      await waitFor(() =>
        expect(lastAsked()).toEqual({
          limit: 10,
          since: "2026-09-01",
          tz: "+02:00",
          scope: "library",
        }),
      );
    });

    it("formats the offset in hours and minutes, east and west", () => {
      const offset = vi.spyOn(Date.prototype, "getTimezoneOffset");
      offset.mockReturnValue(-330);
      expect(offsetAtMidnight("2026-09-01")).toBe("+05:30");
      offset.mockReturnValue(300);
      expect(offsetAtMidnight("2026-01-01")).toBe("-05:00");
      offset.mockReturnValue(0);
      expect(offsetAtMidnight("2026-01-01")).toBe("+00:00");
      expect(playsParams({ limit: 25, since: "date:2026-01-01" }, null)).toEqual({
        limit: 25,
        since: "2026-01-01",
        tz: "+00:00",
      });
    });

    it("says where a date before the history was clamped to", async () => {
      window.localStorage.setItem(
        PLAYS_STORAGE_KEY,
        JSON.stringify({ limit: 10, since: "date:2026-01-01" }),
      );
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ since: "2026-01-01", since_clamped: true })),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByRole("status")).toHaveTextContent(
        "Your play history starts on Oct 8, so the counts begin there rather than on Jan 1, 2026.",
      );
    });

    it("says nothing about a clamp when there was none", async () => {
      renderPage();
      const region = await section();

      expect(within(region).queryByText(/play history starts on/)).toBeNull();
    });
  });

  describe("the rows", () => {
    it("lists the tracks in order as buttons named for what they say", async () => {
      renderPage();
      const region = await section();
      const list = within(region).getByRole("list", { name: "Most played" });

      expect(within(list).getAllByRole("listitem")).toHaveLength(3);
      expect(
        within(list).getByRole("button", { name: "1. Alpha by B, 14 plays" }),
      ).toBeInTheDocument();
      expect(
        within(list).getByRole("button", { name: "3. Charlie by B, 1 play" }),
      ).toBeInTheDocument();
    });

    it("opens the Library on a track when its row is clicked", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "2. Bravo by C, 7 plays" }));

      expect(navigated()).toEqual({ path: "/library", state: { cuepointLibraryTrack: 90 } });
    });

    it("has a visible button that previews the track", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      const row = { id: 812, title: "Alpha", artist: "B", file_path: "/m/a.mp3" };
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn().mockResolvedValue({ track: row }),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Preview Alpha by B" }));

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: 812 });
      expect(playQueue.mock.calls[0]![0][0]).toMatchObject({ trackId: 812, filePath: "/m/a.mp3" });
      expect(navigated().path).toBe("/statistics");
    });

    it("offers no preview where there is no player", async () => {
      renderPage();
      const region = await section();

      expect(within(region).queryByRole("button", { name: /^Preview / })).toBeNull();
    });

    it("lists the top artists and labels with plays and tracks, and opens their tracks", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      const artists = within(region).getByRole("list", { name: "Top artists" });
      await user.click(within(artists).getByRole("button", { name: "1. B, 15 plays, 2 tracks" }));
      expect(navigated().state).toEqual({
        cuepointLibraryRules: rules("artist_name", "B"),
      });

      const labels = within(region).getByRole("list", { name: "Top labels" });
      await user.click(within(labels).getByRole("button", { name: "1. Warm, 21 plays, 2 tracks" }));
      expect(navigated().state).toEqual({
        cuepointLibraryRules: rules("label_name", "Warm"),
      });
    });

    it("lists no more than ten artists", async () => {
      const many = Array.from({ length: 14 }, (_, i) => ({
        name: `Artist ${i}`,
        name_key: `artist ${i}`,
        plays: 100 - i,
        tracks: 1,
        rules: rules("artist_name", `Artist ${i}`),
        opens_more: false,
      }));
      install({ getStatisticsPlays: vi.fn().mockResolvedValue(plays({ artists: many })) });
      renderPage();
      const region = await section();

      const list = within(region).getByRole("list", { name: "Top artists" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    });

    it("says a since-a-date artist or label opens all of its played tracks", async () => {
      const b = plays().artists[0]!;
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(
            plays({
              since: "2026-09-01",
              artists: [{ ...b, opens_more: true }],
              labels: [{ ...plays().labels[0]!, opens_more: true }],
            }),
          ),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByText(/Shows all of B's played tracks/)).toBeVisible();
      expect(within(region).getByText(/Shows all of Warm's played tracks/)).toBeVisible();
    });

    it("says nothing of the sort all time", async () => {
      renderPage();
      const region = await section();

      expect(within(region).queryByText(/Shows all of/)).toBeNull();
    });
  });

  describe("never played and plays unknown", () => {
    it("shows each count and opens the Library on it", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Never played: 3,120" }));
      expect(navigated().state).toEqual({ cuepointLibraryRules: rules("play_count", 3120) });

      await user.click(within(region).getByRole("button", { name: "Plays unknown: 41" }));
      expect(navigated().state).toEqual({ cuepointLibraryRules: rules("play_count", 41) });
    });

    it("does not offer to open nothing", async () => {
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ never_played: count(0), unknown: count(0) })),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByRole("button", { name: "Never played: 0" })).toBeDisabled();
      expect(within(region).getByRole("button", { name: "Plays unknown: 0" })).toBeDisabled();
    });
  });

  describe("empty and no-history states", () => {
    it("says so when nothing has been played in the library", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: [], artists: [], labels: [] })),
      });
      renderPage();
      const region = await screen.findByRole("region", { name: "Plays" });

      expect(await within(region).findByText("None of these tracks has been played yet.")).toBeVisible();
      expect(within(region).getByRole("button", { name: "Keep as Collection" })).toBeDisabled();
      expect(within(region).getAllByText("No plays to rank.")).toHaveLength(2);
    });

    it("says so when nothing was played in the time chosen", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "7d" }));
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: [], artists: [], labels: [] })),
      });
      renderPage();
      const region = await screen.findByRole("region", { name: "Plays" });

      expect(await within(region).findByText("No plays were recorded in that time.")).toBeVisible();
    });

    it("says there is no history yet, while all-time plays still show", async () => {
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ history_from: null, last_read: null, last_read_id: null })),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByText("Play history starts at your next refresh")).toBeVisible();
      expect(within(region).getByRole("button", { name: "1. Alpha by B, 14 plays" })).toBeVisible();
      expect(within(region).getByText(/No refresh has been recorded yet/)).toBeVisible();
    });

    it("says no refresh has happened when the last refresh is the import", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(
            plays({ last_read: HISTORY_FROM, tracks: [], artists: [], labels: [] }),
          ),
      });
      renderPage();
      const region = await screen.findByRole("region", { name: "Plays" });

      expect(await within(region).findByText(/no refresh since the import/)).toBeVisible();
    });
  });

  describe("the footer", () => {
    it("says when the counts were last read and when history started", async () => {
      renderPage();
      const region = await section();

      expect(
        within(region).getByText("Counts from your refresh on Nov 2. History since Oct 8."),
      ).toBeVisible();
    });

    it("adds the year to a date in another year", async () => {
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ history_from: "2025-10-08T12:00:00Z" })),
      });
      renderPage();
      const region = await section();

      expect(
        within(region).getByText("Counts from your refresh on Nov 2. History since Oct 8, 2025."),
      ).toBeVisible();
    });
  });

  describe("Keep as Collection", () => {
    const made = (name: string) => ({
      collection: { id: 33, name, kind: "collection", parent_id: null },
    });

    it("makes a Collection of the tracks in rank order and says where it went", async () => {
      const create = vi.fn(({ name }: { name: string }) => Promise.resolve(made(name)));
      install({ createCollectionFrom: create });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Keep as Collection" }));

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          name: "Most played, all time (top 10)",
          parent_id: null,
          track_ids: [812, 90, 4],
        }),
      );
      expect(await within(region).findByText(/Kept 3 tracks in rank order as/)).toHaveTextContent(
        "Kept 3 tracks in rank order as “Most played, all time (top 10)”, in Collections in the Library.",
      );
      await user.click(within(region).getByRole("button", { name: "Open it in the Library" }));
      expect(navigated()).toEqual({
        path: "/library",
        state: {
          cuepointLibraryRules: {
            match: "all",
            rules: [{ field: "collection", operator: "in_collection", value: 33 }],
          },
        },
      });
    });

    it.each([
      [{ limit: 50, since: "all" }, {}, "Most played, all time (top 50)"],
      [
        { limit: 50, since: "date:2026-09-01" },
        { since: "2026-09-01" },
        "Most played since Sep 1, 2026 (top 50)",
      ],
      [{ limit: 25, since: "7d" }, { since: "2026-11-13" }, "Most played since Nov 13, 2026 (top 25)"],
      [{ limit: 100, since: "30d" }, { since: "2026-10-21" }, "Most played since Oct 21, 2026 (top 100)"],
      [{ limit: 10, since: "90d" }, { since: "2026-08-22" }, "Most played since Aug 22, 2026 (top 10)"],
      [{ limit: 200, since: "year" }, { since: "2025-11-20" }, "Most played since Nov 20, 2025 (top 200)"],
      [{ limit: 10, since: "refresh" }, { last_read_id: 7 }, "Most played since Nov 2, 2026 (top 10)"],
      [
        { limit: 10, since: "date:2026-01-01" },
        { since: "2026-01-01", since_clamped: true },
        "Most played since Oct 8, 2026 (top 10)",
      ],
    ] as const)("names the list for %j", async (choice, answer, name) => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify(choice));
      const create = vi.fn(({ name: given }: { name: string }) => Promise.resolve(made(given)));
      install({
        createCollectionFrom: create,
        getStatisticsPlays: vi.fn().mockResolvedValue(plays(answer)),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      expect(within(region).getByText(`Will be named “${name}”.`)).toBeVisible();
      await user.click(within(region).getByRole("button", { name: "Keep as Collection" }));

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(create.mock.calls[0]![0].name).toBe(name);
    });

    it("names it the same from the pure function", () => {
      expect(
        collectionName(
          { limit: 50, since: "date:2026-09-01" },
          { since: "2026-09-01", since_clamped: false, history_from: HISTORY_FROM, last_read: LAST_READ },
          NOW,
        ),
      ).toBe("Most played since Sep 1, 2026 (top 50)");
    });

    it("reports a failure and keeps nothing", async () => {
      const create = vi.fn().mockRejectedValue(new Error("boom"));
      install({ createCollectionFrom: create });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Keep as Collection" }));

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "The Collection could not be made. Nothing was saved.",
      );
      expect(within(region).queryByText(/Kept/)).toBeNull();
    });
  });

  describe("a list read again", () => {
    it("keeps the controls in place while the next answer is on its way", async () => {
      const first = plays();
      let release: (value: StatisticsPlays) => void = () => {};
      const read = vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockImplementationOnce(() => new Promise<StatisticsPlays>((resolve) => (release = resolve)));
      install({ getStatisticsPlays: read });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Top"), "Top 25");

      const control = within(region).getByLabelText("Top");
      expect(control).toHaveValue("25");
      expect(within(region).getByRole("button", { name: "1. Alpha by B, 14 plays" })).toBeVisible();
      expect(within(region).getByRole("button", { name: "Keep as Collection" })).toBeDisabled();
      release(plays({ tracks: [{ id: 90, title: "Bravo", artist: "C", plays: 9 }] }));
      expect(await within(region).findByRole("button", { name: "1. Bravo by C, 9 plays" })).toBeVisible();
      expect(within(region).getByLabelText("Top")).toBe(control);
    });
  });

  it("is a section of the page and uses none of the words kept out of it", async () => {
    renderPage();
    const region = await section();

    expect(region.textContent).not.toMatch(/\b(engine|jobs?|quer(y|ies))\b/i);
  });
});

describe("PlaysSection on its own", () => {
  it("draws from the answer it is given", () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = {};
    render(
      <MemoryRouter>
        <PlaysSection data={plays()} choice={DEFAULT_PLAYS_CHOICE} onChoice={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "1. Alpha by B, 14 plays" })).toBeVisible();
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });
});

describe("the Plays section, after review (STATS-05)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    install();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  describe("a date being typed", () => {
    it("is not saved or sent until it is a whole date from 1900 to this year", async () => {
      renderPage();
      const region = await section();
      const before = mock("getStatisticsPlays").mock.calls.length;
      fireEvent.change(within(region).getByLabelText("Since"), { target: { value: "date" } });
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}").since).toBe("date:"),
      );
      const asked = mock("getStatisticsPlays").mock.calls.length;
      expect(asked).toBeGreaterThanOrEqual(before);

      for (const typed of ["0002-09-01", "1899-12-31", "2027-01-01", "2026-02-30"]) {
        fireEvent.change(within(region).getByLabelText("Since date"), { target: { value: typed } });
      }

      expect(mock("getStatisticsPlays").mock.calls.length).toBe(asked);
      expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}").since).toBe("date:");
      // The section, with its controls, is still there.
      expect(within(region).getByLabelText("Since date")).toBeVisible();
      expect(within(region).getByRole("list", { name: "Most played" })).toBeVisible();
    });

    it("says so when what is typed cannot be a date from the range", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      fireEvent.change(within(region).getByLabelText("Since date"), {
        target: { value: "0002-09-01" },
      });

      expect(within(region).getByText(/Enter a whole date from 1900 to this year/)).toBeVisible();
    });

    it("is sent once it is whole", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      fireEvent.change(within(region).getByLabelText("Since date"), {
        target: { value: "1999-09-01" },
      });

      await waitFor(() => expect(lastAsked()).toMatchObject({ since: "1999-09-01" }));
    });

    it("says a date after today has nothing to count", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      fireEvent.change(within(region).getByLabelText("Since date"), {
        target: { value: "2026-12-25" },
      });

      expect(within(region).getByText(/after today/)).toBeVisible();
      await waitFor(() => expect(lastAsked()).toMatchObject({ since: "2026-12-25" }));
    });

    it("limits the picker to the range", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      const field = within(region).getByLabelText("Since date");
      expect(field).toHaveAttribute("max", "2026-11-20");
      expect(field).toHaveAttribute("min", "1900-01-01");
    });

    it("falls back to the default when a bad date was saved", () => {
      window.localStorage.setItem(
        PLAYS_STORAGE_KEY,
        JSON.stringify({ limit: 50, since: "date:0002-09-01" }),
      );
      expect(loadPlaysChoice()).toEqual({ limit: 50, since: "all" });
      expect(isPlaysSince("date:2027-01-01", NOW)).toBe(false);
      expect(isPlaysSince("date:1899-12-31", NOW)).toBe(false);
      expect(isPlaysSince("date:2026-02-30", NOW)).toBe(false);
      expect(isPlaysSince("date:2026-09-01", NOW)).toBe(true);
      expect(isPlaysSince("date:", NOW)).toBe(true);
      expect(sinceDay("date:0002-09-01", NOW)).toBeNull();
      expect(sinceDay("date:2026-09-01", NOW)).toBe("2026-09-01");
    });
  });

  describe("a read that fails", () => {
    it("keeps the section and its controls, says so inline, and tries again", async () => {
      const refused = Object.assign(new Error("bad since"), { status: 400, code: "INVALID_REQUEST" });
      const read = vi
        .fn()
        .mockResolvedValueOnce(plays())
        .mockRejectedValueOnce(refused)
        .mockResolvedValue(plays());
      install({ getStatisticsPlays: read });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Top"), "Top 25");

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "These plays could not be read",
      );
      expect(within(region).getByLabelText("Top")).toHaveValue("25");
      expect(within(region).getByRole("button", { name: "1. Alpha by B, 14 plays" })).toBeVisible();
      expect(screen.queryByText("Plays could not be read.")).toBeNull();
      // A refusal is not a bug to report.
      expect(reportUnexpected).not.toHaveBeenCalled();

      await user.click(within(region).getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(within(region).queryByRole("alert")).toBeNull());
      expect(read).toHaveBeenCalledTimes(3);
    });

    it("reports a failure that is not a refusal", async () => {
      const read = vi.fn().mockResolvedValueOnce(plays()).mockRejectedValueOnce(new Error("boom"));
      install({ getStatisticsPlays: read });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.selectOptions(within(region).getByLabelText("Top"), "Top 25");

      await within(region).findByRole("alert");
      expect(reportUnexpected).toHaveBeenCalledTimes(1);
    });
  });

  describe("while a new choice is read", () => {
    it("says it is reading and dims the list", async () => {
      let release: (value: StatisticsPlays) => void = () => {};
      const read = vi
        .fn()
        .mockResolvedValueOnce(plays())
        .mockImplementationOnce(() => new Promise<StatisticsPlays>((resolve) => (release = resolve)));
      install({ getStatisticsPlays: read });
      const user = userEvent.setup();
      renderPage();
      const region = await section();
      expect(within(region).queryByText("Reading…")).toBeNull();

      await user.selectOptions(within(region).getByLabelText("Top"), "Top 25");

      expect(await within(region).findByText("Reading…")).toBeVisible();
      expect(region.querySelector(".plays--stale")).not.toBeNull();
      release(plays());
      await waitFor(() => expect(within(region).queryByText("Reading…")).toBeNull());
      expect(region.querySelector(".plays--stale")).toBeNull();
    });
  });

  describe("your last refresh with no history", () => {
    it("shows no all-time numbers under it", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ history_from: null, last_read: null, last_read_id: null })),
      });
      renderPage();
      const region = await screen.findByRole("region", { name: "Plays" });

      expect(await within(region).findByText(/no refresh to count from yet/)).toBeVisible();
      expect(within(region).queryByRole("list", { name: "Most played" })).toBeNull();
      expect(within(region).queryByRole("button", { name: /Alpha/ })).toBeNull();
      expect(within(region).queryByRole("button", { name: "Keep as Collection" })).toBeNull();
      // The controls stay, so another choice can be made.
      expect(within(region).getByLabelText("Since")).toHaveValue("refresh");
    });
  });

  describe("Keep as Collection", () => {
    it("is not offered where the Collection cannot be made", async () => {
      install({ createCollectionFrom: undefined });
      renderPage();
      const region = await section();

      expect(within(region).queryByRole("button", { name: "Keep as Collection" })).toBeNull();
    });

    it("says a track has gone when the route refuses the list, and offers to read again", async () => {
      const refused = Object.assign(new Error("unknown track"), { status: 400, code: "INVALID_REQUEST" });
      install({ createCollectionFrom: vi.fn().mockRejectedValue(refused) });
      const user = userEvent.setup();
      renderPage();
      const region = await section();
      const reads = mock("getStatisticsPlays").mock.calls.length;

      await user.click(within(region).getByRole("button", { name: "Keep as Collection" }));

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "A track in the list is no longer in your library. Read the list again and keep it.",
      );
      expect(reportUnexpected).not.toHaveBeenCalled();
      await user.click(within(region).getByRole("button", { name: "Read the list again" }));
      await waitFor(() =>
        expect(mock("getStatisticsPlays").mock.calls.length).toBeGreaterThan(reads),
      );
    });
  });

  describe("the preview button", () => {
    it("says so when the track cannot be read", async () => {
      install({
        player: { playQueue: vi.fn() },
        getLibraryTrack: vi.fn().mockRejectedValue(new Error("gone")),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Preview Alpha by B" }));

      expect(await within(region).findByText("That track could not be read.")).toBeVisible();
    });
  });

  describe("today", () => {
    it("is read again each time the page is read", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "7d" }));
      renderPage();
      await section();
      expect(lastAsked()).toMatchObject({ since: "2026-11-13" });

      vi.setSystemTime(new Date(2026, 10, 22, 0, 5, 0)); // the page was left open past midnight
      act(() => announceLibraryChange());

      await waitFor(() => expect(lastAsked()).toMatchObject({ since: "2026-11-15" }));
    });
  });
});
