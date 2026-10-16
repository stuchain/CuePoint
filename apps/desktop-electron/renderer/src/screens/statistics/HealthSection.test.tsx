/**
 * The Health tab (STATS-07, K3): four cards with their stacked bars and legends, a tinted count
 * chip on each thing to fix and where it opens ("Open in Clean"), the not-checked lines, and Read
 * cover art starting the scan.
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
import { healthToFix } from "./healthCount";

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
  not_synced: count(6, "unsaved_values"),
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
const rowOf = (card: string, id: string) =>
  panel(card).querySelector<HTMLElement>(`[data-row="${id}"]`)!;
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

describe("the Health tab (STATS-07, K3)", () => {
  it("shows four cards: Files, Other, Beatport and Analysis", () => {
    renderSection();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Files",
      "Other",
      "Beatport",
      "Analysis",
    ]);
  });

  it("counts what needs fixing: missing, unreadable, to review, duplicates, changed, failed", () => {
    // 12 + 3 + 10 + 7 + 4 + 2
    expect(healthToFix(HEALTH)).toBe(38);
  });

  it("draws a stacked bar and a legend with every state's count in each of the three bar cards", () => {
    renderSection();
    const files = within(panel("files"));
    expect(files.getByRole("img", { name: /^Files: Present 80, Missing 12, Unreadable 3, Not checked 5$/ })).toBeInTheDocument();
    for (const text of ["Present 80", "Missing 12", "Unreadable 3", "Not checked 5"]) {
      expect(files.getByText(text)).toBeInTheDocument();
    }
    const beatport = within(panel("beatport"));
    for (const text of ["Confirmed 50", "To review 10", "Rejected 2", "No match 3", "Not matched 35"]) {
      expect(beatport.getByText(text)).toBeInTheDocument();
    }
    const analysis = within(panel("analysis"));
    for (const text of ["Analyzed 40", "Waiting 30", "Failed 2", "No file 28"]) {
      expect(analysis.getByText(text)).toBeInTheDocument();
    }
  });

  it("says how many tracks are matched, and when the files were checked", () => {
    renderSection();
    expect(within(panel("beatport")).getByText("50 of 100 matched")).toBeInTheDocument();
    expect(within(panel("files")).getByText(`checked ${whenOf(HEALTH.checked_at!)}`)).toBeInTheDocument();
    expect(within(panel("analysis")).getByText("waveforms and loudness")).toBeInTheDocument();
  });

  it("says the files have not been checked yet when no check is recorded", () => {
    renderSection({ ...HEALTH, checked_at: null });
    expect(within(panel("files")).getByText("not checked yet")).toBeInTheDocument();
  });

  it("writes each row's count in a chip, tinted by what it is", () => {
    renderSection();
    const chip = (card: string, id: string) =>
      rowOf(card, id).querySelector(".cp-badge") as HTMLElement;
    expect(chip("files", "missing")).toHaveTextContent("12");
    expect(chip("files", "missing")).toHaveClass("cp-badge--danger");
    expect(chip("files", "not_checked")).toHaveClass("cp-badge--neutral");
    expect(chip("beatport", "needs_review")).toHaveClass("cp-badge--warning");
    expect(chip("beatport", "not_synced")).toHaveTextContent("6");
    expect(chip("beatport", "not_synced")).toHaveClass("cp-badge--accent");
    expect(chip("other", "duplicates")).toHaveClass("cp-badge--warning");
    expect(chip("analysis", "failed")).toHaveClass("cp-badge--danger");
    expect(chip("analysis", "waiting")).toHaveTextContent("30");
  });

  it("keeps a zero plain and offers nothing to open", () => {
    renderSection({
      ...HEALTH,
      files: { ...HEALTH.files, missing: count(0, "missing") },
    });
    const missing = rowOf("files", "missing");
    expect(missing.querySelector(".cp-badge")).toHaveClass("cp-badge--neutral");
    expect(within(missing).queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a link on a row only where something can be done about it", () => {
    renderSection();
    expect(within(rowOf("files", "not_checked")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rowOf("analysis", "waiting")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(rowOf("files", "missing")).getByRole("button", { name: /Open in Clean/ })).toBeInTheDocument();
  });

  it("opens Clean's Missing files tab from Missing and Unreadable", async () => {
    renderSection();
    await userEvent.click(within(rowOf("files", "missing")).getByRole("button"));
    expect(where()).toHaveTextContent("/clean");
    expect(where().dataset.section).toBe("missing");
  });

  it("opens Clean's Match tab from To review, Not matched yet and No match found", async () => {
    for (const id of ["needs_review", "not_matched", "no_match"]) {
      const { unmount } = renderSection();
      await userEvent.click(within(rowOf("beatport", id)).getByRole("button"));
      expect(where().dataset.section).toBe("review");
      unmount();
    }
  });

  it("opens Clean's Duplicates tab from Duplicates, and Match from Changed since you decided", async () => {
    const first = renderSection();
    await userEvent.click(within(rowOf("other", "duplicates")).getByRole("button"));
    expect(where().dataset.section).toBe("duplicates");
    first.unmount();
    renderSection();
    await userEvent.click(within(rowOf("other", "disputed")).getByRole("button"));
    expect(where().dataset.section).toBe("review");
  });

  it("opens the Library on the engine's own rules for Not synced to files and No cover art", async () => {
    const first = renderSection();
    await userEvent.click(within(rowOf("beatport", "not_synced")).getByRole("button", { name: /Open in Library/ }));
    expect(where()).toHaveTextContent("/library");
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.not_synced.rules);
    first.unmount();
    renderSection();
    await userEvent.click(within(rowOf("other", "no_artwork")).getByRole("button", { name: /Open in Library/ }));
    expect(JSON.parse(where().dataset.rules!)).toEqual(HEALTH.other.no_artwork.rules);
  });

  it("opens Settings on Waveforms from Failed", async () => {
    renderSection();
    await userEvent.click(within(rowOf("analysis", "failed")).getByRole("button", { name: /Open in Settings/ }));
    expect(where()).toHaveTextContent("/settings");
    expect(where().dataset.settings).toBe("waveforms");
  });

  it("says when the cover art was last read, and when it never was", () => {
    const first = renderSection();
    expect(within(panel("other")).getByText(`Cover art last read ${whenOf(HEALTH.artwork_checked_at!)}`)).toBeInTheDocument();
    first.unmount();
    renderSection({ ...HEALTH, artwork_checked_at: null });
    expect(within(panel("other")).getByText("Cover art has not been read yet")).toBeInTheDocument();
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

  it("no longer offers All health checks or any way into Clean's Health tab", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: "All health checks" })).not.toBeInTheDocument();
    for (const name of ["Check files", "Match", "Analyze"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });
});
