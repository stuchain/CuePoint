/**
 * The Health section (STATS-07): each group's bars and names, the link to where each is fixed,
 * the not-checked line, a bar's navigation, and the waveform bars that open nothing.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsCount,
  StatisticsHealth,
} from "../../api/cuepointBridge.types";
import { cleanSectionOpening } from "../clean/cleanLink";
import { rulesFromLocationState } from "../library/libraryLink";
import { settingsFocus } from "../settingsLink";
import { HealthSection } from "./HealthSection";

const rules = (field: string, value: unknown): FilterRuleSet => ({
  match: "all",
  rules: [{ field, operator: "is", value }],
});
const count = (n: number, field: string): StatisticsCount => ({ count: n, rules: rules(field, n) });

const HEALTH: StatisticsHealth = {
  scope: "library",
  total: 100,
  files: {
    present: count(80, "present"),
    missing: count(12, "missing"),
    unreadable: count(3, "unreadable"),
    not_checked: count(5, "not_checked"),
  },
  beatport: {
    accepted: count(50, "accepted"),
    needs_review: count(10, "needs_review"),
    rejected: count(2, "rejected"),
    no_match: count(3, "no_match"),
    not_matched: count(35, "not_matched"),
  },
  analyzed: { analyzed: 40, failed: 2, waiting: 30, no_file: 28 },
  checked_at: "2026-09-03T12:00:00Z",
};

function Where() {
  const location = useLocation();
  return (
    <p
      data-testid="where"
      data-rules={JSON.stringify(rulesFromLocationState(location.state))}
      data-section={cleanSectionOpening({ state: location.state, key: location.key })?.section ?? ""}
      data-settings={settingsFocus(location)?.focus ?? ""}
    >
      {location.pathname}
    </p>
  );
}

function renderSection(health = HEALTH) {
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <HealthSection health={health} />
      <Where />
    </MemoryRouter>,
  );
}

const panel = (id: string) => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
const titleOf = (el: Element) => el.querySelector(":scope > title")?.textContent ?? null;
const bars = (id: string) =>
  within(panel(id))
    .queryAllByRole("button")
    .filter((el) => el.tagName.toLowerCase() === "g")
    .map(titleOf);
const bar = (id: string, name: string) =>
  within(panel(id))
    .getAllByRole("button")
    .find((el) => titleOf(el) === name)!;
/** The day an instant falls on here, so the tests hold in any time zone (UTC-10 to UTC+14). */
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const where = () => screen.getByTestId("where");

describe("the Health section (STATS-07)", () => {
  it("shows three groups: files, Beatport and waveforms", () => {
    renderSection();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Files",
      "Beatport",
      "Waveforms",
    ]);
  });

  it("draws the four file states with their counts", () => {
    renderSection();
    expect(bars("files")).toEqual([
      "Present, 80 tracks",
      "Missing, 12 tracks",
      "Unreadable, 3 tracks",
      "Not checked, 5 tracks",
    ]);
  });

  it("draws the five Beatport states in the words the rest of the app uses", () => {
    renderSection();
    expect(bars("beatport")).toEqual([
      "Accepted, 50 tracks",
      "Waiting for you, 10 tracks",
      "Rejected (no match), 2 tracks",
      "Not found on Beatport, 3 tracks",
      "Not looked up yet, 35 tracks",
    ]);
  });

  it("draws the waveform counts and none of them is a button", () => {
    renderSection();
    expect(bars("waveforms")).toEqual([]);
    const names = Array.from(panel("waveforms").querySelectorAll("svg g > title")).map(
      (t) => t.textContent,
    );
    expect(names).toEqual([
      "Analyzed, 40 tracks",
      "Failed, 2 tracks",
      "Waiting, 30 tracks",
      "No file, 28 tracks",
    ]);
  });

  it("says when the files were last checked, in American date words", () => {
    renderSection();
    expect(within(panel("files")).getByText(`Last checked ${dayOf("2026-09-03T12:00:00Z")}`)).toBeInTheDocument();
  });

  it("reads a time with an explicit offset the same way", () => {
    renderSection({ ...HEALTH, checked_at: "2026-09-03T12:00:00+00:00" });
    expect(within(panel("files")).getByText(`Last checked ${dayOf("2026-09-03T12:00:00Z")}`)).toBeInTheDocument();
  });

  it("says the files have not been checked yet when no check is recorded", () => {
    renderSection({ ...HEALTH, checked_at: null });
    expect(within(panel("files")).getByText("Files have not been checked yet")).toBeInTheDocument();
  });

  it("opens the Library on a file bar's own rules", async () => {
    renderSection();
    await userEvent.click(bar("files", "Missing, 12 tracks"));
    expect(where()).toHaveTextContent("/library");
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.files.missing.rules);
  });

  it("opens the Library on a Beatport bar's own rules", async () => {
    renderSection();
    await userEvent.click(
      bar("beatport", "Waiting for you, 10 tracks"),
    );
    expect(where()).toHaveTextContent("/library");
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.beatport.needs_review.rules);
  });

  it("does not open anything from a waveform bar", async () => {
    renderSection();
    const slot = Array.from(panel("waveforms").querySelectorAll("svg g[data-bar-slot]"))[0]!;
    await userEvent.click(slot);
    expect(where()).toHaveTextContent("/statistics");
  });

  it("draws an empty bar without making it a button", () => {
    renderSection({
      ...HEALTH,
      files: { ...HEALTH.files, unreadable: count(0, "unreadable") },
    });
    expect(bars("files")).not.toContain("Unreadable, 0 tracks");
    const drawn = Array.from(panel("files").querySelectorAll("svg g > title")).map(
      (t) => t.textContent,
    );
    expect(drawn).toContain("Unreadable, 0 tracks");
  });

  it("links Check files to Clean's Health tab", async () => {
    renderSection();
    await userEvent.click(within(panel("files")).getByRole("button", { name: "Check files" }));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("health");
  });

  it("links Match to Clean's Review matches tab", async () => {
    renderSection();
    await userEvent.click(within(panel("beatport")).getByRole("button", { name: "Match" }));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("review");
  });

  it("links Analyze to Settings on Waveforms", async () => {
    renderSection();
    await userEvent.click(within(panel("waveforms")).getByRole("button", { name: "Analyze" }));
    expect(where()).toHaveTextContent("/settings");
    expect(where().dataset.settings).toBe("waveforms");
  });

  it("opens Clean's Health tab from All health checks", async () => {
    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "All health checks" }));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("health");
  });
});
