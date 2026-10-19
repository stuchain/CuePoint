/**
 * The Library's header (LIB-3, LIB-4, FLW-11, DEC-208, K9).
 *
 * It names the scope you are in (the h1 stays "Library"), says what the scope
 * holds, and gives the source as a short line. Two buttons, never a menu:
 * **Check for changes** and **Export to Rekordbox…**. Before the
 * first import there is one, **Import a Rekordbox file…**. Where the
 * two do not fit the chips beside the title go; the buttons' words are never cut.
 *
 * jsdom lays nothing out, so the two widths the header compares (its own and
 * the hidden copy of the full labels) are supplied here by `data-slot`, and the
 * observer is driven by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { LibraryQuickFacets, LibrarySummary } from "../../api/cuepointBridge.types";
import { LibraryHeader, fitsOneLine, leanLevel } from "./LibraryHeader";

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
      scopeTrail={[]}
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

/**
 * The widths each measured part reports, by the class it carries; a part with none reports nothing.
 * `row` is the header's line, `title` the scope's name uncut, `beside` the source line and chips,
 * `button` each button of the actions (and the Details toggle and its divider).
 */
let widths: Record<string, number> = {};
let observers: Array<() => void> = [];

const BY_CLASS: Record<string, string> = {
  "cp-screen-header__main": "row",
  "cp-screen-header__display": "title",
  "cp-screen-header__beside": "beside",
  "cp-btn": "button",
  "cp-details-divider": "divider",
  "library-header__source": "source",
};

function widthOf(element: HTMLElement): number {
  for (const [name, key] of Object.entries(BY_CLASS)) {
    if (element.classList.contains(name)) return widths[key] ?? 0;
  }
  return 0;
}

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
  for (const name of ["offsetWidth", "clientWidth", "scrollWidth"] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return widthOf(this);
      },
    });
  }
});

afterEach(() => {
  for (const name of ["offsetWidth", "clientWidth", "scrollWidth"]) {
    Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  Reflect.deleteProperty(globalThis, "ResizeObserver");
});

const PATH = "C:\\Users\\dj\\Downloads\\collection.xml";

describe("after an import", () => {
  it("has the check as a refresh icon beside the state and Export as a button, and no menu", () => {
    renderHeader();

    for (const name of ["Check for changes", "Export to Rekordbox…"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /Import/ })).toBeNull();
    expect(screen.queryByText(/Collection file/)).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.querySelector("button [data-icon='chevron-down']")).toBeNull();
  });

  it("does what each button says", () => {
    const handlers = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Check for changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Rekordbox…" }));

    expect(handlers.onCheck).toHaveBeenCalledTimes(1);
    expect(handlers.onExport).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).not.toHaveBeenCalled();
  });

  it("makes Check a quiet icon while the export is up to date, a labelled primary when it changed or went missing", () => {
    const view = render(
      <LibraryHeader
        summary={summaryWith(false)}
        scopeName="All tracks"
        scopeTrail={[]}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    const check = () => screen.getByRole("button", { name: "Check for changes" });
    expect(check()).toHaveClass("cp-btn--quiet");
    expect(check()).toHaveTextContent("");
    for (const next of [summaryWith(true), summaryWith(false, false)]) {
      view.rerender(
        <LibraryHeader
          summary={next}
          scopeName="All tracks"
          scopeTrail={[]}
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
    widths = { row: 1000, title: 120, beside: 200, button: 160 };
    renderHeader();

    expect(screen.getByRole("button", { name: "Check for changes" })).toBeVisible();
    expect(screen.queryByText("Export…")).toBeNull();
  });

  it("never cuts a button's words: the chips beside the title go first", () => {
    // Only Export is in the actions while the file is up to date: the check is the refresh icon.
    widths = { row: 440, title: 120, beside: 200, button: 160 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });

    const check = screen.getByRole("button", { name: "Check for changes" });
    const exported = screen.getByRole("button", { name: "Export to Rekordbox…" });
    expect(check).toBeInTheDocument();
    expect(exported).toHaveTextContent("Export to Rekordbox…");
    expect(screen.queryByRole("button", { name: "First steps 1/4" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("drops the chips when a long scope name, the chips and the buttons together do not fit one line", () => {
    // 1000 wide would fit a short name; this name is 700 wide, and 700 + 200 + 160 > 1000.
    widths = { row: 1000, title: 700, beside: 200, button: 160 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });
    expect(screen.queryByRole("button", { name: "First steps 1/4" })).toBeNull();
  });

  it("moves the file and its state to the facts line when they do not fit beside the title", () => {
    // 400 + 50 + 160 = 610 > 600: the name goes from beside the title to the end of the facts.
    widths = { row: 600, title: 400, beside: 200, source: 50, button: 160 };
    renderHeader();
    expect(document.querySelector(".cp-screen-header__beside")).toBeNull();
    expect(document.querySelector(".cp-screen-header__summary .library-header__file")).not.toBeNull();
    expect(document.querySelector(".cp-screen-header__summary .cp-badge")).not.toBeNull();
  });

  it("keeps the file and its state beside the title when only the First steps chip must go", () => {
    widths = { row: 700, title: 350, beside: 200, source: 50, button: 160 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });
    expect(document.querySelector(".cp-screen-header__beside .library-header__file")).not.toBeNull();
    expect(document.querySelector(".cp-screen-header__beside .cp-badge")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "First steps 1/4" })).toBeNull();
  });

  it("brings the chips back when the window grows", () => {
    widths = { row: 440, title: 120, beside: 200, button: 160 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });
    expect(screen.queryByRole("button", { name: "First steps 1/4" })).toBeNull();

    widths.row = 1000;
    act(() => observers.forEach((notify) => notify()));

    expect(screen.getByRole("button", { name: "First steps 1/4" })).toBeInTheDocument();
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("draws the chip beside the heading, outside the actions", () => {
    widths = { row: 1000, title: 120, beside: 200, button: 160 };
    renderHeader({ extra: <button type="button">First steps 1/4</button> });

    const chip = screen.getByRole("button", { name: "First steps 1/4" });
    expect(chip.closest(".cp-screen-header__title-row")).not.toBeNull();
    expect(chip.closest(".cp-screen-header__actions")).toBeNull();
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("keeps the full names when nothing can be measured", () => {
    renderHeader();
    expect(screen.getByText("Export to Rekordbox…")).toBeInTheDocument();
  });

  it("keeps the button's name while it works, with the spinner and the busy words in its hint", () => {
    renderHeader({ busy: "checking", busyLabel: "Comparing with Rekordbox…" });
    expect(screen.getByRole("button", { name: "Check for changes" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Comparing with Rekordbox…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export to Rekordbox…" })).toBeDisabled();
  });

  it("shows the refresh's line when there is one", () => {
    renderHeader({ appliedLine: "Refreshed: 3 new tracks." });
    expect(screen.getByRole("status")).toHaveTextContent("Refreshed: 3 new tracks.");
  });
});

describe("the scope (R4-4)", () => {
  it("names All tracks, with the page still headed Library and Library as the line above", () => {
    const { container } = render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="All tracks"
        scopeTrail={[]}
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
    // No line above the title any more: the trail is in the facts line, and All tracks has none.
    expect(container.querySelector(".cp-screen-header__crumb")).toBeNull();
    expect(screen.queryByTestId("library-trail")).toBeNull();
  });

  it("names a playlist, with the group it is in above it", () => {
    const { container } = render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="Friday warm-up"
        scopeTrail={["Playlists"]}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    expect(container.querySelector(".cp-screen-header__display")).toHaveTextContent("Friday warm-up");
    expect(container.querySelector(".cp-screen-header__crumb")).toBeNull();
    expect(screen.getByTestId("library-trail")).toHaveTextContent("Playlists");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Library");
  });
});

describe("the path and folders (R7-4, R7-5)", () => {
  it("shows the full path in the facts line, a chevron icon between the names", () => {
    const { container } = render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="Sunset"
        scopeTrail={["Playlists", "Gigs 2026", "Summer"]}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    const trail = screen.getByTestId("library-trail");
    expect(trail).toHaveTextContent("PlaylistsGigs 2026Summer");
    expect(trail.textContent).not.toContain("›");
    expect(trail.querySelectorAll("[data-icon='chevron-right-sm']")).toHaveLength(2);
    expect(container.querySelector(".cp-screen-header__crumb")).toBeNull();
  });

  it("keeps the trail on the facts line: the chevron is an in-line icon, not a block that breaks it (C220)", () => {
    render(
      <LibraryHeader
        summary={SUMMARY}
        scopeName="Rooftop, Oct 10"
        scopeTrail={["Collections", "Gigs"]}
        facts={FACTS}
        fallbackCount={1}
        busy={null}
        busyLabel={null}
        {...HANDLERS()}
      />,
    );
    const arrow = screen.getByTestId("library-trail").querySelector("[data-icon='chevron-right-sm']")!;
    // A bare pixel icon is display: block, which put "Collections", the chevron and "Gigs" on three lines.
    expect(arrow).toHaveClass("cp-pixel-icon--text");
  });

  it("says Folder and its playlists instead of 0 tracks", () => {
    renderHeader({
      scopeName: "Gigs 2026",
      scopeTrail: ["Playlists"],
      folder: { count: 4, noun: "playlist" },
    });
    expect(screen.getByTestId("library-track-count")).toHaveTextContent("Folder");
    expect(document.querySelector(".cp-screen-header__summary")).toHaveTextContent("Folder · 4 playlists");
    expect(document.querySelector(".cp-screen-header__summary")).not.toHaveTextContent("0 tracks");
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
    renderHeader({ scopeName: "Friday warm-up", scopeTrail: ["Playlists"] });
    const summary = document.querySelector(".cp-screen-header__summary")!;
    const lead = summary.querySelector(".library-header__sr-only");
    expect(lead).toHaveTextContent("Friday warm-up:");
    expect(summary.textContent?.startsWith("Friday warm-up: Playlists · 36 tracks")).toBe(true);
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
    expect(screen.getByText("Up to date")).toBeInTheDocument();
    expect(screen.queryByText(PATH)).toBeNull();
    expect(screen.queryByText(/^last read /)).toBeNull();
  });

  it.each([
    [false, true, "Up to date"],
    [true, true, "Changed in Rekordbox"],
    [null, true, "Not checked yet"],
    [false, false, "File not found"],
  ] as const)("badges changed=%s exists=%s as %s", (changed, exists, word) => {
    renderHeader({ summary: summaryWith(changed, exists) });
    expect(screen.getByText(word)).toBeInTheDocument();
  });

  it("does not repeat \"Up to date\" in a sentence, but explains what needs a word", () => {
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
    expect(note).toHaveTextContent(/could not tell whether this Rekordbox file has changed/);
    expect(note).not.toHaveClass("library-header__state--attention");
    // Check stays the quiet refresh icon: nothing is known to need a look.
    expect(screen.getByRole("button", { name: "Check for changes" })).toHaveClass(
      "cp-btn--quiet",
    );
  });

  it("is the one violet Import before the first import, and none while First steps has its own (C146)", () => {
    const { unmount } = render(
      <LibraryHeader summary={null} busy={null} busyLabel={null} {...HANDLERS()} />,
    );
    expect(screen.getByRole("button", { name: "Import a Rekordbox file…" })).toHaveClass("cp-btn--primary");
    unmount();
    render(<LibraryHeader summary={null} importInFirstSteps busy={null} busyLabel={null} {...HANDLERS()} />);
    expect(screen.queryByRole("button", { name: "Import a Rekordbox file…" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "Import a Rekordbox file…" }));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^Check/ })).toBeNull();
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

describe("fitsOneLine (A1)", () => {
  const base = { title: 200, beside: 300, actions: 400, gap: 10, available: 1000 };

  it("counts the title, the chips, the buttons and a gap between each", () => {
    expect(fitsOneLine(base)).toBe(true); // 200 + 300 + 400 + 20 = 920
    expect(fitsOneLine({ ...base, title: 281 })).toBe(false); // 1001
    expect(fitsOneLine({ ...base, title: 280 })).toBe(true); // 1000
  });

  it("needs one gap, not two, when nothing sits beside the title", () => {
    expect(fitsOneLine({ ...base, beside: 0, title: 590 })).toBe(true); // 590 + 400 + 10
    expect(fitsOneLine({ ...base, beside: 0, title: 591 })).toBe(false);
  });

  it("reads a header with no layout as fitting", () => {
    expect(fitsOneLine({ ...base, available: 0 })).toBe(true);
  });
});

describe("leanLevel (A1)", () => {
  const base = { title: 200, whole: 300, source: 90, actions: 400, gap: 10, available: 1000 };

  it("keeps everything beside the title while it fits", () => {
    expect(leanLevel(base)).toBe(0);
  });

  it("drops the First steps chip first, keeping the file and its state", () => {
    expect(leanLevel({ ...base, available: 720 })).toBe(1); // 200 + 90 + 400 + 20 = 710
  });

  it("moves the file and its state to the facts line when even they do not fit beside the title", () => {
    expect(leanLevel({ ...base, available: 650 })).toBe(2);
  });
});
