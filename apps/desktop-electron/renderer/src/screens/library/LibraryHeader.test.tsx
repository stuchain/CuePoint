/**
 * The Library's header (LIB-3, LIB-4, FLW-11, DEC-208, K9).
 *
 * It names the scope you are in (the h1 stays "Library"), says what the scope
 * holds, and gives the source as a short line. Two buttons, never a menu:
 * **Check Rekordbox for changes** and **Export to Rekordbox…**. Before the
 * first import there is one, **Import your Rekordbox collection…**. Where the
 * two do not fit the visible labels shorten and the full names stay as the
 * buttons' accessible names.
 *
 * jsdom lays nothing out, so the two widths the header compares (its own and
 * the hidden copy of the full labels) are supplied here by `data-slot`, and the
 * observer is driven by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { LibraryQuickFacets, LibrarySummary } from "../../api/cuepointBridge.types";
import { LibraryHeader } from "./LibraryHeader";

const SUMMARY: LibrarySummary = {
  track_count: 3880,
  playlist_count: 234,
  playlist_entry_count: 13870,
  library_empty: false,
  source: {
    xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
    imported_at: "2026-09-03T10:00:00Z",
    xml_modified_at: "2026-09-03T09:00:00Z",
    xml_size_bytes: 2048,
    track_count: 3880,
    playlist_count: 234,
    exists: true,
    changed: false,
  },
};

const FACTS: LibraryQuickFacets = {
  keys: Array.from({ length: 9 }, (_unused, i) => ({ value: `${i + 1}A`, count: 4 })),
  no_key: 0,
  bpm: { min: 122, max: 128, missing: 0 },
  genres: [],
  genres_total: 0,
  genres_truncated: false,
  total: 36,
  total_seconds: 13920,
  duration_missing: 0,
};

function summaryWith(changed: boolean | null, exists = true): LibrarySummary {
  return { ...SUMMARY, source: { ...SUMMARY.source!, changed, exists } };
}

const HANDLERS = () => ({
  onCheck: vi.fn(),
  onImport: vi.fn(),
  onExport: vi.fn(),
});

function renderHeader(
  props: Partial<Parameters<typeof LibraryHeader>[0]> = {},
  handlers = HANDLERS(),
) {
  render(
    <LibraryHeader
      summary={SUMMARY}
      scopeName="All tracks"
      scopeGroup={null}
      facts={FACTS}
      fallbackCount={3880}
      busy={null}
      busyLabel={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

/** The widths each measured part reports; a missing slot reports nothing. */
let widths: Record<string, number> = {};
let observers: Array<() => void> = [];

beforeEach(() => {
  widths = {};
  observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  for (const name of ["offsetWidth", "clientWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return widths[this.dataset.slot ?? ""] ?? 0;
      },
    });
  }
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(globalThis, "ResizeObserver");
});

const PATH = "C:\\Users\\dj\\Downloads\\collection.xml";

describe("after an import", () => {
  it("has two buttons named for what they do, and no menu", () => {
    renderHeader();

    for (const name of ["Check Rekordbox for changes", "Export to Rekordbox…"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();
    expect(screen.queryByText(/Collection file/)).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: /▾/ })).toBeNull();
  });

  it("does what each button says", () => {
    const handlers = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Check Rekordbox for changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Rekordbox…" }));

    expect(handlers.onCheck).toHaveBeenCalledTimes(1);
    expect(handlers.onExport).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).not.toHaveBeenCalled();
  });

  it("makes Check secondary while the export is in sync, primary when it changed or went missing", () => {
    const view = render(
      <LibraryHeader
        summary={summaryWith(false)}
        scopeName="All tracks"
        scopeGroup={null}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    const check = () => screen.getByRole("button", { name: "Check Rekordbox for changes" });
    expect(check()).toHaveClass("cp-btn--secondary");
    for (const next of [summaryWith(true), summaryWith(false, false)]) {
      view.rerender(
        <LibraryHeader
          summary={next}
          scopeName="All tracks"
          scopeGroup={null}
          facts={FACTS}
          fallbackCount={1}
          busy={null}
          busyLabel={null}
          {...HANDLERS()}
        />,
      );
      expect(check()).toHaveClass("cp-btn--primary");
    }
    expect(screen.getByRole("button", { name: "Export to Rekordbox…" })).toHaveClass(
      "cp-btn--secondary",
    );
  });

  it("shows the full names while they fit", () => {
    widths = { "library-header": 1000, "library-header-measure": 400 };
    renderHeader();

    expect(screen.getByText("Check Rekordbox for changes")).toBeVisible();
    expect(screen.queryByText("Export…")).toBeNull();
  });

  it("shortens the labels where they do not fit, and keeps the full names", () => {
    widths = { "library-header": 500, "library-header-measure": 400 };
    renderHeader();

    const check = screen.getByRole("button", { name: "Check Rekordbox for changes" });
    const exported = screen.getByRole("button", { name: "Export to Rekordbox…" });
    expect(check).toHaveTextContent("Check Rekordbox");
    expect(exported).toHaveTextContent("Export…");
    // The full name is the accessible name, not only a tooltip.
    expect(check).toHaveAttribute("aria-label", "Check Rekordbox for changes");
    expect(exported).toHaveAttribute("aria-label", "Export to Rekordbox…");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("goes back to the full names when the window grows", () => {
    widths = { "library-header": 500, "library-header-measure": 400 };
    renderHeader();
    expect(screen.getByText("Export…")).toBeInTheDocument();

    widths["library-header"] = 1000;
    act(() => observers.forEach((notify) => notify()));

    expect(screen.queryByText("Export…")).toBeNull();
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("draws the chip beside the heading, outside the actions", () => {
    widths = { "library-header": 1000, "library-header-measure": 400 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });

    const chip = screen.getByRole("button", { name: "First steps 1/4" });
    expect(chip.closest(".cp-screen-header__title-row")).not.toBeNull();
    expect(chip.closest(".cp-screen-header__actions")).toBeNull();
    expect(
      document.querySelector('[data-slot="library-header-measure"]'),
    ).not.toContainElement(chip);
    // Same room, same labels: the chip does not push them into their short form.
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("keeps the full names when nothing can be measured", () => {
    renderHeader();
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("says what is happening on the button doing it", () => {
    renderHeader({ busy: "checking", busyLabel: "Comparing with Rekordbox…" });
    expect(
      screen.getByRole("button", { name: "Comparing with Rekordbox…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export to Rekordbox…" })).toBeDisabled();
  });

  it("shows the refresh's line when there is one", () => {
    renderHeader({ appliedLine: "Refreshed: 3 new tracks." });
    expect(screen.getByRole("status")).toHaveTextContent("Refreshed: 3 new tracks.");
  });
});

describe("the scope (R4-4)", () => {
  it("names All tracks, with the page still headed Library and no crumb", () => {
    const { container } = render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="All tracks"
        scopeGroup={null}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(container.querySelector(".cp-screen-header__display")).toHaveTextContent("All tracks");
    expect(container.querySelector(".cp-screen-header__crumb")).toBeNull();
  });

  it("names a playlist, with the group it is in above it", () => {
    const { container } = render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="Friday warm-up"
        scopeGroup="Playlists"
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    expect(container.querySelector(".cp-screen-header__display")).toHaveTextContent("Friday warm-up");
    expect(container.querySelector(".cp-screen-header__crumb")).toHaveTextContent("Playlists");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Library");
  });
});

describe("what the scope holds (K9)", () => {
  it("says tracks, length, BPM and keys, with the count under its test id", () => {
    renderHeader();

    expect(screen.getByTestId("library-track-count")).toHaveTextContent("36 tracks");
    const summary = document.querySelector(".cp-screen-header__summary")!;
    expect(summary).toHaveTextContent("36 tracks · 3 h 52 min · 122–128 BPM · 9 keys");
    expect(summary.querySelectorAll(".cp-data").length).toBeGreaterThanOrEqual(4);
  });

  it("shows only the count it already knows while the facts load", () => {
    renderHeader({ facts: null, fallbackCount: 3880 });

    expect(screen.getByTestId("library-track-count")).toHaveTextContent("3,880 tracks");
    const summary = document.querySelector(".cp-screen-header__summary")!;
    expect(summary).not.toHaveTextContent("BPM");
    expect(summary).not.toHaveTextContent("·");
  });

  it("starts the summary with the scope's name for a screen reader", () => {
    renderHeader({ scopeName: "Friday warm-up", scopeGroup: "Playlists" });
    const summary = document.querySelector(".cp-screen-header__summary")!;
    const lead = summary.querySelector(".library-header__sr-only");
    expect(lead).toHaveTextContent("Friday warm-up:");
    expect(summary.textContent?.startsWith("Friday warm-up: 36 tracks")).toBe(true);
  });

  it("no longer counts playlists", () => {
    renderHeader();
    expect(screen.queryByText(/playlists/)).toBeNull();
  });
});

describe("the source line (K9)", () => {
  it("is the file name and the state, with the whole path and last read in the hint", () => {
    renderHeader();

    const name = screen.getByText("collection.xml");
    expect(name).toHaveAttribute("title", expect.stringContaining(PATH));
    expect(name).toHaveAttribute("title", expect.stringContaining("last read"));
    expect(name).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("In sync")).toBeInTheDocument();
    expect(screen.queryByText(PATH)).toBeNull();
    expect(screen.queryByText(/^last read /)).toBeNull();
  });

  it.each([
    [false, true, "In sync"],
    [true, true, "Changed in Rekordbox"],
    [null, true, "Not checked yet"],
    [false, false, "File not found"],
  ] as const)("badges changed=%s exists=%s as %s", (changed, exists, word) => {
    renderHeader({ summary: summaryWith(changed, exists) });
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("does not repeat \"In sync\" in a sentence, but explains what needs a word", () => {
    renderHeader({ summary: summaryWith(false, true) });
    expect(screen.queryByText(/Unchanged since your last import/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the attention sentence when the export changed or is missing", () => {
    renderHeader({ summary: summaryWith(true) });
    expect(screen.getByRole("status")).toHaveTextContent(/has changed since your last import/);
  });

  it("explains an export it could not compare, without calling it urgent", () => {
    renderHeader({ summary: summaryWith(null) });
    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/could not tell whether this export has changed/);
    expect(note).not.toHaveClass("library-header__state--attention");
    // Check stays a secondary button: nothing is known to need a look.
    expect(screen.getByRole("button", { name: "Check Rekordbox for changes" })).toHaveClass(
      "cp-btn--secondary",
    );
  });

  it("never calls the Rekordbox export a collection", () => {
    renderHeader({ summary: summaryWith(true) });
    const header = screen.getByRole("banner");
    expect(within(header).queryByText(/collection(?!\.xml)/i)).toBeNull();
  });
});

describe("before the first import", () => {
  it("has the one button, and nothing to check or export", () => {
    const handlers = renderHeader({ summary: null });

    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Import your Rekordbox collection…" }));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Check Rekordbox/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Export/ })).toBeNull();
    expect(screen.queryByTestId("library-track-count")).toBeNull();
  });

  it("is the same one button for a library with no source", () => {
    renderHeader({
      summary: { ...SUMMARY, track_count: 0, library_empty: true, source: null },
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Your Rekordbox library, as CuePoint sees it.")).toBeNull();
  });

  it("says importing on its button while it works", () => {
    renderHeader({ summary: null, busy: "importing", busyLabel: "Importing…" });
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
  });
});
