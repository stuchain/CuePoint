/**
 * The Library's header (LIB-3, LIB-4, FLW-11, DEC-208).
 *
 * Three buttons, never a menu: **Check Rekordbox for changes**, **Import
 * another file…** and **Export to Rekordbox…**. Before the first import there
 * is one, **Import your Rekordbox collection…**. Where the three do not fit on
 * one line the visible labels shorten and the full names stay as the buttons'
 * accessible names, so a screen reader and a voice command hear the same
 * thing at every window size.
 *
 * jsdom lays nothing out, so the two widths the header compares (its own and
 * the hidden copy of the full labels) are supplied here by `data-slot`, and the
 * observer is driven by hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import type { LibrarySummary } from "../../api/cuepointBridge.types";
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

describe("after an import", () => {
  it("has three buttons named for what they do, and no menu", () => {
    renderHeader();

    for (const name of [
      "Check Rekordbox for changes",
      "Import another file…",
      "Export to Rekordbox…",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Collection file/)).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: /▾/ })).toBeNull();
  });

  it("does what each button says", () => {
    const handlers = renderHeader();

    fireEvent.click(screen.getByRole("button", { name: "Check Rekordbox for changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Import another file…" }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Rekordbox…" }));

    expect(handlers.onCheck).toHaveBeenCalledTimes(1);
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
    expect(handlers.onExport).toHaveBeenCalledTimes(1);
  });

  it("shows the full names while they fit", () => {
    widths = { "library-header": 700, "library-header-measure": 600 };
    renderHeader();

    expect(screen.getByText("Check Rekordbox for changes")).toBeVisible();
    expect(screen.queryByText("Import…")).toBeNull();
  });

  it("shortens the labels where they do not fit, and keeps the full names", () => {
    widths = { "library-header": 500, "library-header-measure": 600 };
    renderHeader();

    const check = screen.getByRole("button", { name: "Check Rekordbox for changes" });
    const imported = screen.getByRole("button", { name: "Import another file…" });
    const exported = screen.getByRole("button", { name: "Export to Rekordbox…" });
    expect(check).toHaveTextContent("Check Rekordbox");
    expect(imported).toHaveTextContent("Import…");
    expect(exported).toHaveTextContent("Export…");
    // The full name is the accessible name, not only a tooltip.
    expect(check).toHaveAttribute("aria-label", "Check Rekordbox for changes");
    expect(imported).toHaveAttribute("aria-label", "Import another file…");
    expect(exported).toHaveAttribute("aria-label", "Export to Rekordbox…");
    // Still three buttons on the page; never folded into a menu.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("goes back to the full names when the window grows", () => {
    widths = { "library-header": 500, "library-header-measure": 600 };
    renderHeader();
    expect(screen.getByText("Import…")).toBeInTheDocument();

    widths["library-header"] = 700;
    act(() => observers.forEach((notify) => notify()));

    expect(screen.queryByText("Import…")).toBeNull();
    expect(screen.getByText("Import another file…")).toBeInTheDocument();
  });

  it("keeps the full names when nothing can be measured", () => {
    renderHeader();
    expect(screen.getByText("Import another file…")).toBeInTheDocument();
  });

  it("says what is happening on the button doing it", () => {
    renderHeader({ busy: "checking", busyLabel: "Comparing with Rekordbox…" });
    expect(
      screen.getByRole("button", { name: "Comparing with Rekordbox…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import another file…" })).toBeDisabled();
  });

  it("says importing on the import button", () => {
    renderHeader({ busy: "importing", busyLabel: "Importing…" });
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
  });
});

describe("the words about the export (LIB-3, LIB-4)", () => {
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
  });

  it("says when it last read the export", () => {
    renderHeader();
    expect(screen.getByText(/^last read /)).toBeInTheDocument();
    expect(screen.queryByText(/^imported /)).toBeNull();
  });

  it("counts tracks and playlists, with the entries as a tooltip", () => {
    renderHeader();

    expect(screen.getByTestId("library-track-count")).toHaveTextContent("3,880 tracks");
    const playlists = screen.getByText("234 playlists");
    expect(playlists).toHaveAttribute("title", "13,870 tracks across your playlists");
    expect(screen.queryByText(/entries/)).toBeNull();
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
    expect(
      screen.getByText("Your Rekordbox library, as CuePoint sees it."),
    ).toBeInTheDocument();
  });

  it("says importing on its button while it works", () => {
    renderHeader({ summary: null, busy: "importing", busyLabel: "Importing…" });
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
  });
});
