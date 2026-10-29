/**
 * The Statistics page's frame (STATS-04, DEC-162).
 *
 * The page against a faked bridge: its three tabs and their loading
 * state, the empty states (no library, no history), a failed read with Try
 * again, and the scope picker: remembered, falling back to the whole library
 * when what it named is gone, and reading again when it changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  CollectionNode,
  LibraryPlaylistNode,
  StatisticsHealth,
  StatisticsPlays,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { announceLibraryChange } from "../../api/libraryChanges";
import { reportUnexpected } from "../../reporting/reporting";
import { StatisticsScreen } from "./StatisticsScreen";
import { needsDesktopApp } from "../../api/userMessage";
import { statisticsFocusState } from "./statisticsLink";
import { PLAYS_STORAGE_KEY } from "./playsChoice";
import { checkedLine } from "../clean/cleanEmpty";
import css from "./statistics.css?raw";
import grid from "../../components/table/DataTable.css?raw";
import { STATISTICS_SCOPE_STORAGE_KEY } from "./statisticsScope";
import { useLibraryJobsFinished } from "./useStatistics";
import { expectNoAxeViolations } from "../../test/axe";

vi.mock("../library/followJob", () => ({
  followJob: () => ({
    finished: new Promise(() => {}),
    stop: () => {},
  }),
}));

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
    history_from: "2026-10-08T12:00:00Z",
    last_read: "2026-10-08T12:00:00Z",
    last_read_id: 1,
    tracks: [],
    artists: [],
    labels: [],
    genres: [],
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
    checked_at: "2026-10-08T12:00:00Z",
    other: { duplicates: count(0), disputed: count(0), no_artwork: count(0) },
    artwork_checked_at: null,
    not_synced: count(0),
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

function renderPage(entry: string | { pathname: string; state: unknown } = "/statistics") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <StatisticsScreen />
        <Where />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** A tab's panel, whichever tab is showing (the three are mounted once and hidden). */
const panel = (id: "overview" | "plays" | "health") =>
  document.querySelector<HTMLElement>(`[data-panel-of="${id}"]`) as HTMLElement;

const never = () => new Promise<never>(() => {});

describe("one grid and an inline Scope (C244, C248)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  it("draws the word Scope inside the picker as its label, with nothing painted over it", async () => {
    renderPage();
    const picker = await screen.findByRole("combobox", { name: "Which tracks" });
    const wrap = picker.closest(".cp-select");
    expect(wrap).toHaveClass("cp-select--inline");
    expect(wrap?.querySelector("label.cp-select__inline-label")).toHaveTextContent("Which tracks");
    expect(document.querySelector(".statistics-page__scope-word")).toBeNull();
    expect(css).not.toContain("scope-word");
  });

  it("puts the track count in the header and not in the tab", async () => {
    renderPage();
    const tab = await screen.findByRole("tab", { name: "Overview" });
    expect(tab).not.toHaveTextContent(/\d/);
  });

  it("uses one grid on every tab", async () => {
    renderPage();
    await screen.findByRole("tab", { name: "Overview" });
    await waitFor(() => {
      for (const id of ["plays", "overview", "health"] as const) {
        expect(panel(id).querySelector(".statistics-panels")).not.toBeNull();
      }
    });
    const rule = /\.statistics-panels\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(320px * var(--scale))), 1fr));");
    expect(rule).toContain("gap: var(--space-xl);");
    expect(css).not.toContain("--charts");
    expect(css).not.toContain("380px");
    expect(rule).toContain("align-items: start;");
    expect(css).not.toContain(".library-lists");
  });

  it("pairs the Overview's cards at the cards' own scaled minimum, never a fixed width (M212)", () => {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
    // No fixed-pixel container step: it forced two columns under the cards' minimum at 1.5x.
    expect(flat).not.toMatch(/@container statistics-overview/);
    const rule = /\.library-tab \.statistics-panels \{([^}]*)\}/.exec(flat)?.[1] ?? "";
    expect(rule).toContain(
      "grid-template-columns: repeat( auto-fit, minmax(max(min(100%, calc(320px * var(--scale))), calc((100% - var(--space-xl)) / 2)), 1fr) );",
    );
  });
});

describe("the Statistics page (STATS-04)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  it("has the title and three tabs, Overview, Plays and Health, opening on Overview (D22)", async () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label") ?? tab.textContent)).toEqual([
      "Overview",
      "Plays",
      "Health, 112 issues",
    ]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(panel("overview")).toBeVisible();
    expect(panel("plays")).not.toBeVisible();
    expect(panel("health")).not.toBeVisible();
  });

  it("carries what needs fixing on Health, and no count on Overview (C257)", async () => {
    install({
      getStatisticsHealth: vi.fn().mockResolvedValue({
        ...health(),
        beatport: { ...health().beatport, needs_review: count(41) },
        analyzed: { analyzed: 10, failed: 3, waiting: 5, no_file: 12 },
        other: { duplicates: count(14), disputed: count(5), no_artwork: count(63) },
      }),
    });
    renderPage();

    // 12 missing + 0 unreadable + 41 to review + 14 duplicates + 5 changed + 3 failed.
    expect(await screen.findByRole("tab", { name: (name) => name.replace(/\s+,/g, ",") === "Health, 75 issues" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  });

  it("starts the page at the top when another tab is chosen", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    try {
      renderPage();
      const tab = await screen.findByRole("tab", { name: /^Health/ });
      scrollTo.mockClear();
      fireEvent.click(tab);
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
    }
  });

  it("keeps each tab's own scroll position: new tabs at the top, a tab come back to where it was left", async () => {
    renderPage();
    await screen.findByRole("tab", { name: /^Overview/ });
    // M225: the tabs scroll in the page's own region under the header, not in `.app-main`.
    const region = document.querySelector<HTMLElement>(".statistics-page > .screen-region")!;
    let top = 0;
    Object.defineProperty(region, "scrollTop", { configurable: true, get: () => top, set: (v) => (top = v) });
    const scrollTo = vi.fn((arg: { top: number }) => {
      top = arg.top;
    });
    Object.defineProperty(region, "scrollTo", { configurable: true, value: scrollTo });

    top = 420; // read down Overview
    fireEvent.click(screen.getByRole("tab", { name: /^Health/ }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
    top = 90; // a little way down Health
    fireEvent.click(screen.getByRole("tab", { name: /^Overview/ }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 420 });
    fireEvent.click(screen.getByRole("tab", { name: /^Health/ }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 90 });
    fireEvent.click(screen.getByRole("tab", { name: /^Plays/ }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0 });
  });

  it("asks for a tab's place again when its data first arrives, and never paints at the old place", async () => {
    let release: (value: unknown) => void = () => {};
    install({ getStatisticsHealth: vi.fn(() => new Promise((resolve) => (release = resolve))) });
    renderPage();
    await screen.findByRole("tab", { name: /^Overview/ });
    // M225: the tabs scroll in the page's own region under the header, not in `.app-main`.
    const region = document.querySelector<HTMLElement>(".statistics-page > .screen-region")!;
    let top = 0;
    Object.defineProperty(region, "scrollTop", { configurable: true, get: () => top, set: (v) => (top = v) });
    const scrollTo = vi.fn((arg: { top: number }) => {
      top = arg.top;
    });
    Object.defineProperty(region, "scrollTo", { configurable: true, value: scrollTo });

    fireEvent.click(screen.getByRole("tab", { name: /^Health/ }));
    top = 300; // read down Health's placeholder
    fireEvent.click(screen.getByRole("tab", { name: /^Overview/ }));
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: /^Health/ }));
    // Asked for at once (the layout effect), before any paint ...
    expect(scrollTo).toHaveBeenCalledWith({ top: 300 });
    scrollTo.mockClear();
    // ... and again once the data has made the page long enough to reach it.
    release(health());
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 300 }));
  });

  it("shows no fix chip when nothing needs fixing", async () => {
    install({
      getStatisticsHealth: vi.fn().mockResolvedValue({
        ...health(),
        files: { present: count(4000), missing: count(0), unreadable: count(0), not_checked: count(0) },
        beatport: { ...health().beatport, needs_review: count(0) },
      }),
    });
    renderPage();

    await within(panel("health")).findByRole("heading", { level: 3, name: "Files", hidden: true });
    expect(screen.getByRole("tab", { name: "Health" })).toBeInTheDocument();
    expect(screen.queryByText(/issues/)).not.toBeInTheDocument();
  });

  it("keeps each tab's state while another is shown", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Plays" }));
    // M224: Since is in the header beside "Which tracks" while Plays is shown.
    const since = await screen.findByRole("combobox", { name: "Since" });
    expect(since.closest(".cp-screen-header")).not.toBeNull();
    await userEvent.selectOptions(since, "30d");
    const card = panel("plays").querySelector(".plays__unplayed");

    await userEvent.click(screen.getByRole("tab", { name: /^Overview/ }));
    expect(panel("overview")).toBeVisible();
    expect(panel("plays")).not.toBeVisible();
    // Only Plays has a Since.
    expect(screen.queryByRole("combobox", { name: "Since" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Plays" }));

    // The choice is still made, and the panel was hidden, not rebuilt.
    expect(screen.getByRole("combobox", { name: "Since" })).toHaveValue("30d");
    expect(panel("plays").querySelector(".plays__unplayed")).toBe(card);
  });

  it("puts the scope picker beside the title and says what is counted in one summary line", async () => {
    renderPage();
    const picker = await screen.findByRole("combobox", { name: "Which tracks" });
    const header = screen.getByRole("banner");
    expect(header).toContainElement(picker);
    expect(picker.closest(".cp-screen-header__beside")).not.toBeNull();
    expect(header.querySelector(".cp-screen-header__summary")).not.toBeNull();
  });

  it("writes the summary as '<count> <noun> · <fact>' for a scope too (C233)", async () => {
    window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:10");
    install({ getStatisticsSpreads: vi.fn().mockResolvedValue({ ...spreads(4), scope: "collection:10" }) });
    renderPage();
    await screen.findByRole("combobox", { name: "Which tracks" });
    await waitFor(() =>
      expect(document.querySelector(".cp-screen-header__summary")).toHaveTextContent("4 tracks · Box"),
    );
  });

  it("sizes the scope picker like Prepare's Set picker: to content up to a limit, text at the left (Q17)", () => {
    const wrap = /\.statistics-page__scope\s*\{([^}]*)\}/.exec(css)![1]!;
    // It shrinks with the header (the shared header cuts its text with an ellipsis).
    expect(wrap).toMatch(/min-width:\s*0/);
    expect(wrap).toMatch(/max-width:\s*calc\(320px/);
    expect(wrap).not.toMatch(/cqi|100%/);
    const control = /\.statistics-page__scope \.cp-select__control\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(control).toMatch(/text-align:\s*left/);
  });

  it("gives every table column heading the one small header style (Q16)", () => {
    const rule = /\.rank__columns > \.rank__hash,[^{]*\.plays__columns-head > \.rank__number\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/font-size:\s*inherit/);
    expect(rule).toMatch(/font-family:\s*inherit/);
    // The header's own size is the shared list look's: the label role, 10.5 (P2).
    expect(grid).toMatch(/\.cp-data-grid__head\s*\{[^}]*font-size:\s*var\(--font-size-label\)/);
  });

  it("with no library says the one empty block (Q10, Q8)", async () => {
    install({ getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: true, track_count: 0 }) });
    renderPage();
    expect(await screen.findByText("No library yet")).toBeInTheDocument();
    expect(screen.queryByText(/no library to count/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Import a library" })).toBeNull();
  });

  it("shows each tab reading while its answer is on the way", async () => {
    install({
      getStatisticsPlays: vi.fn(never),
      getStatisticsSpreads: vi.fn(never),
      getStatisticsHealth: vi.fn(never),
    });
    renderPage();

    await screen.findByRole("tab", { name: "Plays" });
    const reading = (id: "overview" | "plays" | "health") =>
      within(panel(id)).getByRole("status", { hidden: true });
    expect(reading("plays")).toHaveTextContent("Loading plays");
    expect(reading("overview")).toHaveTextContent("Loading your library");
    expect(reading("health")).toHaveTextContent("Loading health");
  });

  it("fills each tab with what was read, and invents nothing", async () => {
    renderPage();

    const plays = await panel("plays");
    await waitFor(() => expect(within(plays).getByText("3,120")).toBeInTheDocument());
    expect(within(plays).getByText("41")).toBeInTheDocument();
    expect(
      within(panel("overview")).getByRole("heading", { level: 3, name: "Keys", hidden: true }),
    ).toBeInTheDocument();
    expect(
      within(panel("health")).getByText(checkedLine("2026-10-08T12:00:00Z")),
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

    expect(await screen.findByText("No library yet")).toBeInTheDocument();
    expect(panel("plays")).not.toBeInTheDocument();
    expect(mock("getStatisticsPlays")).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Import a Rekordbox file…" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
    expect(JSON.parse(screen.getByTestId("where").dataset.state!)).not.toBeNull();
  });

  it("says play history starts at the next refresh when there is none yet", async () => {
    install({
      getStatisticsPlays: vi.fn().mockResolvedValue(plays({ history_from: null, last_read: null, last_read_id: null })),
    });
    renderPage();

    const section = await panel("plays");
    expect(await within(section).findByText("Play history starts at your next refresh")).toBeInTheDocument();
    // The shared compact empty state, starting 12 under the header like every other (C30, C140).
    expect(section.querySelector(".cp-empty-state--compact")).toHaveTextContent("Play history starts at your next refresh");
    expect(section.querySelector(".statistics-empty")).toBeNull();
    // All-time counts are still the section's content.
    expect(within(section).getByText("3,120")).toBeInTheDocument();
  });

  it("leaves the note out once there is history", async () => {
    renderPage();
    const section = await panel("plays");
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

    const section = await panel("plays");
    expect(await within(section).findByText("Plays could not be read.")).toBeInTheDocument();
    expect(section).not.toHaveTextContent(/engine said no/);
    expect(reportUnexpected).toHaveBeenCalled();
    // The other sections are not taken down with it.
    await within(panel("health")).findByText(checkedLine("2026-10-08T12:00:00Z"));

    await userEvent.click(screen.getByRole("tab", { name: "Plays" }));
    await userEvent.click(within(section).getByRole("button", { name: "Try again" }));

    expect(await within(section).findByText(/Never played/)).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("uses none of the words the app keeps out of its text", async () => {
    renderPage();
    const section = await panel("plays");
    await within(section).findByText(/Never played/);

    expect(document.body.textContent).not.toMatch(/\b(engine|jobs?|quer(y|ies))\b/i);
  });

  describe("the scope picker (DEC-162)", () => {
    it("offers the whole library first, then the playlists and the Collections", async () => {
      renderPage();

      const picker = await screen.findByRole("combobox", { name: "Which tracks" });
      await waitFor(() => expect(within(picker).getAllByRole("option").length).toBeGreaterThan(1));
      const options = within(picker).getAllByRole("option");
      expect(options[0]).toHaveTextContent("All tracks");
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
      const picker = await screen.findByRole("combobox", { name: "Which tracks" });
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
      expect(screen.getByRole("combobox", { name: "Which tracks" })).toHaveValue("collection:10");
    });

    it("falls back to the whole library when the remembered playlist is gone", async () => {
      window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "path:No such playlist");
      renderPage();

      await waitFor(() =>
        expect(mock("getStatisticsPlays")).toHaveBeenCalledWith({ limit: 10, scope: "library" }),
      );
      expect(mock("getStatisticsPlays")).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("combobox", { name: "Which tracks" })).toHaveValue("library");
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
      expect(screen.getByRole("combobox", { name: "Which tracks" })).toHaveValue("playlist:41");
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

      const picker = await screen.findByRole("combobox", { name: "Which tracks" });
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

      const picker = await screen.findByRole("combobox", { name: "Which tracks" });
      expect(picker).toBeDisabled();
      expect(mock("getStatisticsPlays")).not.toHaveBeenCalled();
      release({ collections: [], total: 0 });
      await waitFor(() => expect(picker).toBeEnabled());
    });

    it("does not draw the picker before the summary says there is a library", async () => {
      install({ getLibrarySummary: vi.fn(never) });
      renderPage();

      await screen.findByRole("heading", { level: 1, name: "Statistics" });
      expect(screen.queryByRole("combobox", { name: "Which tracks" })).not.toBeInTheDocument();
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

      const picker = await screen.findByRole("combobox", { name: "Which tracks" });
      await waitFor(() => expect(picker).toBeEnabled());
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await userEvent.selectOptions(picker, "playlist:2");
      const section = panel("plays");
      await within(section).findByText("222");

      await act(async () => late(plays({ never_played: count(111) })));

      expect(within(section).getByText("222")).toBeInTheDocument();
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
        const picker = await screen.findByRole("combobox", { name: "Which tracks" });
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

    // The cache reads the scope on screen again the moment the library announces, in the
    // same tick as the trees, so a scope the new trees no longer have is read once and
    // refused. What matters is that the page does not take that for a failure.
    describe("a scope the refreshed trees no longer have", () => {
      const gone = () => Object.assign(new Error("No such Collection"), { status: 404, code: "NOT_FOUND" });

      async function dropScopeWhileTreesRefresh(): Promise<{ release: () => void; deadBefore: number }> {
        window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, "collection:10");
        let release!: () => void;
        const later = new Promise<{ collections: CollectionNode[]; total: number }>((resolve) => {
          release = () => resolve({ collections: [], total: 0 });
        });
        const collections = vi
          .fn()
          .mockResolvedValueOnce({ collections: [collection(10, "Box", "collection")], total: 1 })
          .mockReturnValue(later);
        const asked = (params: { scope: string }) =>
          params.scope === "collection:10" ? Promise.resolve(plays()) : Promise.resolve(plays());
        install({
          getCollections: collections,
          getStatisticsPlays: vi.fn(asked),
        });
        renderPage();
        await waitFor(() =>
          expect(mock("getStatisticsPlays")).toHaveBeenCalledWith(
            expect.objectContaining({ scope: "collection:10" }),
          ),
        );
        await screen.findByText("3,120");
        // From here the dead scope is refused, as the engine does.
        mock("getStatisticsPlays").mockImplementation((params: { scope: string }) =>
          params.scope === "collection:10" ? Promise.reject(gone()) : Promise.resolve(plays()),
        );
        mock("getStatisticsSpreads").mockImplementation((params: { scope: string }) =>
          params.scope === "collection:10" ? Promise.reject(gone()) : Promise.resolve(spreads()),
        );
        mock("getStatisticsHealth").mockImplementation((params: { scope: string }) =>
          params.scope === "collection:10" ? Promise.reject(gone()) : Promise.resolve(health()),
        );
        const deadBefore = mock("getStatisticsPlays").mock.calls.filter(
          ([params]) => params.scope === "collection:10",
        ).length;
        act(() => announceLibraryChange());
        await waitFor(() => expect(mock("getCollections")).toHaveBeenCalledTimes(2));
        // Let the refused reads land while the collection tree is still on its way.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { release, deadBefore };
      }

      it("shows no failure for it while the trees refresh, then reads the whole library once", async () => {
        const before = () => mock("getStatisticsPlays").mock.calls.length;
        const { release } = await dropScopeWhileTreesRefresh();
        expect(before()).toBeGreaterThan(0);

        expect(screen.queryByText(/could not be read/)).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

        const callsBeforeRelease = before();
        await act(async () => release());
        await waitFor(() =>
          expect(mock("getStatisticsPlays")).toHaveBeenLastCalledWith({ limit: 10, scope: "library" }),
        );
        const after = mock("getStatisticsPlays").mock.calls.slice(callsBeforeRelease);
        expect(after.filter(([params]) => params.scope === "library")).toEqual([
          [{ limit: 10, scope: "library" }],
        ]);
        expect(screen.queryByText(/could not be read/)).toBeNull();
      });

      it("does not relearn \"Your last refresh\" because of it", async () => {
        window.localStorage.setItem(PLAYS_STORAGE_KEY, JSON.stringify({ limit: 10, since: "refresh" }));
        const { release, deadBefore } = await dropScopeWhileTreesRefresh();
        const dead = () =>
          mock("getStatisticsPlays").mock.calls.filter(([params]) => params.scope === "collection:10");
        // The announce read the scope on screen's two entries (the first ask, the one by id)
        // once each; neither refusal asked a third time to learn the last read again.
        expect(dead().length).toBe(deadBefore + 2);
        expect(screen.queryByText(/could not be read/)).toBeNull();
        await act(async () => release());
        await waitFor(() =>
          expect(mock("getStatisticsPlays")).toHaveBeenLastCalledWith(
            expect.objectContaining({ scope: "library" }),
          ),
        );
      });
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

    const section = await panel("plays");
    await waitFor(() => expect(section).toHaveTextContent(needsDesktopApp("Statistics")));
    expect(section.querySelector(".cp-empty-state--compact")).not.toBeNull();
  });
});

describe("a link to the Health tab (K3)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  const healthTab = () => screen.getByRole("tab", { name: /^Health/ });

  it("opens the Health tab when the state asks", async () => {
    renderPage({ pathname: "/statistics", state: statisticsFocusState("health") });

    await within(panel("health")).findByRole("heading", { level: 3, name: "Files" });
    expect(healthTab()).toHaveAttribute("aria-selected", "true");
    expect(panel("health")).toBeVisible();
    expect(panel("plays")).not.toBeVisible();
  });

  it("does so for ?section=health too", async () => {
    renderPage("/statistics?section=health");

    await within(panel("health")).findByRole("heading", { level: 3, name: "Files" });
    expect(healthTab()).toHaveAttribute("aria-selected", "true");
  });

  it("opens the tab at once, while Health is still being read", async () => {
    install({ getStatisticsHealth: vi.fn(never) });
    renderPage({ pathname: "/statistics", state: statisticsFocusState("health") });

    await within(panel("health")).findByRole("status");
    expect(healthTab()).toHaveAttribute("aria-selected", "true");
  });

  it("opens it once per navigation: choosing another tab stays, and a re-read does not bring it back", async () => {
    renderPage({ pathname: "/statistics", state: statisticsFocusState("health") });
    await within(panel("health")).findByRole("heading", { level: 3, name: "Files" });

    await userEvent.click(screen.getByRole("tab", { name: "Plays" }));
    act(() => announceLibraryChange());
    await waitFor(() => expect(mock("getStatisticsHealth")).toHaveBeenCalledTimes(2));
    await within(panel("health")).findByRole("heading", { level: 3, name: "Files", hidden: true });

    expect(screen.getByRole("tab", { name: "Plays" })).toHaveAttribute("aria-selected", "true");
    expect(panel("plays")).toBeVisible();
  });

  it("opens on Overview for an ordinary visit", async () => {
    renderPage();

    await within(panel("plays")).findByText("3,120");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(panel("health")).not.toBeVisible();
  });
});

describe("the Health tab is read-only (M220, D22)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install({ startArtworkScan: vi.fn() });
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  it("has no Read artwork button and starts no scan; it links to Clean instead", async () => {
    renderPage({ pathname: "/statistics", state: statisticsFocusState("health") });
    await screen.findByText(/Read-only here/);
    expect(screen.queryByRole("button", { name: "Read artwork" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Read artwork in Clean/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/clean");
    expect(mock("startArtworkScan")).not.toHaveBeenCalled();
  });
});

describe("revisiting the page (C19d)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.clearAllMocks();
  });

  it("revisit shows the old value immediately and refetches after an announce", async () => {
    const first = renderPage();
    const plays = await panel("plays");
    await waitFor(() => expect(within(plays).getByText("3,120")).toBeInTheDocument());
    await waitFor(() =>
      expect(
        within(panel("health")).getByText(/^Checked /),
      ).toBeInTheDocument(),
    );
    first.unmount();

    const reads = () => ({
      summary: mock("getLibrarySummary").mock.calls.length,
      playlists: mock("getLibraryPlaylists").mock.calls.length,
      collections: mock("getCollections").mock.calls.length,
      plays: mock("getStatisticsPlays").mock.calls.length,
      spreads: mock("getStatisticsSpreads").mock.calls.length,
      health: mock("getStatisticsHealth").mock.calls.length,
    });
    const before = reads();

    renderPage();
    // The first render: no section is reading, the numbers are already there.
    expect(screen.queryAllByRole("status")).toEqual([]);
    expect(screen.getByText("3,120")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads()).toEqual(before);

    mock("getStatisticsPlays").mockResolvedValue(plays_(3121));
    act(() => announceLibraryChange());
    expect(await screen.findByText("3,121")).toBeInTheDocument();
    await waitFor(() =>
      expect(reads()).toEqual({
        summary: before.summary + 1,
        playlists: before.playlists + 1,
        collections: before.collections + 1,
        plays: before.plays + 1,
        spreads: before.spreads + 1,
        health: before.health + 1,
      }),
    );
  });
});

function plays_(neverPlayed: number): StatisticsPlays {
  return plays({ never_played: count(neverPlayed) });
}

describe("Statistics accessibility (HARDEN-08)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    install();
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  it.each(["Overview", "Plays", "Health"])("has no WCAG 2.2 A or AA violations on the %s tab", async (name) => {
    renderPage();
    const tab = await screen.findByRole("tab", { name });
    await userEvent.click(tab);
    await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
    // Scan the loaded tab, not its loading line.
    const id = name.toLowerCase() as "overview" | "plays" | "health";
    await waitFor(() => expect(panel(id).textContent?.length ?? 0).toBeGreaterThan(80));
    expect(panel(id).querySelector("[aria-busy='true']")).toBeNull();
    await expectNoAxeViolations();
  });
});
