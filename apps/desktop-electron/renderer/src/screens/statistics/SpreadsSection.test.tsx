/**
 * The charts of the Library tab (STATS-06): each panel's bars and names, the line for the
 * tracks it cannot place, the loudness panel without clicks, and a bar's navigation.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsBucket,
  StatisticsSpread,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { rulesFromLocationState } from "../library/libraryLink";
import { SpreadsSection } from "./SpreadsSection";

const rules = (field: string, value: unknown): FilterRuleSet => ({
  match: "all",
  rules: [{ field, operator: "is", value }],
});

const bucket = (
  label: string,
  value: string | number | null,
  count: number,
  r: FilterRuleSet | null,
): StatisticsBucket => ({ label, value, count, rules: r });

const spread = (
  buckets: StatisticsBucket[],
  unknown = 0,
  unknownLabel = "Unknown",
  unknownRules: FilterRuleSet | null = null,
): StatisticsSpread => ({
  buckets,
  unknown: { label: unknownLabel, count: unknown, rules: unknownRules },
  total: buckets.reduce((sum, b) => sum + b.count, unknown),
});

const SPREADS: StatisticsSpreads = {
  scope: "library",
  total: 2212,
  total_seconds: 0,
  average_seconds: null,
  average_bpm: null,
  artists: [],
  labels: [],
  genre: spread(
    [
      bucket("Techno", "Techno", 900, rules("genre", "Techno")),
      bucket("House", "House", 700, rules("genre", "House")),
      bucket("Other", null, 20, null),
    ],
    5,
    "No genre",
    { match: "all", rules: [{ field: "genre", operator: "is_empty" }] },
  ),
  tempo: spread(
    [
      bucket("123 BPM", 123, 40, rules("bpm", 123)),
      bucket("124 BPM", 124, 312, rules("bpm", 124)),
    ],
    41,
    "No tempo",
    { match: "all", rules: [{ field: "bpm", operator: "is_empty" }] },
  ),
  year: spread(
    [bucket("2018", 2018, 3, null), bucket("2019", 2019, 8, rules("year", 2019))],
    0,
    "No year",
  ),
  date_added: spread([bucket("2026-09", "2026-09", 12, rules("date_added", "2026-09"))], 3, "Unknown date"),
  rating: spread(
    [bucket("0 stars", 0, 0, rules("rating", 0)), bucket("5 stars", 5, 70, rules("rating", 5))],
    1,
    "Unrated",
    { match: "all", rules: [{ field: "rating", operator: "is_empty" }] },
  ),
  loudness: {
    ...spread([bucket("-9 LUFS", -9, 55, null), bucket("-8 LUFS", -8, 30, null)], 17, "Not measured"),
    no_file: { label: "No file", count: 4, rules: null },
  },
};

function Where() {
  const location = useLocation();
  const carried = rulesFromLocationState(location.state);
  return (
    <p data-testid="where" data-rules={JSON.stringify(carried)}>
      {location.pathname}
    </p>
  );
}

function renderSection(spreads = SPREADS) {
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <SpreadsSection
        spreads={spreads}
        charts={["tempo", "year", "date_added", "rating", "loudness"]}
      />
      <Where />
    </MemoryRouter>,
  );
}

const IDS: Record<string, string> = {
  Tempo: "tempo",
  Year: "year",
  "Date added": "date_added",
  Rating: "rating",
  Loudness: "loudness",
};
const panel = (name: string) =>
  document.querySelector<HTMLElement>(`[data-panel="${IDS[name]}"]`)!;
const titleOf = (el: Element) => el.querySelector(":scope > title")?.textContent ?? null;
const bars = (name: string) =>
  within(panel(name))
    .queryAllByRole("button")
    .filter((el) => el.tagName.toLowerCase() === "g")
    .map(titleOf);

describe("the spreads (STATS-06)", () => {
  it("shows the five charts it is asked for, in the order it is asked", () => {
    renderSection();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["BPM", "Year", "Date added", "Rating", "Loudness"]);
  });

  it("draws only the charts it is asked for", () => {
    render(
      <MemoryRouter>
        <SpreadsSection spreads={SPREADS} charts={["year", "loudness"]} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Year",
      "Loudness",
    ]);
  });

  it("names tempo bars like '124 BPM, 312 tracks'", () => {
    renderSection();
    expect(bars("Tempo")).toEqual(["123 BPM, 40 tracks", "124 BPM, 312 tracks"]);
  });

  it("shows a ⋯ break between 139 and 170, and the holes of a short stretch as empty bins", () => {
    const tempo = spread([
      bucket("138 BPM", 138, 4, rules("bpm", 138)),
      bucket("140 BPM", 140, 6, rules("bpm", 140)),
      bucket("170 BPM", 170, 2, rules("bpm", 170)),
    ]);
    const { container } = renderSection({ ...SPREADS, tempo });
    const slots = [...panel("Tempo").querySelectorAll("[data-bar-slot]")];
    const axis = slots.map((slot) => slot.querySelector("text.cp-pixel-bars__label")?.textContent ?? null);
    // 138, empty 139, 140, one ⋯ for 141-169, 170.
    expect(slots).toHaveLength(5);
    expect(axis[0]).toBe("138");
    expect(axis[3]).toBe("⋯");
    expect(titleOf(slots[1]!)).toBe("139 BPM, 0 tracks");
    expect(titleOf(slots[3]!)).toBeNull();
    expect(slots[3]).toHaveAttribute("aria-hidden", "true");
    expect(bars("Tempo")).toEqual(["138 BPM, 4 tracks", "140 BPM, 6 tracks", "170 BPM, 2 tracks"]);
    const rows = within(within(panel("Tempo")).getByRole("table")).getAllByRole("row");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Tempo (BPM)Tracks",
      "1384",
      "1390",
      "1406",
      "1702",
    ]);
    expect(container.querySelectorAll('[data-panel="date_added"] [data-bar-slot]')).toHaveLength(1);
  });

  it("draws each panel's buckets with their counts", () => {
    renderSection();
    // The 2018 bucket has no rule, so it is drawn and is not a button.
    expect(bars("Year")).toEqual(["2019, 8 tracks"]);
    expect(bars("Date added")).toEqual(["2026-09, 12 tracks"]);
    // An empty star bar is drawn but is not a button.
    expect(bars("Rating")).toEqual(["5 stars, 70 tracks"]);
  });

  it("says what each panel cannot place", () => {
    renderSection();
    expect(screen.getByText(/41 tracks have no BPM/)).toBeInTheDocument();
    expect(screen.getByText(/1 track is unrated/)).toBeInTheDocument();
    expect(screen.getByText(/3 tracks have an unknown date added/)).toBeInTheDocument();
    expect(screen.getByText(/17 tracks are not measured yet/)).toBeInTheDocument();
    expect(screen.getByText(/4 tracks have no file to measure/)).toBeInTheDocument();
    // Nothing unplaced, no line.
    expect(screen.queryByText(/no year/)).toBeNull();
  });

  it("gives loudness no clickable bar and no Open button", () => {
    renderSection();
    expect(bars("Loudness")).toEqual([]);
    expect(within(panel("Loudness")).queryAllByRole("button")).toEqual([]);
    expect(within(panel("Loudness")).getAllByText("−9 LUFS, 55 tracks").length).toBeGreaterThan(0);
  });

  it("draws every panel as a Card with its unit at the right, and loudness with a true minus", () => {
    renderSection();
    expect(panel("Loudness").classList.contains("cp-card")).toBe(true);
    expect(panel("Loudness").querySelector(".cp-card__unit")).toHaveTextContent("LUFS");
    expect(panel("Tempo").querySelector(".cp-card__unit")).toHaveTextContent("tracks");
    const text = panel("Loudness").textContent ?? "";
    expect(text).not.toMatch(/(^|\s)-\d/);
  });

  it("opens the Library on a bar's rules", async () => {
    const user = userEvent.setup();
    renderSection();
    const bar = within(panel("Tempo"))
      .getAllByRole("button")
      .find((el) => titleOf(el) === "124 BPM, 312 tracks")!;
    await user.click(bar);
    const where = screen.getByTestId("where");
    expect(where).toHaveTextContent("/library");
    expect(JSON.parse(where.getAttribute("data-rules")!)).toEqual(rules("bpm", 124));
  });

  it("does not open anything for a bucket without rules", async () => {
    const user = userEvent.setup();
    renderSection();
    const noRule = within(panel("Year"))
      .queryAllByRole("button")
      .find((el) => titleOf(el)?.startsWith("2018"));
    expect(noRule).toBeUndefined();
    // Click the bar itself (its fill and its slot), then a loudness bar.
    const noRuleSlot = panel("Year").querySelector('[data-bar-slot="0"]')!;
    expect(titleOf(noRuleSlot)).toBe("2018, 3 tracks");
    await user.click(noRuleSlot.querySelector("rect[data-bar]")!);
    await user.click(noRuleSlot);
    await user.click(panel("Loudness").querySelector("rect[data-bar]")!);
    expect(screen.getByTestId("where")).toHaveTextContent("/statistics");
  });

  it("writes the full name of a pointed-at bar under the chart", async () => {
    const user = userEvent.setup();
    renderSection();
    const tempo = panel("Tempo");
    expect(within(tempo).queryByText(/to read it/)).not.toBeInTheDocument();
    await user.hover(tempo.querySelector('[data-bar-slot="1"]')!);
    expect(within(tempo).getByText("124 BPM, 312 tracks", { selector: "p" })).toBeInTheDocument();
    await user.unhover(tempo.querySelector('[data-bar-slot="1"]')!);
    expect(within(tempo).queryByText("124 BPM, 312 tracks", { selector: "p" })).not.toBeInTheDocument();
  });

  it("groups thousands the American way, and puts units in the screen-reader table", () => {
    const big = { ...SPREADS, tempo: spread([bucket("124 BPM", 124, 1312, rules("bpm", 124))], 2000, "No BPM") };
    renderSection(big);
    const tempo = panel("Tempo");
    expect(within(tempo).getByText(/2,000 tracks have no BPM/)).toBeInTheDocument();
    expect(within(tempo).getAllByText("1,312").length).toBeGreaterThan(0);
    expect(within(tempo).getByRole("columnheader", { name: "Tempo (BPM)" })).toBeInTheDocument();
    expect(
      within(panel("Loudness")).getByRole("columnheader", { name: "Loudness (LUFS)" }),
    ).toBeInTheDocument();
  });

  it("opens the Library on the tracks a line holds, with a visible button", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Open in Library: No tempo" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/library");
    expect(JSON.parse(screen.getByTestId("where").getAttribute("data-rules")!)).toEqual({
      match: "all",
      rules: [{ field: "bpm", operator: "is_empty" }],
    });
    // A line with no rule (an unknown date) has no button.
    expect(screen.queryByRole("button", { name: "Open in Library: Unknown date" })).toBeNull();
  });

  it("says so when a panel has nothing to chart", () => {
    renderSection({ ...SPREADS, year: spread([], 0, "No year") });
    expect(within(panel("Year")).getByText("Nothing here to chart.")).toBeInTheDocument();
  });
});
