/**
 * The Overview tab: four numbers, Genres, Labels and Artists by track count (five rows, the rest
 * behind "Show all N"), and the charts in pairs, with Date added and Rating behind "More charts".
 * A card with nothing to show is not drawn, and an empty scope says so once (D22, M222).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsBucket,
  StatisticsSpread,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { rulesFromLocationState } from "../library/libraryLink";
import { LibrarySection } from "./LibrarySection";
import css from "./statistics.css?raw";

const rules = (field: string, value: unknown): FilterRuleSet => ({
  match: "all",
  rules: [{ field, operator: "is", value }],
});
const bucket = (label: string, value: string | number | null, count: number, r: FilterRuleSet | null): StatisticsBucket => ({
  label,
  value,
  count,
  rules: r,
});
const spread = (buckets: StatisticsBucket[], unknown = 0): StatisticsSpread => ({
  buckets,
  unknown: { label: "Unknown", count: unknown, rules: null },
  total: buckets.reduce((sum, b) => sum + b.count, unknown),
});

const GENRES = ["Tech House", "House", "Minimal", "Melodic", "Deep House", "Afro House", "Techno"];

function spreads(overrides: Partial<StatisticsSpreads> = {}): StatisticsSpreads {
  return {
    scope: "library",
    total: 2847,
    total_seconds: 308 * 3600 + 25 * 60,
    average_seconds: 390,
    average_bpm: 126.4,
    artists: [
      { name: "Chris Stussy", name_key: "chris stussy", tracks: 31, rules: rules("artist_name", "Chris Stussy") },
      { name: "Michael Bibi", name_key: "michael bibi", tracks: 22, rules: rules("artist_name", "Michael Bibi") },
    ],
    labels: [{ name: "Defected", label_key: "defected", tracks: 64, rules: rules("label_name", "Defected") }],
    genre: spread(
      [
        ...GENRES.map((name, i) => bucket(name, name, 900 - i * 100, rules("genre", name))),
        bucket("Other", null, 20, null),
      ],
      5,
    ),
    tempo: {
      ...spread([bucket("126 BPM", 126, 10, rules("bpm", 126))], 12),
      unknown: { label: "No tempo", count: 12, rules: null },
    },
    year: spread([bucket("2020", 2020, 4, rules("year", 2020))]),
    date_added: spread([
      bucket("2025-12", "2025-12", 100, rules("date_added", "2025-12")),
      bucket("2026-03", "2026-03", 300, rules("date_added", "2026-03")),
      bucket("2026-09", "2026-09", 112, rules("date_added", "2026-09")),
    ]),
    rating: spread([bucket("5 stars", 5, 7, rules("rating", 5))]),
    loudness: { ...spread([bucket("-9 LUFS", -9, 5, null)]), no_file: { label: "No file", count: 0, rules: null } },
    ...overrides,
  };
}

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-rules={JSON.stringify(rulesFromLocationState(location.state))}>
      {location.pathname}
    </p>
  );
}

function renderTab(data = spreads()) {
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <LibrarySection
        spreads={data}
        collections={[]}
        now={new Date(2026, 9, 16)}
      />
      <Where />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    getKeysPopulation: vi.fn().mockResolvedValue({ total: 10, no_key: 2, keys: [{ code: "8A", count: 8 }] }),
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

const figure = (id: string) => document.querySelector<HTMLElement>(`[data-figure="${id}"]`)!;

describe("the Overview tab", () => {
  it("shows four numbers with what each is out of", () => {
    renderTab(spreads({ rating: { ...spreads().rating, unknown: { label: "Unrated", count: 47, rules: null } } }));
    // The track count is in the header already, so the first tile is the rated ones (D22).
    expect(figure("rated")).toHaveTextContent("Rated tracks2,80047 not rated");
    expect(figure("tracks")).toBeNull();
    expect(figure("time")).toHaveTextContent("Total time308 h 25 minavg 6:30");
    expect(figure("bpm")).toHaveTextContent("Average BPM126.412 with no BPM");
    // Added in 2026: Mar 300 + Sep 112, not Dec 2025.
    expect(figure("added")).toHaveTextContent("Added this year4122026");
  });

  it("gives every tile a second line, even when it cannot say the usual one (C257)", () => {
    renderTab(spreads({ average_seconds: null, average_bpm: null, total_seconds: 0 }));
    expect(figure("rated")).toHaveTextContent(/^Rated tracks2,847every track is rated$/);
    expect(figure("time")).not.toHaveTextContent("avg");
    expect(figure("time")).toHaveTextContent("no lengths known");
    expect(figure("bpm")).toHaveTextContent(/^Average BPM—/);
    for (const cell of document.querySelectorAll(".library-figures__cell")) {
      expect(cell.querySelectorAll(".library-figures__note")).toHaveLength(1);
    }
  });

  it("says every track has a BPM when none lacks one", () => {
    renderTab(spreads({ tempo: { ...spreads().tempo, unknown: { label: "No tempo", count: 0, rules: null } } }));
    expect(figure("bpm")).toHaveTextContent("Average BPM126.4every track has a BPM");
  });

  it("does not repeat the track count in the tab, and keeps the figure notes quiet and small (C59, C257)", () => {
    const note = /\.library-figures__note\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(note).toContain("font-size: var(--font-size-xs);");
    const quiet = /\.statistics-note\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(quiet).toContain("font-size: var(--font-size-xs);");
  });

  it("puts More charts at the bottom right inside the last card, not floating outside any card (C256)", async () => {
    const user = userEvent.setup();
    renderTab();
    const link = screen.getByRole("button", { name: "More charts: date added, rating" });
    expect(link.closest("section")).toHaveAttribute("data-panel", "loudness");
    await user.click(link);
    expect(screen.getByRole("button", { name: "Fewer charts" }).closest("section")).toHaveAttribute("data-panel", "rating");
  });

  it("lists Genres, Labels and Artists by tracks, five genres first", async () => {
    const user = userEvent.setup();
    renderTab();
    const genres = screen.getByRole("list", { name: "Genres" });
    expect(within(genres).getAllByRole("listitem")).toHaveLength(5);
    expect(within(genres).getByRole("button", { name: "Tech House, 900 tracks" })).toBeInTheDocument();
    // The seven named genres; Other is a rest, not a genre.
    await user.click(within(genres.closest("section")!).getByRole("button", { name: "Show all 7" }));
    expect(within(genres).getAllByRole("listitem")).toHaveLength(7);
    expect(within(genres).queryByRole("button", { name: /^Other/ })).toBeNull();

    const artists = screen.getByRole("list", { name: "Artists" });
    expect(within(artists).getByRole("button", { name: "Chris Stussy, 31 tracks" })).toBeInTheDocument();
    const labels = screen.getByRole("list", { name: "Labels" });
    expect(within(labels).getByRole("button", { name: "Defected, 64 tracks" })).toBeInTheDocument();
  });

  it("opens the Library on exactly the tracks a row counted", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("button", { name: "Michael Bibi, 22 tracks" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
    expect(JSON.parse(screen.getByTestId("where").dataset.rules!)).toEqual(rules("artist_name", "Michael Bibi"));
  });

  it("draws Keys, BPM, Year and Loudness, and keeps Date added and Rating behind More charts", async () => {
    const user = userEvent.setup();
    renderTab();
    const titles = () =>
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent)
        .filter((text) => !["Genres", "Labels", "Artists"].includes(text ?? ""));
    // Pairs, D22: Genres | Labels, Artists | Keys, BPM | Year, then Loudness across the row.
    expect(titles()).toEqual(["Keys", "BPM", "Year", "Loudness"]);

    await user.click(screen.getByRole("button", { name: "More charts: date added, rating" }));
    expect(titles()).toEqual([
      "Keys",
      "BPM",
      "Year",
      "Loudness",
      "Date added",
      "Rating",
    ]);
    await user.click(screen.getByRole("button", { name: "Fewer charts" }));
    expect(titles()).toHaveLength(4);
  });

  it("draws Loudness across the whole row (D22)", () => {
    renderTab();
    expect(document.querySelector('[data-panel="loudness"]')).toHaveClass("statistics-panel--wide");
    expect(document.querySelector('[data-panel="tempo"]')).not.toHaveClass("statistics-panel--wide");
  });

  it("draws no card for a list or chart with nothing in it (M222)", () => {
    renderTab(spreads({ artists: [], labels: [], year: spread([]), tempo: { ...spreads().tempo, buckets: [], unknown: { label: "No tempo", count: 0, rules: null } } }));
    expect(screen.queryByRole("heading", { level: 3, name: "Artists" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Labels" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Year" })).toBeNull();
    expect(screen.queryByText(/Nothing here to chart|No artists to list|No labels to list/)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Genres" })).toBeInTheDocument();
  });

  it("says once that there is nothing to count when the scope has no tracks (M222)", () => {
    renderTab(spreads({ total: 0, artists: [], labels: [], genre: spread([]) }));
    expect(screen.getByText("No tracks to count here")).toBeInTheDocument();
    expect(document.querySelectorAll(".statistics-panel")).toHaveLength(0);
    expect(document.querySelector(".library-figures")).toBeNull();
  });

  it("puts a bar in its own column in the ranked lists, with a heading row over it (D22)", () => {
    renderTab();
    const genres = screen.getByRole("list", { name: "Genres" });
    expect(genres.closest("section")!.querySelector(".rank__columns")).toHaveTextContent("#NameTracks");
    expect(genres.querySelectorAll(".rank__bar > .cp-rank-bar")).toHaveLength(5);
    expect(genres.querySelector(".rank__name .cp-rank-bar")).toBeNull();
  });
});
