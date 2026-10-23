/**
 * Missing files' check button (K4): one button at a time.
 *
 * Never checked, the one button is "Check every file". Once checked, it is
 * "Check again", which reads "Check 12 again" and checks those rows when some
 * are selected, and checks every file otherwise. No second check button, and
 * none inside the empty state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { LibraryHealth, LibrarySearchResponse } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { browseAnswer, track } from "../../test/matchFixtures";
import fixture from "./cleanEmpty.fixture.json";
import css from "./clean.css?raw";
import { MissingFilesView } from "./MissingFilesView";

type Fn = ReturnType<typeof vi.fn>;

const UNTOUCHED = fixture.untouched.health as LibraryHealth;
const MATCHED = fixture.matched.health as LibraryHealth;
/** Health after a check has run, so the view is not in its first-run state. */
const CHECKED: LibraryHealth = {
  ...MATCHED,
  detections: MATCHED.detections.map((run) =>
    run.id === "files" ? { ...run, last_run_at: "2026-09-15T10:00:00Z" } : run,
  ),
};

const MISSING = Array.from({ length: 12 }, (_, index) =>
  track(index + 1, { file_status: "missing", file_path: `E:\\gone\\${index + 1}.mp3` }),
);

let bridge: Record<string, Fn>;

function install(rows = MISSING) {
  bridge = {
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => browseAnswer(params, rows)),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => ({
      track: rows.find((row) => row.id === trackId) ?? track(trackId),
      playlists: [],
      playlist_count: 0,
      metadata: null,
      tags: [],
      collections: [],
    })),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTrackFolder: vi.fn().mockResolvedValue({
      track_id: 1,
      file_path: "E:\\gone\\1.mp3",
      file_exists: false,
      folder: null,
    }),
    startFileCheck: vi.fn().mockResolvedValue({
      job_id: "job-check",
      id: "job-check",
      state: "queued",
      tracks: 12,
    }),
    getJob: vi.fn().mockResolvedValue({ id: "job-check", state: "succeeded" }),
    getJobResults: vi.fn().mockResolvedValue({ id: "job-check", state: "succeeded" }),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

function renderView(health: LibraryHealth) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <MemoryRouter>
          <MissingFilesView health={health} onHealthChanged={() => {}} />
        </MemoryRouter>
      </ToastProvider>
    </ScaleProvider>,
  );
}

/** Every button in the view whose name mentions checking. */
function checkButtons(): string[] {
  return screen
    .queryAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((name) => /^Check (every|again|\d)/.test(name) || /again$/.test(name));
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
  Element.prototype.scrollTo ??= function scrollTo() {};
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

beforeEach(() => {
  localStorage.clear();
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the check button (K4)", () => {
  it("is the one 'Check every file' when files were never checked", async () => {
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.untouched.missing_files as LibrarySearchResponse);
    renderView(UNTOUCHED);
    await screen.findByText("Files have not been checked yet");

    expect(checkButtons()).toEqual(["Check every file"]);
    fireEvent.click(screen.getByRole("button", { name: "Check every file" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
  });

  it("is the one 'Check again' once files were checked, and checks every file", async () => {
    renderView(CHECKED);
    await screen.findByText("Track 1");

    expect(checkButtons()).toEqual(["Check again"]);
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
  });

  it("frames its one action, which the quiet bar buttons would otherwise strip (P3)", async () => {
    renderView(CHECKED);
    await screen.findByText("Track 1");

    expect(screen.getByRole("button", { name: "Check again" })).toHaveClass("cp-btn--framed");
  });

  it("reads 'Check 12 again' with 12 rows selected, and checks those rows", async () => {
    renderView(CHECKED);
    fireEvent.click(await screen.findByText("Track 1"));
    fireEvent.click(screen.getByText("Track 12"), { shiftKey: true });

    const button = await screen.findByRole("button", { name: "Check 12 again" });
    expect(checkButtons()).toEqual(["Check 12 again"]);
    fireEvent.click(button);
    await waitFor(() => expect(bridge.startFileCheck).toHaveBeenCalledTimes(1));
    const selection = bridge.startFileCheck!.mock.calls[0]![0].selection;
    expect(selection).toEqual({ track_ids: MISSING.map((row) => row.id) });
  });

  it("has one check button and no second one in the empty state of a checked library", async () => {
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.checked.missing_files as LibrarySearchResponse);
    renderView(CHECKED);
    await screen.findByText(/^Checked /);
    expect(checkButtons()).toEqual(["Check again"]);
  });
});

describe("nothing missing (K13)", () => {
  async function nothingMissing() {
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.checked.missing_files as LibrarySearchResponse);
    renderView(CHECKED);
    return screen.findByText(/^Checked /);
  }

  it("is a bar saying when it last checked, and Check again, over the all-clear (Q15)", async () => {
    const line = await nothingMissing();
    // No separator, so no stray trailing dot before the button (area 67); the count is not
    // said twice: the bar says when, the empty block says all files were found.
    expect(line.textContent).toMatch(/^Checked [A-Z][a-z]{2} \d{1,2}(, \d{4})?, \d{1,2}:\d{2}\s[AP]M$/);
    expect(screen.queryByText(/files found/)).toBeNull();
    expect(screen.getByText(/^All 3 files were where your library says/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
    expect(screen.getByText("No missing files")).toBeInTheDocument();
  });

  it("keeps the bar's status at the left and the button at the right, on the shared bar (C235)", () => {
    const rule = /\.clean-toolbar__status\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/margin-inline-end:\s*auto/);
    expect(css).not.toMatch(/\n\.clean-toolbar\s*\{/);
  });

  it("puts the all-clear near the top under the bar, centred, like Duplicates (Q15)", () => {
    const rule = /\.clean-missing--clear\s*>\s*\.cp-empty-state\s*\{([^}]*)\}/.exec(css);
    expect(rule?.[1] ?? "").not.toMatch(/justify-content:\s*center|flex:\s*1/);
    expect(css).toMatch(/\.clean-duplicates__list\s*>\s*\.cp-empty-state\s*\{[^}]*align-self:\s*stretch/);
  });

  it("decides from the loaded list: a missing file the Health count has not caught up with shows the table", async () => {
    renderView(CHECKED);
    await screen.findByText("Track 1");
    expect(screen.queryByText(/files found/)).toBeNull();
  });

  it("shows no steps, table, headers, count or Columns", async () => {
    await nothingMissing();
    expect(screen.queryByRole("list", { name: "How to fix a missing file" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Check for changes" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Missing files" })).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByText(/0 tracks/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Columns…" })).toBeNull();
  });

  it("checks every file again", async () => {
    await nothingMissing();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
  });

  it("is the table, as before, when something is missing", async () => {
    renderView(CHECKED);
    await screen.findByText("Track 1");
    expect(screen.getByRole("list", { name: "How to fix a missing file" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Missing files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns…" })).toBeInTheDocument();
    expect(screen.queryByText(/^All \d+ files found/)).toBeNull();
  });

  it("is the one 'Check every file' before any check, with the steps as today", async () => {
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.untouched.missing_files as LibrarySearchResponse);
    renderView(UNTOUCHED);
    await screen.findByText("Files have not been checked yet");
    expect(checkButtons()).toEqual(["Check every file"]);
    expect(screen.queryByText(/files found/)).toBeNull();
  });
});
