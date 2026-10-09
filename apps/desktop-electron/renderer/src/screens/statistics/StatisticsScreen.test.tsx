/**
 * The Statistics page's frame (STATS-04, DEC-162).
 *
 * The page against a faked bridge: its three sections and their loading
 * state, the empty states (no library, no history), a failed read with Try
 * again, and the scope picker: remembered, falling back to the whole library
 * when what it named is gone, and reading again when it changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  CollectionNode,
  LibraryPlaylistNode,
  StatisticsHealth,
  StatisticsPlays,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { reportUnexpected } from "../../reporting/reporting";
import { StatisticsScreen } from "./StatisticsScreen";
import { STATISTICS_SCOPE_STORAGE_KEY } from "./statisticsScope";
import { useLibraryJobsFinished } from "./useStatistics";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
const mock = (name: string) => bridge[name] as Fn;

const RULES = { match: "all" as const, rules: [] };
const count = (n: number) => ({ count: n, rules: RULES });

function plays(overrides: Partial<StatisticsPlays> = {}): StatisticsPlays {
  return {
    since: null,
    since_clamped: false,
    history_from: "2026-10-08T09:12:00Z",
    last_read: "2026-10-08T09:12:00Z",
    last_read_id: 1,
    tracks: [],
    artists: [],
    labels: [],
    never_played: count(3120),
    unknown: count(41),
    ...overrides,
  };
}

const SPREAD = {
  buckets: [],
  unknown: { label: "Unknown", count: 0, rules: null },
  total: 0,
};

function spreads(total = 4000): StatisticsSpreads {
  return {
    scope: "library",
    total,
    genre: SPREAD,
    tempo: SPREAD,
    year: SPREAD,
    date_added: SPREAD,
    rating: SPREAD,
    loudness: SPREAD,
  };
}

function health(total = 4000): StatisticsHealth {
  return {
    scope: "library",
    total,
    files: {
      present: count(total - 12),
      missing: count(12),
      unreadable: count(0),
      not_checked: count(0),
    },
    beatport: {
      accepted: count(3000),
      needs_review: count(100),
      rejected: count(0),
      no_match: count(0),
      not_matched: count(900),
    },
    analyzed: { analyzed: 10, failed: 0, waiting: 5, no_file: 12 },
    checked_at: "2026-10-08T09:12:00Z",
  };
}

const playlist = (
  id: number,
  name: string,
  parent: number | null,
  kind: "folder" | "playlist" = "playlist",
): LibraryPlaylistNode => ({
  id,
  parent_id: parent,
  name,
  kind,
  depth: parent === null ? 0 : 1,
  position: id,
  path: name,
  track_count: 10,
});

const collection = (
  id: number,
  name: string,
  kind: CollectionNode["kind"],
): CollectionNode => ({
  id,
  parent_id: null,
  kind,
  name,
  position: id,
  depth: 0,
  rules: null,
  sort: null,
  dir: null,
  frozen_from_id: null,
  frozen_at: null,
  entry_count: 4,
  track_count: 4,
  broken: false,
  problem: null,
  created_at: "x",
  updated_at: "x",
});

function install(overrides: Record<string, unknown> = {}) {
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: false, track_count: 4000 }),
    getLibraryPlaylists: vi.fn().mockResolvedValue({
      playlists: [playlist(1, "Rekordbox", null, "folder"), playlist(2, "Warm-up", 1)],
      total: 2,
    }),
    getCollections: vi.fn().mockResolvedValue({
      collections: [collection(10, "Box", "collection"), collection(12, "Sorted", "smart")],
      total: 2,
    }),
    getStatisticsPlays: vi.fn().mockResolvedValue(plays()),
    getStatisticsSpreads: vi.fn().mockResolvedValue(spreads()),
    getStatisticsHealth: vi.fn().mockResolvedValue(health()),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <StatisticsScreen />
      <Where />
    </MemoryRouter>,
  );
}

const never = () => new Promise<never>(() => {});

describe("the Statistics page (STATS-04)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  it("has the title and three sections, Plays, Your library and Health", async () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
    await screen.findByRole("heading", { level: 2, name: "Plays" });
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Plays", "Your library", "Health"]);
  });

  it("shows each section reading while its answer is on the way", async () => {
    install({
      getStatisticsPlays: vi.fn(never),
      getStatisticsSpreads: vi.fn(never),
      getStatisticsHealth: vi.fn(never),
    });
    renderPage();

    const plays = await screen.findByRole("region", { name: "Plays" });
    expect(within(plays).getByRole("status")).toHaveTextContent("Reading plays");
    expect(
      within(screen.getByRole("region", { name: "Your library" })).getByRole("status"),
    ).toHaveTextContent("Reading your library");
    expect(
      within(screen.getByRole("region", { name: "Health" })).getByRole("status"),
    ).toHaveTextContent("Reading health");
  });

  it("fills each section with what was read, and invents nothing", async () => {
    renderPage();

    const plays = await screen.findByRole("region", { name: "Plays" });
    await waitFor(() => expect(within(plays).getByText(/Never played: 3,120/)).toBeInTheDocument());
    expect(within(plays).getByText(/Plays unknown: 41/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Your library" })).getByRole("heading", { level: 3, name: "Genre" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Health" })).getByText(/12 files missing/),
    ).toBeInTheDocument();
    // The whole library is the scope until the picker says otherwise.
    expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "library" });
    expect(mock("getStatisticsSpreads")).toHaveBeenCalledWith({ scope: "library" });
    expect(mock("getStatisticsHealth")).toHaveBeenCalledWith({ scope: "library" });
  });

  it("says to import a library when there is none, with the Library's import action", async () => {
    install({
      getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: true, track_count: 0 }),
    });
    renderPage();

    expect(await screen.findByText("There is no library to count yet.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Plays" })).not.toBeInTheDocument();
    expect(mock("getStatisticsPlays")).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Import a library" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
    expect(JSON.parse(screen.getByTestId("where").dataset.state!)).not.toBeNull();
  });

  it("says play history starts at the next refresh when there is none yet", async () => {
    install({
      getStatisticsPlays: vi.fn().mockResolvedValue(plays({ history_from: null, last_read: null, last_read_id: null })),
    });
    renderPage();

    const section = await screen.findByRole("region", { name: "Plays" });
    expect(await within(section).findByText("Play history starts at your next refresh")).toBeInTheDocument();
    // All-time counts are still the section's content.
    expect(within(section).getByText(/Never played: 3,120/)).toBeInTheDocument();
  });

  it("leaves the note out once there is history", async () => {
    renderPage();
    const section = await screen.findByRole("region", { name: "Plays" });
    await within(section).findByText(/Never played/);
    expect(screen.queryByText("Play history starts at your next refresh")).not.toBeInTheDocument();
  });

  it("shows a failed read in plain words, with Try again that reads it again", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("engine said no"))
      .mockResolvedValue(plays());
    install({ getStatisticsPlays: read });
    renderPage();

    const section = await screen.findByRole("region", { name: "Plays" });
    expect(await within(section).findByText("Plays could not be read.")).toBeInTheDocument();
    expect(section).not.toHaveTextContent(/engine said no/);
    expect(reportUnexpected).toHaveBeenCalled();
    // The other sections are not taken down with it.
    await within(screen.getByRole("region", { name: "Health" })).findByText(/files missing/);

    await userEvent.click(within(section).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByText(/Never played/)).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("uses none of the words the app keeps out of its text", async () => {
    renderPage();
    const section = await screen.findByRole("region", { name: "Plays" });
    await within(section).findByText(/Never played/);

    expect(document.body.textContent).not.toMatch(/\b(engine|jobs?|quer(y|ies))\b/i);
  });

  describe("the scope picker (DEC-162)", () => {
    it("offers the whole library first, then the playlists and the Collections", async () => {
      renderPage();

      const picker = await screen.findByRole("combobox", { name: "Scope" });
      await waitFor(() => expect(within(picker).getAllByRole("option").length).toBeGreaterThan(1));
      const options = within(picker).getAllByRole("option");
      expect(options[0]).toHaveTextContent("Whole library");
      expect(options[0]).toHaveValue("library");
      const values = options.map((option) => (option as HTMLOptionElement).value);
      expect(values).toEqual(
        expect.arrayContaining(["playlist:1", "playlist:2", "collection:10", "collection:12"]),
      );
      // A Smart Collection is a Collection to the route.
      expect(values.some((value) => value.startsWith("smart:"))).toBe(false);
    });

    it("reads all three again, for the new scope, and remembers it", async () => {
      renderPage();
      const picker = await screen.findByRole("combobox", { name: "Scope" });
      await waitFor(() => expect(within(picker).getAllByRole("option").length).toBeGreaterThan(1));
      await waitFor(() => expect(mock("getStatisticsHealth")).toHaveBeenCalledTimes(1));

      await userEvent.selectOptions(picker, "playlist:2");

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenLastCalledWith({ limit: 10, scope: "playlist:2" }),
      );
      expect(mock("getStatisticsSpreads")).toHaveBeenLastCalledWith({ scope: "playlist:2" });
      expect(mock("getStatisticsHealth")).toHaveBeenLastCalledWith({ scope: "playlist:2" });
      // A playlist is remembered by its path: a refresh gives it a new id.
      expect(window.localStorage.getItem(STATISTICS_SCOPE_STORAGE_KEY)).toBe("path:Warm-up");
    });

    it("opens on the remembered scope", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:10");
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "collection:10" }),
      );
      expect(screen.getByRole("combobox", { name: "Scope" })).toHaveValue("collection:10");
    });

    it("falls back to the whole library when the remembered playlist is gone", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "path:No such playlist");
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "library" }),
      );
      expect(mock("getStatisticsPlays")).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("combobox", { name: "Scope" })).toHaveValue("library");
    });

    it("falls back to the whole library when the remembered Collection is gone", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:77");
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsHealth")).toHaveBeenCalledWith({ scope: "library" }),
      );
      expect(mock("getStatisticsHealth")).not.toHaveBeenCalledWith({ scope: "collection:77" });
    });

    it("still opens a remembered playlist whose id changed but whose path did not", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "path:Warm-up");
      install({
        getLibraryPlaylists: vi.fn().mockResolvedValue({
          playlists: [playlist(40, "Rekordbox", null, "folder"), playlist(41, "Warm-up", 40)],
          total: 2,
        }),
      });
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "playlist:41" }),
      );
      expect(screen.getByRole("combobox", { name: "Scope" })).toHaveValue("playlist:41");
    });

    it("heads the playlists, and shows a Smart Collection that cannot run as unavailable", async () => {
      install({
        getCollections: vi.fn().mockResolvedValue({
          collections: [
            collection(10, "Box", "collection"),
            { ...collection(13, "Stale", "smart"), broken: true },
          ],
          total: 2,
        }),
      });
      renderPage();

      const picker = await screen.findByRole("combobox", { name: "Scope" });
      await waitFor(() => expect(picker).toBeEnabled());
      const options = within(picker).getAllByRole("option");
      expect(options[1]).toHaveTextContent("Rekordbox playlists");
      expect(options[1]).toBeDisabled();
      const stale = options.find((option) => /Stale/.test(option.textContent ?? ""))!;
      expect(stale).toHaveTextContent("Stale (rules need fixing)");
      expect(stale).toBeDisabled();
    });

    it("falls back from a remembered Smart Collection that cannot run", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:13");
      install({
        getCollections: vi.fn().mockResolvedValue({
          collections: [{ ...collection(13, "Stale", "smart"), broken: true }],
          total: 1,
        }),
      });
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "library" }),
      );
      expect(mock("getStatisticsPlays")).toHaveBeenCalledTimes(1);
    });

    it("keeps the picker off until the summary and the trees have answered", async () => {
      let release: (value: unknown) => void = () => {};
      install({
        getCollections: vi.fn(
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
      });
      renderPage();

      const picker = await screen.findByRole("combobox", { name: "Scope" });
      expect(picker).toBeDisabled();
      expect(mock("getStatisticsPlays")).not.toHaveBeenCalled();
      release({ collections: [], total: 0 });
      await waitFor(() => expect(picker).toBeEnabled());
    });

    it("does not draw the picker before the summary says there is a library", async () => {
      install({ getLibrarySummary: vi.fn(never) });
      renderPage();

      await screen.findByRole("heading", { level: 1, name: "Statistics" });
      expect(screen.queryByRole("combobox", { name: "Scope" })).not.toBeInTheDocument();
    });

    it("never shows an answer for the scope it was switched away from", async () => {
      let late: (value: StatisticsPlays) => void = () => {};
      const read = vi.fn((params: { scope: string }) =>
        params.scope === "library"
          ? new Promise<StatisticsPlays>((resolve) => {
              late = resolve;
            })
          : Promise.resolve(plays({ never_played: count(222) })),
      );
      install({ getStatisticsPlays: read });
      renderPage();

      const picker = await screen.findByRole("combobox", { name: "Scope" });
      await waitFor(() => expect(picker).toBeEnabled());
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await userEvent.selectOptions(picker, "playlist:2");
      const section = screen.getByRole("region", { name: "Plays" });
      await within(section).findByText(/Never played: 222/);

      await act(async () => late(plays({ never_played: count(111) })));

      expect(within(section).getByText(/Never played: 222/)).toBeInTheDocument();
      expect(section).not.toHaveTextContent("111");
    });

    it("works when the browser's storage throws", async () => {
      const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      try {
        renderPage();
        const picker = await screen.findByRole("combobox", { name: "Scope" });
        await waitFor(() => expect(within(picker).getAllByRole("option").length).toBeGreaterThan(1));
        await userEvent.selectOptions(picker, "playlist:2");
        await waitFor(() =>
          expect(mock("getStatisticsPlays")).toHaveBeenLastCalledWith({ limit: 10, scope: "playlist:2" }),
        );
      } finally {
        get.mockRestore();
        set.mockRestore();
      }
    });
  });

  describe("reading again", () => {
    it("reads all three again when the library changes", async () => {
      renderPage();
      await waitFor(() => expect(mock("getStatisticsHealth")).toHaveBeenCalledTimes(1));

      act(() => announceLibraryChange());

      await waitFor(() => expect(mock("getStatisticsHealth")).toHaveBeenCalledTimes(2));
      expect(mock("getStatisticsPlays")).toHaveBeenCalledTimes(2);
      expect(mock("getStatisticsSpreads")).toHaveBeenCalledTimes(2);
    });

    it("reads nothing with a scope the refreshed trees no longer have", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:10");
      const collections = vi
        .fn()
        .mockResolvedValueOnce({ collections: [collection(10, "Box", "collection")], total: 1 })
        .mockResolvedValue({ collections: [], total: 0 });
      install({ getCollections: collections });
      renderPage();
      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "collection:10" }),
      );
      const before = mock("getStatisticsPlays").mock.calls.length;

      act(() => announceLibraryChange());

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenLastCalledWith({ limit: 10, scope: "library" }),
      );
      const after = mock("getStatisticsPlays").mock.calls.slice(before);
      expect(after).toEqual([[{ limit: 10, scope: "library" }]]);
    });

    const running = (id: string, type = "library_import") => ({
      jobs: [{ id, type, state: "running" }],
      active_count: 1,
    });
    const none = { jobs: [], active_count: 0 };

    it("reads again when an import finishes, and not before", async () => {
      const listJobs = vi
        .fn()
        .mockResolvedValueOnce(running("j1"))
        .mockResolvedValueOnce(running("j1"))
        .mockResolvedValue(none);
      (window as unknown as { cuepoint: unknown }).cuepoint = { listJobs };
      // How many polls had been asked when it fired: the first two still saw the import.
      const firedAt: number[] = [];
      const onFinished = vi.fn(() => void firedAt.push(listJobs.mock.calls.length));

      renderHook(() => useLibraryJobsFinished(onFinished, 10));

      await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
      expect(firedAt[0]).toBeGreaterThanOrEqual(3);
    });

    it("does not take a failed poll for the end, and fires once at the real end", async () => {
      const listJobs = vi
        .fn()
        .mockResolvedValueOnce(running("j1"))
        .mockRejectedValueOnce(new Error("down"))
        .mockResolvedValueOnce(running("j1"))
        .mockResolvedValue(none);
      (window as unknown as { cuepoint: unknown }).cuepoint = { listJobs };
      const firedAt: number[] = [];
      const onFinished = vi.fn(() => void firedAt.push(listJobs.mock.calls.length));

      renderHook(() => useLibraryJobsFinished(onFinished, 10));

      await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
      // Not at the failed second poll, and not at the running third: at the fourth.
      expect(firedAt[0]).toBeGreaterThanOrEqual(4);
      await waitFor(() => expect(listJobs.mock.calls.length).toBeGreaterThan(firedAt[0]! + 3));
      expect(onFinished).toHaveBeenCalledTimes(1);
    });

    it("does not take a job the list left out for a finished one while more are running", async () => {
      const onFinished = vi.fn();
      const crowded = {
        jobs: Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, type: "clean_match", state: "running" })),
        active_count: 6,
      };
      const listJobs = vi
        .fn()
        .mockResolvedValueOnce(running("j1"))
        .mockResolvedValue(crowded);
      (window as unknown as { cuepoint: unknown }).cuepoint = { listJobs };

      renderHook(() => useLibraryJobsFinished(onFinished, 10));

      await waitFor(() => expect(listJobs.mock.calls.length).toBeGreaterThan(4));
      expect(onFinished).not.toHaveBeenCalled();
    });

    it("does not read again for a job that is not an import or a refresh", async () => {
      const onFinished = vi.fn();
      const listJobs = vi.fn().mockResolvedValueOnce(running("j2", "clean_match")).mockResolvedValue(none);
      (window as unknown as { cuepoint: unknown }).cuepoint = { listJobs };

      renderHook(() => useLibraryJobsFinished(onFinished, 10));

      await waitFor(() => expect(listJobs.mock.calls.length).toBeGreaterThan(2));
      expect(onFinished).not.toHaveBeenCalled();
    });

    it("opens no progress stream of its own", async () => {
      const subscribeJobEvents = vi.fn(() => () => {});
      const listJobs = vi.fn().mockResolvedValue(running("j1"));
      (window as unknown as { cuepoint: unknown }).cuepoint = { listJobs, subscribeJobEvents };

      renderHook(() => useLibraryJobsFinished(() => {}, 10));

      await waitFor(() => expect(listJobs.mock.calls.length).toBeGreaterThan(2));
      expect(subscribeJobEvents).not.toHaveBeenCalled();
    });
  });

  it("says plainly when the app's library service is not there", async () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = {};
    renderPage();

    const section = await screen.findByRole("region", { name: "Plays" });
    await waitFor(() => expect(section).toHaveTextContent(/desktop app/i));
  });
});
