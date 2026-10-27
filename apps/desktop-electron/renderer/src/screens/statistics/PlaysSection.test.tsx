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
import { ToastProvider } from "../../components";
import { announceLibraryChange } from "../../api/libraryChanges";
import { invalidateReads } from "../../api/engineReads";
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
import playsCss from "./PlaysSection.css?raw";
import css from "./statistics.css?raw";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
const mock = (name: string) => bridge[name] as Fn;

const SPREAD = { buckets: [], unknown: { label: "Unknown", count: 0, rules: null }, total: 0 };
const FILLER_IDS = Array.from({ length: 7 }, (_, i) => 1000 + i);
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
      { id: 812, title: "Alpha", artist: "B", plays: 14, key: null, bpm: null },
      { id: 90, title: "Bravo", artist: "C", plays: 7, key: null, bpm: null },
      { id: 4, title: "Charlie", artist: "B", plays: 1, key: null, bpm: null },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: 1000 + i,
        title: `Filler ${i}`,
        artist: "Z",
        plays: 1,
        key: null,
        bpm: null,
      })),
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
    genres: [
      {
        name: "House",
        genre_key: "house",
        plays: 18,
        tracks: 2,
        rules: rules("genre", "House"),
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
      total_seconds: 0,
      average_seconds: null,
      average_bpm: null,
      artists: [],
      labels: [],
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
      files: {
        present: count(0),
        missing: count(0),
        unreadable: count(0),
        not_checked: count(0),
      },
      beatport: {
        accepted: count(0),
        needs_review: count(0),
        rejected: count(0),
        no_match: count(0),
        not_matched: count(0),
      },
      analyzed: { analyzed: 0, failed: 0, waiting: 0, no_file: 0 },
      checked_at: null,
      other: { duplicates: count(0), disputed: count(0), no_artwork: count(0) },
      artwork_checked_at: null,
      not_synced: count(0),
    }),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/statistics"]}>
        <StatisticsScreen />
        <Where />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** The Plays tab's panel. */
const panel = (id: "plays" | "overview" | "health") =>
  document.querySelector<HTMLElement>(`[data-panel-of="${id}"]`) as HTMLElement;

async function playsPanel() {
  await userEvent.click(await screen.findByRole("tab", { name: "Plays" }));
  return panel("plays");
}

async function section() {
  // Overview is the page's first tab (D22); these tests read Plays.
  await userEvent.click(await screen.findByRole("tab", { name: "Plays" }));
  await screen.findByRole("list", { name: "Most played tracks" });
  return panel("plays");
}

/** M409: "Save as a Collection…" opens a name dialog; Save there makes it. Returns the dialog's name field's value. */
async function saveAsCollection(user: ReturnType<typeof userEvent.setup>, region: HTMLElement): Promise<string> {
  await user.click(within(region).getByRole("button", { name: "Save as a Collection…" }));
  const dialog = await screen.findByRole("dialog", { name: "Save as a Collection" });
  const offered = (within(dialog).getByRole("textbox", { name: "Name" }) as HTMLInputElement).value;
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  return offered;
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
    it("opens on the top 10, and offers the top 25", async () => {
      renderPage();
      const region = await section();

      expect(lastAsked()).toMatchObject({ limit: 10, scope: "library" });
      expect(within(region).getByText("top 10")).toBeInTheDocument();
      expect(within(region).getByRole("button", { name: "Show all 25" })).toBeInTheDocument();
    });

    it("asks the route for the top 25 from that link, remembers it, and offers to go back", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));

      await waitFor(() => expect(lastAsked()).toMatchObject({ limit: 25, scope: "library" }));
      expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}")).toEqual({
        limit: 25,
        since: "all",
      });
      await user.click(await within(region).findByRole("button", { name: "Show less" }));
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}")).toEqual({ limit: 10, since: "all" }),
      );
    });

    it("starts from what was remembered", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 50, since: "30d" }));
      renderPage();
      const region = await section();

      expect(within(region).getByText("top 50")).toBeInTheDocument();
      expect(screen.getByLabelText("Since")).toHaveValue("30d");
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
      await section();

      await user.selectOptions(screen.getByLabelText("Since"), label);

      await waitFor(() => expect(lastAsked()).toMatchObject({ since: day, limit: 10 }));
      expect(lastAsked().tz).toMatch(/^[+-]\d\d:\d\d$/);
      expect(lastAsked()).not.toHaveProperty("sinceRead");
      expect(screen.getByLabelText("Since")).toHaveValue(value);
    });

    it("counts from your last refresh by the id of the last read", async () => {
      const user = userEvent.setup();
      renderPage();
      await section();

      await user.selectOptions(screen.getByLabelText("Since"), "Your last refresh");

      await waitFor(() => expect(lastAsked()).toMatchObject({ sinceRead: "7", limit: 10 }));
      expect(lastAsked()).not.toHaveProperty("since");
      expect(lastAsked()).not.toHaveProperty("tz");
    });

    it("asks again with the newest read when a refresh has happened since", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      const window7 = [{ id: 1, title: "Window seven", artist: "A", plays: 3, key: null, bpm: null }];
      const window8 = [{ id: 2, title: "Window eight", artist: "A", plays: 2, key: null, bpm: null }];
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

    it("learns again when the answer by id names a newer read than the one it asked by", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      const window7 = [{ id: 1, title: "Window seven", artist: "A", plays: 3, key: null, bpm: null }];
      const window8 = [{ id: 2, title: "Window eight", artist: "A", plays: 2, key: null, bpm: null }];
      let refreshed = false;
      const read = vi.fn((params: { sinceRead?: string }) => {
        if (params.sinceRead === undefined) {
          return Promise.resolve(plays({ last_read_id: refreshed ? 8 : 7 }));
        }
        // A refresh happened between the first ask and this one, with no announce for the
        // page to hear: the answer names the newer read.
        const asked = params.sinceRead;
        refreshed = true;
        return Promise.resolve(plays({ last_read_id: 8, tracks: asked === "8" ? window8 : window7 }));
      });
      install({ getStatisticsPlays: read });
      renderPage();
      const region = await section();

      expect(
        await within(region).findByRole("button", { name: "1. Window eight by A, 2 plays" }),
      ).toBeVisible();
      expect(read.mock.calls[read.mock.calls.length - 1]![0]).toMatchObject({ sinceRead: "8" });
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
      await section();

      await user.selectOptions(screen.getByLabelText("Since"), "All time");

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
      await section();

      await user.selectOptions(screen.getByLabelText("Since"), "A date…");
      // Until a date is typed the list stays as it was.
      expect(lastAsked()).toEqual({ limit: 10, scope: "library" });
      await user.type(screen.getByLabelText("Since date"), "2026-09-01");

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
        "Your play history starts on Oct 8, so the counts begin there rather than on Jan 1.",
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
      const list = within(region).getByRole("list", { name: "Most played tracks" });

      expect(within(list).getAllByRole("listitem")).toHaveLength(10);
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

    it("has no play button in the rows; a double-click plays from the row and stays on the page (D12 A, M99)", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      const row = { id: 812, title: "Alpha", artist: "B", file_path: "/m/a.mp3" };
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn().mockResolvedValue({ track: row }),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      expect(within(region).queryByRole("button", { name: /^Play / })).toBeNull();
      expect(region.querySelector(".cp-play-btn")).toBeNull();
      await user.dblClick(within(region).getByRole("button", { name: /^1\. Alpha by B/ }));

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: 812 });
      expect(playQueue.mock.calls[0]![0][0]).toMatchObject({ trackId: 812, filePath: "/m/a.mp3" });
      // The first click of the double-click did not open the Library.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(navigated().path).toBe("/statistics");
    });

    it("plays from the row with Enter (M99)", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn().mockResolvedValue({ track: { id: 812, title: "Alpha", artist: "B", file_path: "/m/a.mp3" } }),
      });
      renderPage();
      const region = await section();

      fireEvent.keyDown(within(region).getByRole("button", { name: /^1\. Alpha by B/ }), { key: "Enter" });

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      expect(navigated().path).toBe("/statistics");
    });

    it("offers no preview where there is no player", async () => {
      renderPage();
      const region = await section();

      expect(within(region).queryByRole("button", { name: /^Play / })).toBeNull();
    });

    it("lists the top artists and labels with plays and tracks, and opens their tracks", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      const artists = within(region).getByRole("list", { name: "Top artists" });
      await user.click(within(artists).getByRole("button", { name: "B, 15 plays, 2 tracks" }));
      expect(navigated().state).toEqual({
        cuepointLibraryRules: rules("artist_name", "B"),
      });

      const labels = within(region).getByRole("list", { name: "Top labels" });
      await user.click(within(labels).getByRole("button", { name: "Warm, 21 plays, 2 tracks" }));
      expect(navigated().state).toEqual({
        cuepointLibraryRules: rules("label_name", "Warm"),
      });
    });

    it("lists five artists, and the rest behind Show all N", async () => {
      const user = userEvent.setup();
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
      expect(within(list).getAllByRole("listitem")).toHaveLength(5);
      const card = list.closest("section")!;
      await user.click(within(card).getByRole("button", { name: "Show all 14" }));
      expect(within(list).getAllByRole("listitem")).toHaveLength(14);
      await user.click(within(card).getByRole("button", { name: "Show less" }));
      expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    });

    it("lists the top genres by plays, and opens their tracks", async () => {
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      const genres = within(region).getByRole("list", { name: "Top genres" });
      await user.click(within(genres).getByRole("button", { name: "House, 18 plays, 2 tracks" }));
      expect(navigated().state).toEqual({ cuepointLibraryRules: rules("genre", "House") });
    });

    it("shows each track's key and BPM", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(
          plays({
            tracks: [
              { id: 812, title: "Alpha", artist: "B", plays: 14, key: "9A", bpm: 128 },
              { id: 90, title: "Bravo", artist: "C", plays: 7, key: null, bpm: null },
            ],
          }),
        ),
      });
      renderPage();
      const region = await section();

      const first = within(region).getByRole("button", { name: /^1\. Alpha/ });
      expect(within(first).getByText("9A")).toHaveClass("key-chip");
      expect(within(first).getByText("128")).toBeInTheDocument();
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

      expect(
        within(region).getByRole("button", { name: /Shows all of B's played tracks/ }),
      ).toBeVisible();
      expect(
        within(region).getByRole("button", { name: /Shows all of Warm's played tracks/ }),
      ).toBeVisible();
      expect(within(region).getAllByText("opens all its played tracks")).toHaveLength(2);
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

      expect(within(region).getByText("3,120")).toHaveClass("plays__unplayed-count");
      await user.click(within(region).getByRole("button", { name: "Open in Library: Never played" }));
      expect(navigated().state).toEqual({ cuepointLibraryRules: rules("play_count", 3120) });

      await user.click(within(region).getByRole("button", { name: "Open in Library: No play count" }));
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

      expect(within(region).getAllByText("0")).toHaveLength(2);
      expect(within(region).queryByRole("button", { name: /^Open in Library/ })).toBeNull();
    });
  });

  describe("empty and no-history states", () => {
    it("says so when nothing has been played in the library", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: [], artists: [], labels: [], genres: [] })),
      });
      renderPage();
      const region = await playsPanel();

      expect(await within(region).findByText("None of these tracks has been played yet")).toBeVisible();
      // M222: one empty state, and no empty cards (nothing to save, nothing to rank).
      expect(within(region).queryByRole("button", { name: "Save as a Collection…" })).toBeNull();
      expect(within(region).queryAllByText("No plays to rank")).toHaveLength(0);
    });

    it("says so when nothing was played in the time chosen", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "7d" }));
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: [], artists: [], labels: [], genres: [] })),
      });
      renderPage();
      const region = await playsPanel();

      expect(await within(region).findByText("No plays were recorded in that time")).toBeVisible();
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
      expect(within(region).getByText(/no refresh recorded yet/)).toBeVisible();
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
      const region = await playsPanel();

      expect(await within(region).findByText(/no refresh since the import/)).toBeVisible();
    });
  });

  describe("the source line (M431)", () => {
    it("says when the counts were last read, and nothing of the history all time", async () => {
      renderPage();
      const region = await section();

      expect(within(region).getByText("Rekordbox play counts · refreshed Nov 2")).toBeVisible();
    });

    it("says where the history starts only when it starts after the Since chosen", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ since: "2026-09-01" })),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByText("Rekordbox play counts · refreshed Nov 2 · history from Oct 8")).toBeVisible();
    });

    it("adds the year to a date in another year", async () => {
      install({
        getStatisticsPlays: vi
          .fn()
          .mockResolvedValue(plays({ since: "2025-01-01", history_from: "2025-10-08T12:00:00Z" })),
      });
      renderPage();
      const region = await section();

      expect(within(region).getByText("Rekordbox play counts · refreshed Nov 2 · history from Oct 8, 2025")).toBeVisible();
    });
  });

  describe("Save as a Collection (M409)", () => {
    const made = (name: string) => ({
      collection: { id: 33, name, kind: "collection", parent_id: null },
    });

    it("makes a Collection of the tracks in rank order and says where it went", async () => {
      const create = vi.fn(({ name }: { name: string }) => Promise.resolve(made(name)));
      install({ createCollectionFrom: create });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await saveAsCollection(user, region);

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          name: "Most played, all time (top 10)",
          parent_id: null,
          track_ids: [812, 90, 4, ...FILLER_IDS],
        }),
      );
      expect(await within(region).findByText(/Saved 10 tracks in rank order as/)).toHaveTextContent(
        "Saved 10 tracks in rank order as “Most played, all time (top 10)”, in Collections in the Library.",
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

      // M409: the name is offered in the dialog's field.
      expect(await saveAsCollection(user, region)).toBe(name);

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

      await saveAsCollection(user, region);

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "The Collection could not be made. Nothing was saved.",
      );
      expect(within(region).queryByText(/Saved \d/)).toBeNull();
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

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));

      const control = within(region).getByRole("button", { name: "Show less" });
      expect(within(region).getByText("top 25")).toBeInTheDocument();
      expect(within(region).getByRole("button", { name: "1. Alpha by B, 14 plays" })).toBeVisible();
      expect(within(region).getByRole("button", { name: "Save as a Collection…" })).toBeDisabled();
      release(plays({ tracks: [{ id: 90, title: "Bravo", artist: "C", plays: 9, key: null, bpm: null }] }));
      expect(await within(region).findByRole("button", { name: "1. Bravo by C, 9 plays" })).toBeVisible();
      expect(within(region).getByRole("button", { name: "Show less" })).toBe(control);
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
      fireEvent.change(screen.getByLabelText("Since"), { target: { value: "date" } });
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}").since).toBe("date:"),
      );
      const asked = mock("getStatisticsPlays").mock.calls.length;
      expect(asked).toBeGreaterThanOrEqual(before);

      for (const typed of ["0002-09-01", "1899-12-31", "2027-01-01", "2026-02-30"]) {
        fireEvent.change(screen.getByLabelText("Since date"), { target: { value: typed } });
      }

      expect(mock("getStatisticsPlays").mock.calls.length).toBe(asked);
      expect(JSON.parse(window.localStorage.getItem(PLAYS_STORAGE_KEY) ?? "{}").since).toBe("date:");
      // The section, with its controls, is still there.
      expect(screen.getByLabelText("Since date")).toBeVisible();
      expect(within(region).getByRole("list", { name: "Most played tracks" })).toBeVisible();
    });

    it("says so when what is typed cannot be a date from the range", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      fireEvent.change(screen.getByLabelText("Since date"), {
        target: { value: "0002-09-01" },
      });

      expect(within(region).getByText(/Enter a whole date from 1900 to this year/)).toBeVisible();
    });

    it("is sent once it is whole", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      await section();

      fireEvent.change(screen.getByLabelText("Since date"), {
        target: { value: "1999-09-01" },
      });

      await waitFor(() => expect(lastAsked()).toMatchObject({ since: "1999-09-01" }));
    });

    it("says a date after today has nothing to count", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      const region = await section();

      fireEvent.change(screen.getByLabelText("Since date"), {
        target: { value: "2026-12-25" },
      });

      expect(within(region).getByText(/after today/)).toBeVisible();
      await waitFor(() => expect(lastAsked()).toMatchObject({ since: "2026-12-25" }));
    });

    it("limits the picker to the range", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "date:" }));
      renderPage();
      await section();

      const field = screen.getByLabelText("Since date");
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

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "These plays could not be read",
      );
      expect(within(region).getByText("top 25")).toBeInTheDocument();
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

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));

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
      expect(screen.queryByText("Loading plays…")).toBeNull();

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));

      expect(await screen.findByText("Loading plays…")).toBeVisible();
      expect(region.querySelector(".plays--stale")).not.toBeNull();
      release(plays());
      await waitFor(() => expect(screen.queryByText("Loading plays…")).toBeNull());
      expect(region.querySelector(".plays--stale")).toBeNull();
    });
  });

  // The flicker a Discover dig caused: the job poll saw the library's revision move about
  // once a second and read Plays again each time, and the section dimmed under "Loading
  // plays…" for every one. A read the person did not ask for swaps its numbers in quietly.
  describe("while the same choice is read again behind it", () => {
    it("neither dims the list nor says it is reading, and swaps the new numbers in", async () => {
      let release: (value: StatisticsPlays) => void = () => {};
      const read = vi
        .fn()
        .mockResolvedValueOnce(plays())
        .mockImplementationOnce(() => new Promise<StatisticsPlays>((resolve) => (release = resolve)));
      install({ getStatisticsPlays: read });
      renderPage();
      const region = await section();
      expect(within(region).getByText("3,120")).toBeInTheDocument();

      act(() => invalidateReads(["library"]));

      await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("Loading plays…")).toBeNull();
      expect(region.querySelector(".plays--stale")).toBeNull();
      expect(region.querySelector("[aria-busy]")).toBeNull();
      expect(within(region).getByText("3,120")).toBeInTheDocument();

      await act(async () => release(plays({ never_played: count(3121) })));
      expect(await within(region).findByText("3,121")).toBeInTheDocument();
      expect(region.querySelector(".plays--stale")).toBeNull();
    });

    it("stays quiet for 'your last refresh' too, and still dims for a new choice after", async () => {
      window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
      const pending: Array<(value: StatisticsPlays) => void> = [];
      const read = vi
        .fn()
        .mockResolvedValueOnce(plays({ last_read_id: 7 }))
        .mockResolvedValueOnce(plays({ last_read_id: 7 }))
        .mockImplementation(() => new Promise<StatisticsPlays>((resolve) => pending.push(resolve)));
      install({ getStatisticsPlays: read });
      const user = userEvent.setup();
      renderPage();
      const region = await section();
      await waitFor(() => expect(read).toHaveBeenCalledTimes(2));

      act(() => invalidateReads(["library"]));

      await waitFor(() => expect(pending.length).toBeGreaterThan(0));
      expect(screen.queryByText("Loading plays…")).toBeNull();
      expect(region.querySelector(".plays--stale")).toBeNull();
      await act(async () => {
        for (const resolve of pending.splice(0)) resolve(plays({ last_read_id: 7 }));
      });

      await user.click(within(region).getByRole("button", { name: "Show all 25" }));
      expect(await screen.findByText("Loading plays…")).toBeVisible();
      expect(region.querySelector(".plays--stale")).not.toBeNull();
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
      const region = await playsPanel();

      expect(await within(region).findByText(/no refresh to count from yet/)).toBeVisible();
      expect(within(region).queryByRole("list", { name: "Most played tracks" })).toBeNull();
      expect(within(region).queryByRole("button", { name: /Alpha/ })).toBeNull();
      expect(within(region).queryByRole("button", { name: "Save as a Collection…" })).toBeNull();
      // The controls stay, so another choice can be made.
      expect(screen.getByLabelText("Since")).toHaveValue("refresh");
    });
  });

  describe("Save as a Collection (M409)", () => {
    it("is not offered where the Collection cannot be made", async () => {
      install({ createCollectionFrom: undefined });
      renderPage();
      const region = await section();

      expect(within(region).queryByRole("button", { name: "Save as a Collection…" })).toBeNull();
    });

    it("says a track has gone when the route refuses the list, and offers to read again", async () => {
      const refused = Object.assign(new Error("unknown track"), { status: 400, code: "INVALID_REQUEST" });
      install({ createCollectionFrom: vi.fn().mockRejectedValue(refused) });
      const user = userEvent.setup();
      renderPage();
      const region = await section();
      const reads = mock("getStatisticsPlays").mock.calls.length;

      await saveAsCollection(user, region);

      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "A track in the list is no longer in your library. Read the list again and save it.",
      );
      expect(reportUnexpected).not.toHaveBeenCalled();
      await user.click(within(region).getByRole("button", { name: "Read the list again" }));
      await waitFor(() =>
        expect(mock("getStatisticsPlays").mock.calls.length).toBeGreaterThan(reads),
      );
    });
  });

  describe("wording and layout of the Plays tab (C47, C85, C140, C72)", () => {
    it("puts Since in the header beside Which tracks, and the source line on its own above the cards (M224, M206)", async () => {
      renderPage();
      const region = await section();

      const since = screen.getByRole("combobox", { name: "Since" });
      expect(since.closest(".cp-screen-header")).not.toBeNull();
      expect(region.contains(since)).toBe(false);
      const source = region.querySelector(".plays__source")!;
      expect(source).toHaveTextContent(/^Rekordbox play counts · refreshed /);
      expect(/\.plays__source\s*\{([^}]*)\}/.exec(playsCss)![1]).toContain("max-width: 60ch;");
      expect(region.querySelector(".plays__footer")).toBeNull();
    });

    it("writes Title and Artist in columns of their own, in the shared order (D12, M87)", async () => {
      renderPage();
      const region = await section();

      const row = region.querySelector(".plays__item .plays__row")!;
      const cells = [...row.children].map((cell) => cell.textContent);
      expect(cells.slice(0, 3)).toEqual(["1", "Alpha", "B"]);
      const head = [...region.querySelector(".plays__columns-head")!.children].map((cell) => cell.textContent);
      expect(head).toEqual(["#", "Title", "Artist", "BPM", "Key", "Plays"]);
      expect(/\.plays__columns-head,\s*\.plays__row\s*\{([^}]*)\}/.exec(playsCss)![1]).toContain(
        "--cp-data-grid-columns: 3ch minmax(0, 1fr) minmax(0, 1fr) 7ch 6ch 6ch;",
      );
      // M221: BPM is a figure at the size of the names, like Plays.
      expect(row.children[3]).toHaveClass("rank__number", "rank__number--main", "statistics-figure");
    });

    it("says an empty list with the compact empty state, headline without a full stop (C140)", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: [], artists: [], labels: [], genres: [] })),
      });
      renderPage();
      const region = await playsPanel();

      await within(region).findByText("None of these tracks has been played yet");
      // M222: one empty state, not one per card.
      const empties = region.querySelectorAll(".cp-empty-state--compact");
      expect(empties).toHaveLength(1);
      expect(region.querySelector(".statistics-note + .statistics-note")).toBeNull();
    });

    it("draws the list headings in the one table header look (D8, C72)", async () => {
      // The look is the shared list variant, sticky like a table's header; the pages only name columns.
      const grid = (await import("../../components/table/DataTable.css?raw")).default;
      const at = grid.indexOf(".cp-data-grid__head {");
      expect(at).toBeGreaterThan(-1);
      const rule = grid.slice(at, grid.indexOf("}", at));
      expect(rule).toContain("position: sticky;");
      expect(rule).toContain("min-height: var(--row-height);");
      // P1: a table header is the panel tone with the divider under it, no longer the toolbar tone.
      expect(rule).toContain("background: var(--bg-panel);");
      // P2: a column header is the label role in the control face.
      expect(rule).toContain("font-family: var(--font-control);");
      // Neither page sheet draws a header look of its own any more.
      for (const sheet of [css, playsCss]) expect(sheet).not.toContain("var(--bg-toolbar)");
    });
  });

  describe("playing from Most played (C192)", () => {
    const rowFor = (id: number) => ({ id, title: `T${id}`, artist: "B", file_path: `/m/${id}.mp3` });

    it("queues the rest of the list from the clicked row, that row first", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn(({ trackId }: { trackId: number }) => Promise.resolve({ track: rowFor(trackId) })),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.dblClick(within(region).getByRole("button", { name: /^2\. Bravo by C/ }));

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      const [items, start] = playQueue.mock.calls[0]!;
      expect(items.map((item: { trackId: number }) => item.trackId)).toEqual([90, 4, ...FILLER_IDS]);
      expect(start).toBe(0);
      // The rows above the clicked one are not read at all.
      expect(mock("getLibraryTrack")).not.toHaveBeenCalledWith({ trackId: 812 });
    });

    it("skips a later track that cannot be read and still plays the clicked one", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn(({ trackId }: { trackId: number }) =>
          trackId === 90 ? Promise.reject(new Error("gone")) : Promise.resolve({ track: rowFor(trackId) }),
        ),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.dblClick(within(region).getByRole("button", { name: /^1\. Alpha by B/ }));

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      expect(playQueue.mock.calls[0]![0].map((item: { trackId: number }) => item.trackId)).toEqual([812, 4, ...FILLER_IDS]);
    });

    it("says so, and plays nothing, when the clicked track itself cannot be read", async () => {
      const playQueue = vi.fn().mockResolvedValue({ ok: true });
      install({
        player: { playQueue },
        getLibraryTrack: vi.fn(({ trackId }: { trackId: number }) =>
          trackId === 90 ? Promise.reject(new Error("gone")) : Promise.resolve({ track: rowFor(trackId) }),
        ),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.dblClick(within(region).getByRole("button", { name: /^2\. Bravo by C/ }));

      expect(await within(region).findByText("Could not read the track.")).toBeVisible();
      expect(playQueue).not.toHaveBeenCalled();
    });
  });

  describe("the number columns (C38, C54, C62)", () => {
    it("gives Not played a fixed number column, with an empty link cell when there is nothing to open", async () => {
      install({
        getStatisticsPlays: vi.fn().mockResolvedValue(plays({ never_played: count(84), unknown: count(0) })),
      });
      renderPage();
      const region = await section();

      const rows = region.querySelectorAll(".plays__unplayed-row");
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.children).toHaveLength(3);
        expect(row.children[1]).toHaveClass("plays__unplayed-count");
      }
      expect(rows[1]!.children[2]).toBeEmptyDOMElement();
      const rule = /\.plays__unplayed-row\s*\{([^}]*)\}/.exec(playsCss)![1]!;
      expect(rule).toContain("display: grid;");
      expect(rule).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) 6ch minmax\(max-content, 17ch\);/);
    });

    it("offers Show all 25 only when the list is full", async () => {
      install({ getStatisticsPlays: vi.fn().mockResolvedValue(plays({ tracks: plays().tracks.slice(0, 4) })) });
      renderPage();
      const region = await section();
      expect(within(region).queryByRole("button", { name: "Show all 25" })).toBeNull();
    });

    it("reserves no play column: the header and the rows share one grid (M99)", () => {
      expect(playsCss).not.toContain("--plays-play-column");
      expect(playsCss).not.toContain(".plays__columns-head--play");
    });

    it("cuts a long title short", () => {
      expect(playsCss).toMatch(/\.plays__row\s*\{\s*min-width:\s*0;/);
      const name = /\.plays__name\s*\{([^}]*)\}/.exec(playsCss)![1]!;
      expect(name).toContain("text-overflow: ellipsis;");
    });

    it("draws every figure one way: the data face, tabular, at the size of the names", () => {
      const figure = /\.statistics-figure[^{]*\{([^}]*)\}/.exec(css)![1]!;
      expect(figure).toContain("font-family: var(--font-data);");
      expect(figure).toContain("font-variant-numeric: tabular-nums;");
      expect(figure).not.toMatch(/font-size/);
    });

    it("marks the ranked numbers and the Not played count as figures", async () => {
      renderPage();
      const region = await section();
      for (const cell of region.querySelectorAll(".rank__row .rank__number, .plays__unplayed-count, .plays__row .rank__number")) {
        expect(cell).toHaveClass("statistics-figure");
      }
    });
  });

  describe("playing from a row", () => {
    it("says so when the track cannot be read", async () => {
      install({
        player: { playQueue: vi.fn() },
        getLibraryTrack: vi.fn().mockRejectedValue(new Error("gone")),
      });
      const user = userEvent.setup();
      renderPage();
      const region = await section();

      await user.dblClick(within(region).getByRole("button", { name: /^1\. Alpha by B/ }));

      expect(await within(region).findByText("Could not read the track.")).toBeVisible();
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
