/**
 * The Health section (STATS-07, K3): four groups with their bars, purposes and names, one button
 * each to where it is dealt with, the not-checked lines, a bar's navigation, the waveform bars
 * that open nothing, and Read cover art starting the scan.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  FilterRuleSet,
  StatisticsCount,
  StatisticsHealth,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { cleanSectionOpening } from "../clean/cleanLink";
import { rulesFromLocationState } from "../library/libraryLink";
import { settingsFocus } from "../settingsLink";
import { formatDayTime } from "../../format/dates";
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
  other: {
    duplicates: count(7, "duplicates"),
    disputed: count(4, "disputed"),
    no_artwork: count(9, "no_artwork"),
  },
  artwork_checked_at: "2026-09-05T12:00:00Z",
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

function renderSection(
  health = HEALTH,
  props: { coverArtRunning?: boolean; onReadCoverArt?: () => void } = {},
) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/statistics"]}>
        <HealthSection
          health={health}
          coverArtRunning={props.coverArtRunning ?? false}
          onReadCoverArt={props.onReadCoverArt ?? (() => {})}
        />
        <Where />
      </MemoryRouter>
    </ToastProvider>,
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
/** An instant as the page writes it (the day and the time, on this computer), so the tests hold in any time zone. */
const whenOf = (iso: string) => formatDayTime(iso);
const where = () => screen.getByTestId("where");

beforeEach(() => {
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    startArtworkScan: vi.fn().mockResolvedValue({ job_id: "j1", id: "j1", state: "queued" }),
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the Health section (STATS-07, K3)", () => {
  it("shows four groups: files, Beatport, waveforms and other", () => {
    renderSection();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Files",
      "Beatport",
      "Waveforms",
      "Other",
    ]);
  });

  it("gives each group a line saying what it is for", () => {
    renderSection();
    expect(within(panel("files")).getByText("Looks for tracks whose file has moved or been deleted.")).toBeInTheDocument();
    expect(
      within(panel("beatport")).getByText(
        "How your tracks stand against Beatport: matched, waiting for you, or not matched yet.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel("waveforms")).getByText(
        "Draws each track's waveform so you can see its shape before you play it.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel("other")).getByText(
        "Duplicate tracks, matches Beatport changed after you decided, and the cover pictures stored inside your audio files.",
      ),
    ).toBeInTheDocument();
  });

  it("has exactly one button in each group", () => {
    renderSection();
    for (const id of ["files", "beatport", "waveforms", "other"]) {
      const buttons = within(panel(id))
        .getAllByRole("button")
        .filter((el) => el.tagName.toLowerCase() === "button");
      expect(buttons, id).toHaveLength(1);
    }
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
      "Confirmed, 50 tracks",
      "Waiting for you, 10 tracks",
      "Rejected, 2 tracks",
      "No match, 3 tracks",
      "Not matched, 35 tracks",
    ]);
  });

  it("draws the three Other counts in Clean's words", () => {
    renderSection();
    expect(bars("other")).toEqual([
      "Duplicates, 7 tracks",
      "Changed since you decided, 4 tracks",
      "No artwork, 9 tracks",
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

  it("says when the files were last checked, with the time on the computer's clock", () => {
    renderSection();
    expect(within(panel("files")).getByText(`Last checked ${whenOf("2026-09-03T12:00:00Z")}`)).toBeInTheDocument();
  });

  it("reads a time with an explicit offset the same way", () => {
    renderSection({ ...HEALTH, checked_at: "2026-09-03T12:00:00+00:00" });
    expect(within(panel("files")).getByText(`Last checked ${whenOf("2026-09-03T12:00:00Z")}`)).toBeInTheDocument();
  });

  it("says the files have not been checked yet when no check is recorded", () => {
    renderSection({ ...HEALTH, checked_at: null });
    expect(within(panel("files")).getByText("Files have not been checked yet")).toBeInTheDocument();
  });

  it("says when the cover art was last read", () => {
    renderSection();
    expect(
      within(panel("other")).getByText(`Cover art last read ${whenOf("2026-09-05T12:00:00Z")}`),
    ).toBeInTheDocument();
  });

  it("says the cover art has not been read yet when it never was", () => {
    renderSection({ ...HEALTH, artwork_checked_at: null });
    expect(within(panel("other")).getByText("Cover art has not been read yet")).toBeInTheDocument();
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

  it("opens Clean's Duplicates tab from the Duplicates bar", async () => {
    renderSection();
    await userEvent.click(bar("other", "Duplicates, 7 tracks"));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("duplicates");
  });

  it("opens the Library on the other two Other bars' own rules", async () => {
    renderSection();
    await userEvent.click(bar("other", "Changed since you decided, 4 tracks"));
    expect(where()).toHaveTextContent("/library");
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.other.disputed.rules);
  });

  it("opens the Library on No artwork's rules", async () => {
    renderSection();
    await userEvent.click(bar("other", "No artwork, 9 tracks"));
    expect(where()).toHaveTextContent("/library");
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.other.no_artwork.rules);
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

  it("sends Files' button to Clean's Missing files tab", async () => {
    renderSection();
    await userEvent.click(within(panel("files")).getByRole("button", { name: "Open in Clean" }));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("missing");
  });

  it("sends Beatport's button to Clean's Match tab", async () => {
    renderSection();
    await userEvent.click(within(panel("beatport")).getByRole("button", { name: "Open in Clean" }));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("review");
  });

  it("sends Waveforms' button to Settings on Waveforms", async () => {
    renderSection();
    await userEvent.click(within(panel("waveforms")).getByRole("button", { name: "Open in Settings" }));
    expect(where()).toHaveTextContent("/settings");
    expect(where().dataset.settings).toBe("waveforms");
  });

  it("asks the page to read the cover art when Read cover art is pressed", async () => {
    const onReadCoverArt = vi.fn();
    renderSection(HEALTH, { onReadCoverArt });
    await userEvent.click(within(panel("other")).getByRole("button", { name: "Read cover art" }));
    expect(onReadCoverArt).toHaveBeenCalledTimes(1);
  });

  it("disables Read cover art and shows it busy while the read runs", async () => {
    const onReadCoverArt = vi.fn();
    renderSection(HEALTH, { coverArtRunning: true, onReadCoverArt });
    const button = within(panel("other")).getByRole("button", { name: "…" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("cp-btn--loading");
    await userEvent.click(button);
    expect(onReadCoverArt).not.toHaveBeenCalled();
  });

  it("no longer offers All health checks or any way into Clean's Health tab", async () => {
    renderSection();
    expect(screen.queryByRole("button", { name: "All health checks" })).not.toBeInTheDocument();
    for (const name of ["Check files", "Match", "Analyze"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});
