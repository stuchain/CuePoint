/**
 * The Health tab (STATS-07, K3): four cards with their stacked bars and legends, a tinted count
 * chip on each thing to fix and where it opens ("Open in Clean"), the not-checked lines, and the
 * page being read-only: the artwork read is in Clean now (M220, D22).
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
import { checkedLine } from "../clean/cleanEmpty";
import { cleanSectionOpening } from "../clean/cleanLink";
import { rulesFromLocationState } from "../library/libraryLink";
import { settingsFocus } from "../settingsLink";
import { formatDayTimeInSentence } from "../../format/dates";
import css from "./statistics.css?raw";
import { HealthSection } from "./HealthSection";
import { healthToFix } from "./healthCount";
import { MATCH_STATE } from "../../format/words";

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

function renderSection(health = HEALTH) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/statistics"]}>
        <HealthSection health={health} />
        <Where />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const panel = (id: string) => document.querySelector<HTMLElement>(`[data-panel="${id}"]`)!;
const rowOf = (card: string, id: string) =>
  panel(card).querySelector<HTMLElement>(`[data-row="${id}"]`)!;
/** An instant as the page writes it (the day and the time, on this computer), so the tests hold in any time zone. */
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
    // Each row is the label, then the count at the right edge, whatever sits between (D22).
    const words = (card: string) =>
      [...panel(card).querySelectorAll(".health-card__row")].map(
        (row) => `${row.querySelector(".health-card__label")!.textContent} ${row.querySelector(".health-card__count")!.textContent}`,
      );
    expect(words("files")).toEqual(expect.arrayContaining(["Present 80", "Missing 12", "Unreadable 3", "Not checked 5"]));
    expect(words("beatport")).toEqual(
      expect.arrayContaining(["Confirmed 50", "To check 10", "Rejected 2", "No match 3", "Not looked up yet 35"]),
    );
    expect(words("analysis")).toEqual(expect.arrayContaining(["Analyzed 40", "Waiting 30", "Failed 2", "No file 28"]));
  });

  it("says how many tracks are matched, and when the files were checked", () => {
    renderSection();
    expect(within(panel("beatport")).getByText("50 of 100 confirmed")).toBeInTheDocument();
    // Worded as Clean words the same check: "Checked today, 9:19 PM" (C170).
    expect(within(panel("files")).getByText(checkedLine(HEALTH.checked_at!))).toBeInTheDocument();
    expect(within(panel("analysis")).getByText("waveforms and loudness")).toBeInTheDocument();
  });

  it("says the files have not been checked yet when no check is recorded", () => {
    renderSection({ ...HEALTH, checked_at: null });
    expect(within(panel("files")).getByText("not checked yet")).toBeInTheDocument();
  });

  it("writes each row's count in the data face, amber or red only for work to do", () => {
    renderSection();
    const count = (card: string, id: string) =>
      rowOf(card, id).querySelector(".health-card__count") as HTMLElement;
    expect(count("files", "missing")).toHaveTextContent("12");
    expect(count("files", "missing")).toHaveClass("health-card__count--danger");
    expect(count("files", "not_checked")).not.toHaveClass("health-card__count--danger");
    expect(count("beatport", "needs_review")).toHaveClass("health-card__count--warning");
    expect(count("beatport", "not_synced")).toHaveTextContent("6");
    expect(count("other", "duplicates")).toHaveClass("health-card__count--warning");
    expect(count("analysis", "failed")).toHaveClass("health-card__count--danger");
    expect(count("analysis", "waiting")).toHaveTextContent("30");
  });

  it("is its own legend: the label, the link and the count on one row, the count last (D22, M210)", () => {
    renderSection();
    const row = rowOf("files", "missing");
    expect(row.querySelector(".health-card__swatch")).toBeNull();
    expect(row.textContent).toContain("Missing");
    expect(within(row).getByRole("button", { name: /Open in Clean/ })).toHaveClass("health-card__open");
    expect([...row.children].map((child) => child.className.split(" ").find((name) => name.startsWith("health-card__")))).toEqual([
      "health-card__label",
      "health-card__open",
      "health-card__count",
    ]);
    // The bar has no second legend under it.
    expect(document.querySelector(".stacked__legend")).toBeNull();
  });

  it("keeps a zero plain and offers nothing to open", () => {
    renderSection({
      ...HEALTH,
      files: { ...HEALTH.files, missing: count(0, "missing") },
    });
    const missing = rowOf("files", "missing");
    expect(missing.querySelector(".health-card__count")).not.toHaveClass("health-card__count--danger");
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

  it("opens Clean's Match tab from To check, Not looked up yet and No match", async () => {
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

  it("opens the Library on the engine's own rules for Not synced to files and No artwork", async () => {
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

  it("says when the artwork was last read in the words of Checked today, …, the same helper (new B)", () => {
    const today = new Date();
    today.setHours(8, 28, 0, 0);
    const iso = today.toISOString();
    renderSection({ ...HEALTH, checked_at: iso, artwork_checked_at: iso });
    const checked = checkedLine(iso);
    expect(checked).toMatch(/^Checked today, /);
    expect(within(panel("other")).getByText(`Artwork last read ${checked.slice("Checked ".length)}`)).toBeInTheDocument();
  });

  it("says when the artwork was last read, and when it never was", () => {
    const first = renderSection();
    expect(within(panel("other")).getByText(`Artwork last read ${formatDayTimeInSentence(HEALTH.artwork_checked_at!)}`)).toBeInTheDocument();
    first.unmount();
    renderSection({ ...HEALTH, artwork_checked_at: null });
    expect(within(panel("other")).getByText("Artwork has not been read yet")).toBeInTheDocument();
  });

  it("is read-only: it says so at the top and links to Clean, and starts no job", async () => {
    renderSection();
    expect(screen.getByText(/Read-only here\. To fix these,/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read artwork" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open in Clean" }));
    expect(where()).toHaveTextContent("/clean");
  });

  it("sends the artwork read to Clean's Missing files, with the status on the left (M220)", async () => {
    renderSection();
    const foot = panel("other").querySelector(".health-card__foot")!;
    expect(foot.children[0]).toHaveTextContent(/^Artwork last read /);
    const link = within(panel("other")).getByRole("button", { name: /Read artwork in Clean/ });
    expect(foot.children[1]).toBe(link);
    await userEvent.click(link);
    expect(where()).toHaveTextContent("/clean");
    expect(where()).toHaveAttribute("data-section", "missing");
    const rule = /\.health-card__foot\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toContain("justify-content: space-between;");
  });

  it("no longer offers All health checks or any way into Clean's Health tab", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: "All health checks" })).not.toBeInTheDocument();
    for (const name of ["Check files", "Match", "Analyze"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("keeps one status dot, on the Beatport row to check, and no other swatch or dot (M208)", () => {
    renderSection();
    expect(document.querySelector(".health-card__swatch")).toBeNull();
    const dots = document.querySelectorAll(".health-card__dot");
    expect(dots).toHaveLength(1);
    expect(rowOf("beatport", "needs_review").contains(dots[0]!)).toBe(true);
    expect(css).not.toContain("health-card__swatch");
    expect(css).not.toMatch(/border-radius:\s*50%/);
  });

  it("holds the bar's room in a card without one, so side-by-side cards share row lines (M209)", () => {
    renderSection();
    expect(panel("other").querySelector(".health-card__bar-slot")).not.toBeNull();
    expect(panel("files").querySelector(".health-card__bar-slot")).toBeNull();
    expect(panel("files").querySelector(".stacked__bar")).not.toBeNull();
  });

  it("names the match states with the shared words (C152)", () => {
    renderSection();
    const label = (id: string) => rowOf("beatport", id).querySelector(".health-card__label")!.textContent;
    expect([label("accepted"), label("needs_review"), label("no_match"), label("not_matched"), label("rejected")]).toEqual([
      MATCH_STATE.confirmed,
      MATCH_STATE.toCheck,
      MATCH_STATE.noMatch,
      MATCH_STATE.notLookedUp,
      MATCH_STATE.rejected,
    ]);
    expect(panel("beatport")).not.toHaveTextContent(/To review|Not matched/);
  });

  it("draws what is healthy quietly: the chart-ink segment and a muted OK count (C99, D14, M218)", () => {
    renderSection();
    const success = /\.stacked__part--success\s*\{([^}]*)\}/.exec(css)![1]!;
    // M218: the healthy part is the chart's one ink, not a status colour.
    expect(success).toContain("background: var(--chart-bar);");
    for (const [card, id] of [["files", "present"], ["beatport", "accepted"], ["analysis", "analyzed"]] as const) {
      const figure = rowOf(card, id).querySelector(".health-card__count")!;
      expect(figure).not.toHaveClass("health-card__count--warning", "health-card__count--danger");
    }
    expect(css).not.toContain("health-card__count--ok");
    const count = /\.health-card__count\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(count).toContain("color: var(--fg-muted);");
    // A problem still shows in its own colour.
    expect(rowOf("files", "missing").querySelector(".health-card__count")).toHaveClass("health-card__count--danger");
  });

  it("draws the states nobody has looked at in --fg-muted and not the divider colour (C98)", () => {
    const muted = /\.stacked__part--muted\s*\{([^}]*)\}/.exec(css)![1]!;
    const ok = /\.stacked__part--success\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(muted).toContain("var(--fg-muted)");
    expect(muted).not.toContain("--border-muted");
    // Not the same grey as the healthy segment, or Present and Not checked read alike.
    expect(muted).toContain("25%");
    expect(muted.match(/background:[^;]*;/)![0]).not.toBe(ok.match(/background:[^;]*;/)![0]);
  });
});
