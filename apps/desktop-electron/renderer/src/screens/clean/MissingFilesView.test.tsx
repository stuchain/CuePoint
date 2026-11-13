/**
 * Missing files' check button (K4): one button at a time.
 *
 * Never checked, the one button is "Check every file". Once checked, it is
 * "Check again", which reads "Check 12 again" and checks those rows when some
 * are selected, and checks every file otherwise. No second check button, and
 * none inside the empty state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Activity } from "react";
import { MemoryRouter } from "react-router-dom";

import type { LibraryHealth, LibrarySearchResponse } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { browseAnswer, track } from "../../test/matchFixtures";
import fixture from "./cleanEmpty.fixture.json";
import css from "./clean.css?raw";
import { InspectorSlotProvider, useInspectorHasContent } from "../../components/shell/inspectorSlot";
import { fixedLine } from "./cleanFormat";
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

  it("offers Read artwork beside the check, and runs the artwork read over every track (M220)", async () => {
    bridge.startArtworkScan = vi.fn().mockResolvedValue({ job_id: "job-art", id: "job-art", state: "queued" });
    renderView(CHECKED);
    await screen.findByText("Track 1");
    const button = screen.getByRole("button", { name: /^Read artwork/ });
    expect(button).toHaveClass("cp-btn--framed");
    fireEvent.click(button);
    await waitFor(() =>
      expect(bridge.startArtworkScan).toHaveBeenCalledWith({ selection: { query: {} } }),
    );
  });

  it("says 'Read artwork again' once the artwork was read, and 'Read artwork' before", async () => {
    const withArtwork = (when: string | null): LibraryHealth => ({
      ...CHECKED,
      detections: [
        ...CHECKED.detections.filter((run) => run.id !== "artwork"),
        { ...(CHECKED.detections.find((run) => run.id === "artwork") ?? { id: "artwork" }), last_run_at: when } as LibraryHealth["detections"][number],
      ],
    });
    const first = renderView(withArtwork(null));
    await screen.findByText("Track 1");
    expect(screen.getByRole("button", { name: "Read artwork" })).toBeInTheDocument();
    first.unmount();
    renderView(withArtwork("2026-09-15T10:00:00Z"));
    await screen.findByText("Track 1");
    expect(screen.getByRole("button", { name: "Read artwork again" })).toBeInTheDocument();
  });

  it("has one check button and no second one in the empty state of a checked library", async () => {
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.checked.missing_files as LibrarySearchResponse);
    renderView(CHECKED);
    await screen.findByText(/^Checked /);
    expect(checkButtons()).toEqual(["Check again"]);
  });
});

describe("Check for changes, in place (M157)", () => {
  const DIFF = {
    diff_id: "d1",
    xml_path: "collection.xml",
    is_empty: false,
    contents_compared: true,
    duration_seconds: 0.4,
    computed_at: "2026-09-03T10:00:00Z",
    xml_modified_at: null,
    xml_size_bytes: null,
    tracks: {
      added: { count: 0, items: [], truncated: false },
      changed: { count: 3, items: [], truncated: true },
      removed: { count: 0, items: [], truncated: false },
      relinked: { count: 0, items: [], truncated: false },
      notable_changed_count: 0,
      marks_changed: 0,
    },
    playlists: {
      added: { count: 0, items: [], truncated: false },
      changed: { count: 0, items: [], truncated: false },
      removed: { count: 0, items: [], truncated: false },
    },
    references: {
      collection_count: 0,
      set_count: 0,
      referenced_track_count: 0,
      referenced_track_ids: [],
      collection_ids: [],
      has_references: false,
      collection_track_count: 0,
      rated_track_count: 0,
      tagged_track_count: 0,
      reviewed_track_count: 0,
      edited_track_count: 0,
      set_track_count: 0,
      set_ids: [],
    },
  };

  it("words the line as fixed and still missing", () => {
    expect(fixedLine(12, 1)).toBe("11 fixed · 1 still missing");
    expect(fixedLine(3, 5)).toBe("0 fixed · 5 still missing");
  });

  it("previews the export, applies it here, waits for the file check and says what it fixed", async () => {
    let applied = false;
    bridge.startLibraryRefreshPreview = vi.fn().mockResolvedValue({ job_id: "job-preview", id: "job-preview", state: "queued" });
    bridge.startLibraryRefreshApply = vi.fn(async () => {
      applied = true;
      return { job_id: "job-apply", id: "job-apply", state: "queued" };
    });
    bridge.getJobResults = vi.fn(async (id: string) =>
      id === "job-preview" ? { id, state: "succeeded", result: DIFF } : { id, state: "succeeded", result: null },
    );
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [{ id: "job-follow", type: "file_check", state: "running", created_at: "", updated_at: "" }],
      active_count: 1,
    });
    // After the refresh, nine of the twelve are found.
    bridge.browseLibrary = vi.fn(async (params: Record<string, unknown>) =>
      browseAnswer(params, applied ? MISSING.slice(0, 3) : MISSING),
    );
    renderView(CHECKED);
    await screen.findByText("Track 1");

    fireEvent.click(screen.getByRole("button", { name: "Check for changes" }));
    await waitFor(() => expect(bridge.startLibraryRefreshPreview).toHaveBeenCalledWith({}));
    const apply = await screen.findByRole("button", { name: "Apply changes" });
    fireEvent.click(apply);
    await waitFor(() =>
      expect(bridge.startLibraryRefreshApply).toHaveBeenCalledWith({ diff_id: "d1", confirm_references: false }),
    );
    await waitFor(() => expect(bridge.getJob).toHaveBeenCalledWith("job-follow"));
    expect(await screen.findByText("9 fixed · 3 still missing")).toHaveClass("clean-toolbar__status");
  });

  it("says so when the export has no changes, and opens nothing", async () => {
    bridge.startLibraryRefreshPreview = vi.fn().mockResolvedValue({ job_id: "job-preview", id: "job-preview", state: "queued" });
    bridge.getJobResults = vi.fn().mockResolvedValue({ id: "job-preview", state: "succeeded", result: { ...DIFF, is_empty: true } });
    renderView(CHECKED);
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Check for changes" }));
    expect(await screen.findByText("Your Rekordbox file has no changes")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
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
    // Said as the last check's answer, not today's (M156).
    expect(screen.getByText("No missing files at the last check")).toBeInTheDocument();
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
    expect(screen.queryByRole("grid", { name: "Missing files" })).toBeNull();
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByText(/0 tracks/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Columns" })).toBeNull();
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
    expect(screen.getByRole("grid", { name: "Missing files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    expect(screen.queryByText(/^All \d+ files found/)).toBeNull();
  });

  it("leaves the details slot empty when nothing is missing, and fills it when something is (M490)", async () => {
    function Probe() {
      return <span data-testid="has-details">{String(useInspectorHasContent())}</span>;
    }
    const inSlot = (health: LibraryHealth) =>
      render(
        <ScaleProvider>
          <ToastProvider>
            <MemoryRouter>
              <InspectorSlotProvider>
                <MissingFilesView health={health} onHealthChanged={() => {}} />
                <Probe />
              </InspectorSlotProvider>
            </MemoryRouter>
          </ToastProvider>
        </ScaleProvider>,
      );
    install([]);
    bridge.browseLibrary!.mockResolvedValue(fixture.checked.missing_files as LibrarySearchResponse);
    const first = inSlot(CHECKED);
    await screen.findByText(/^Checked /);
    expect(screen.getByTestId("has-details")).toHaveTextContent("false");
    first.unmount();

    install();
    inSlot(CHECKED);
    await screen.findByText("Track 1");
    await waitFor(() => expect(screen.getByTestId("has-details")).toHaveTextContent("true"));
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

describe("Find in a folder (DEC-073)", () => {
  const PICKED = { canceled: false, folder: "/Users/dj/Moved", job_id: "job-find", id: "job-find", state: "queued", tracks: 12 };

  function installFind(hits: Array<{ track_id: number; path: string }> = [{ track_id: 1, path: "/Users/dj/Moved/sub/1.mp3" }]) {
    bridge.startFileFind = vi.fn().mockResolvedValue(PICKED);
    bridge.getJob = vi.fn().mockResolvedValue({ id: "job-find", state: "succeeded" });
    bridge.getJobResults = vi.fn().mockResolvedValue({
      id: "job-find",
      state: "succeeded",
      result: {
        folder: "/Users/dj/Moved",
        looked: 40,
        truncated: false,
        found: hits,
        ambiguous: [],
        not_found: MISSING.map((row) => row.id).filter((id) => !hits.some((hit) => hit.track_id === id)),
      },
    });
    bridge.showItemInFolder = vi.fn().mockResolvedValue(undefined);
  }

  it("asks the engine over every missing file when nothing is selected, naming no path", async () => {
    installFind();
    renderView(CHECKED);
    await screen.findByText("Track 1");

    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));

    await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalledWith({ selection: { query: {} } }));
    expect(Object.keys(bridge.startFileFind!.mock.calls[0]![0])).toEqual(["selection"]);
  });

  it("runs over the selected rows when some are selected", async () => {
    installFind();
    renderView(CHECKED);
    fireEvent.click(await screen.findByText("Track 1"));
    fireEvent.click(screen.getByText("Track 3"), { shiftKey: true });

    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));

    await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalledTimes(1));
    expect(bridge.startFileFind!.mock.calls[0]![0].selection).toEqual({ track_ids: [1, 2, 3] });
  });

  it("marks found rows 'Found in Moved', says so in the toolbar and a toast, and adds to step 1", async () => {
    installFind();
    renderView(CHECKED);
    await screen.findByText("Track 1");
    expect(screen.queryByText(/rows show where it is now/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));

    const chip = await screen.findByText("Found in Moved");
    expect(chip).toHaveClass("cp-badge--success");
    expect(chip).toHaveAttribute("title", "/Users/dj/Moved/sub/1.mp3");
    expect(screen.getByText(/1 found in Moved/)).toBeInTheDocument();
    expect(await screen.findByText("Found 1 of 12 in Moved")).toBeInTheDocument();
    expect(screen.getByText(/rows show where it is now/)).toBeInTheDocument();
    // The expected path is still the library's: nothing was relinked.
    expect(screen.getByText("E:\\gone\\1.mp3")).toBeInTheDocument();
  });

  it("says so when none were found", async () => {
    installFind([]);
    renderView(CHECKED);
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
    expect(await screen.findByText("None of the 12 in Moved")).toBeInTheDocument();
    expect(screen.queryByText("Found in Moved")).toBeNull();
  });

  it("does nothing, and says nothing, when the picker was closed", async () => {
    installFind();
    bridge.startFileFind!.mockResolvedValue({ canceled: true });
    renderView(CHECKED);
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
    await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalled());
    expect(bridge.getJobResults).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Find in a folder…" })).toBeEnabled();
  });

  it("forgets what was found when the files are checked again", async () => {
    installFind();
    renderView(CHECKED);
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
    await screen.findByText("Found in Moved");

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => expect(screen.queryByText("Found in Moved")).toBeNull());
  });

  it("starts Find it for a row on double-click", async () => {
    installFind();
    renderView(CHECKED);
    const cell = await screen.findByText("Track 2");

    fireEvent.doubleClick(cell);

    await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalledWith({ selection: { track_ids: [2] } }));
  });

  it("starts Find it for the active row on Enter", async () => {
    installFind();
    renderView(CHECKED);
    fireEvent.click(await screen.findByText("Track 3"));
    const grid = screen.getByRole("grid", { name: "Missing files" });

    fireEvent.keyDown(grid, { key: "Enter" });

    await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalledWith({ selection: { track_ids: [3] } }));
  });

  it("puts Find it…, Show found file and Copy found path on the selection bar for one found row", async () => {
    installFind();
    renderView(CHECKED);
    await screen.findByText("Track 1");
    fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
    await screen.findByText("Found in Moved");

    fireEvent.click(screen.getByText("Track 1"));
    const bar = await screen.findByRole("toolbar", { name: "Selection" });
    expect(bar).toHaveTextContent("Find it…");
    fireEvent.click(screen.getByRole("button", { name: "Show found file" }));
    expect(bridge.showItemInFolder).toHaveBeenCalledWith("/Users/dj/Moved/sub/1.mp3");
    expect(screen.getByRole("button", { name: "Copy found path" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show in folder" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Find it…" }));
    await waitFor(() => expect(bridge.startFileFind).toHaveBeenLastCalledWith({ selection: { track_ids: [1] } }));
  });

  it("offers no found-file buttons for a row that was not found", async () => {
    installFind();
    renderView(CHECKED);
    fireEvent.click(await screen.findByText("Track 2"));
    await screen.findByRole("toolbar", { name: "Selection" });
    expect(screen.queryByRole("button", { name: "Show found file" })).toBeNull();
  });

  describe("the right-click menu", () => {
    async function menuOn(name: string) {
      fireEvent.contextMenu(await screen.findByText(name));
      return screen.findByRole("menu");
    }

    it("lists the found-file items only for a found row, and every item is also a button elsewhere", async () => {
      installFind();
      renderView(CHECKED);
      await screen.findByText("Track 1");
      const plain = await menuOn("Track 2");
      const names = (menu: HTMLElement) =>
        Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);
      expect(names(plain)).toEqual([
        "Find it in a folder…",
        "Show expected folder",
        "Copy expected path",
        "Check again",
        "Show details",
      ]);
      fireEvent.keyDown(plain, { key: "Escape" });

      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await screen.findByText("Found in Moved");
      const foundMenu = await menuOn("Track 1");
      expect(names(foundMenu)).toEqual([
        "Find it in a folder…",
        "Show found file",
        "Copy found path",
        "Show expected folder",
        "Copy expected path",
        "Check again",
        "Show details",
      ]);
    });

    it("runs Find it in a folder… for the right-clicked row, and Show found file with the found path", async () => {
      installFind();
      renderView(CHECKED);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await screen.findByText("Found in Moved");
      bridge.startFileFind!.mockClear();

      fireEvent.click(within(await menuOn("Track 1")).getByRole("menuitem", { name: "Show found file" }));
      expect(bridge.showItemInFolder).toHaveBeenCalledWith("/Users/dj/Moved/sub/1.mp3");

      fireEvent.click(within(await menuOn("Track 4")).getByRole("menuitem", { name: "Find it in a folder…" }));
      await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalledWith({ selection: { track_ids: [4] } }));
    });

    it("selects the row first when it was not selected, and checks just that row again", async () => {
      installFind();
      renderView(CHECKED);
      await screen.findByText("Track 5");
      fireEvent.click(screen.getByText("Track 2"));

      fireEvent.click(within(await menuOn("Track 5")).getByRole("menuitem", { name: "Check again" }));

      // The right-clicked row replaced the selection of Track 2.
      expect(await screen.findByRole("toolbar", { name: "Selection" })).toHaveTextContent("1 track selected");
      await waitFor(() => expect(bridge.startFileCheck).toHaveBeenCalledWith({ selection: { track_ids: [5] } }));
    });
  });

  describe("the menu items do what they say", () => {
    const written: string[] = [];
    beforeEach(() => {
      written.length = 0;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn(async (text: string) => void written.push(text)) },
      });
    });

    async function menuOn(name: string) {
      fireEvent.contextMenu(await screen.findByText(name));
      return screen.findByRole("menu");
    }

    it("copies the found path and the expected path, and shows the details", async () => {
      installFind();
      renderView(CHECKED);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await screen.findByText("Found in Moved");

      fireEvent.click(within(await menuOn("Track 1")).getByRole("menuitem", { name: "Copy found path" }));
      await waitFor(() => expect(written).toEqual(["/Users/dj/Moved/sub/1.mp3"]));

      fireEvent.click(within(await menuOn("Track 1")).getByRole("menuitem", { name: "Copy expected path" }));
      await waitFor(() => expect(written).toEqual(["/Users/dj/Moved/sub/1.mp3", "E:\\gone\\1.mp3"]));

      const commands: string[] = [];
      const listen = (event: Event) => commands.push((event as CustomEvent<string>).detail);
      window.addEventListener("cuepoint:shell-command", listen);
      fireEvent.click(within(await menuOn("Track 1")).getByRole("menuitem", { name: "Show details" }));
      window.removeEventListener("cuepoint:shell-command", listen);
      expect(commands).toEqual(["toggle-inspector"]);
    });

    it("shows the expected folder through the engine", async () => {
      installFind();
      bridge.getTrackFolder!.mockResolvedValue({ track_id: 2, file_path: "E:\\gone\\2.mp3", file_exists: false, folder: "E:\\gone" });
      renderView(CHECKED);
      await screen.findByText("Track 2");

      fireEvent.click(within(await menuOn("Track 2")).getByRole("menuitem", { name: "Show expected folder" }));

      await waitFor(() => expect(bridge.getTrackFolder).toHaveBeenCalledWith({ trackId: 2 }));
      await waitFor(() => expect(bridge.showItemInFolder).toHaveBeenCalledWith("E:\\gone"));
    });

    it("has Copy expected path on the selection bar too, so nothing is right-click only", async () => {
      installFind();
      renderView(CHECKED);
      fireEvent.click(await screen.findByText("Track 2"));

      fireEvent.click(await screen.findByRole("button", { name: "Copy expected path" }));

      await waitFor(() => expect(written).toEqual(["E:\\gone\\2.mp3"]));
    });
  });

  describe("what was found stays true to the list", () => {
    it("forgets only the checked rows when some rows are checked again", async () => {
      installFind([
        { track_id: 1, path: "/Users/dj/Moved/1.mp3" },
        { track_id: 2, path: "/Users/dj/Moved/2.mp3" },
      ]);
      renderView(CHECKED);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await waitFor(() => expect(screen.getAllByText("Found in Moved")).toHaveLength(2));

      fireEvent.click(screen.getByText("Track 1"));
      fireEvent.click(await screen.findByRole("button", { name: "Check 1 again" }));

      await waitFor(() => expect(screen.getAllByText("Found in Moved")).toHaveLength(1));
      expect(screen.getByText(/1 found in Moved/)).toBeInTheDocument();
    });

    it("drops a found track that is no longer in the list when the list reloads", async () => {
      installFind();
      renderView(CHECKED);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await screen.findByText("Found in Moved");
      expect(screen.getByText(/rows show where it is now/)).toBeInTheDocument();

      // Track 1 is fixed in Rekordbox; the list is read again (a new sort asks for it).
      bridge.browseLibrary!.mockImplementation(async (params: Record<string, unknown>) =>
        browseAnswer(params, MISSING.slice(1)),
      );
      fireEvent.click(screen.getByRole("button", { name: /^Title/ }));

      await waitFor(() => expect(screen.queryByText("Track 1")).toBeNull());
      expect(screen.queryByText("Found in Moved")).toBeNull();
      expect(screen.queryByText(/found in Moved/)).toBeNull();
      expect(screen.queryByText(/rows show where it is now/)).toBeNull();
    });
  });

  describe("unreadable files", () => {
    const UNREADABLE = MISSING.map((row) => ({ ...row, file_status: "unreadable" as const }));

    it("cannot be looked for: the buttons, menu item and double-click are off, with the reason", async () => {
      install(UNREADABLE);
      installFind();
      renderView(CHECKED);
      fireEvent.click(await screen.findByText("Track 1"));

      expect(await screen.findByRole("button", { name: "Find it…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Find in a folder…" })).toBeDisabled();
      const item = within(await screen.findByRole("menu", {}).catch(async () => {
        fireEvent.contextMenu(screen.getByText("Track 1"));
        return screen.findByRole("menu");
      })).getByRole("menuitem", { name: "Find it in a folder…" });
      expect(item).toHaveAttribute("aria-disabled", "true");
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

      fireEvent.doubleClick(screen.getByText("Track 2"));
      expect(await screen.findByText(/unreadable file is there but cannot be opened/)).toBeInTheDocument();
      expect(bridge.startFileFind).not.toHaveBeenCalled();
    });

    it("stay on for a mixed selection, and the toast says how many were not looked for", async () => {
      const mixed = MISSING.map((row, index) => (index === 0 ? { ...row, file_status: "unreadable" as const } : row));
      install(mixed);
      installFind([]);
      bridge.startFileFind!.mockResolvedValue({ ...PICKED, tracks: 11 });
      renderView(CHECKED);
      await screen.findByText("Track 1");

      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));

      expect(await screen.findByText("None of the 11 in Moved. 1 unreadable file not looked for")).toBeInTheDocument();
    });
  });

  describe("a view that is hidden while a find runs (Clean keeps its pages in Activity)", () => {
    it("reads the result when it is shown again, even though the job ended while hidden", async () => {
      installFind();
      let finished = false;
      bridge.getJob = vi.fn(async () => ({ id: "job-find", state: finished ? "succeeded" : "running" }));
      const Host = ({ mode }: { mode: "visible" | "hidden" }) => (
        <ScaleProvider>
          <ToastProvider>
            <MemoryRouter>
              <Activity mode={mode}>
                <MissingFilesView health={CHECKED} onHealthChanged={() => {}} />
              </Activity>
            </MemoryRouter>
          </ToastProvider>
        </ScaleProvider>
      );
      const view = render(<Host mode="visible" />);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalled());

      view.rerender(<Host mode="hidden" />);
      finished = true;
      view.rerender(<Host mode="visible" />);

      expect(await screen.findByText("Found in Moved")).toBeInTheDocument();
      expect(await screen.findByText("Found 1 of 12 in Moved")).toBeInTheDocument();
      expect(bridge.getJobResults).toHaveBeenCalledTimes(1);
      // The buttons are not left spinning, so a new find is not refused.
      await waitFor(() => expect(screen.getByRole("button", { name: "Find in a folder…" })).toBeEnabled());
    });

    it("keeps the button busy while the engine job is still running when it is shown again", async () => {
      installFind();
      bridge.getJob = vi.fn(async () => ({ id: "job-find", state: "running" }));
      const Host = ({ mode }: { mode: "visible" | "hidden" }) => (
        <ScaleProvider>
          <ToastProvider>
            <MemoryRouter>
              <Activity mode={mode}>
                <MissingFilesView health={CHECKED} onHealthChanged={() => {}} />
              </Activity>
            </MemoryRouter>
          </ToastProvider>
        </ScaleProvider>
      );
      const view = render(<Host mode="visible" />);
      await screen.findByText("Track 1");
      fireEvent.click(screen.getByRole("button", { name: "Find in a folder…" }));
      await waitFor(() => expect(bridge.startFileFind).toHaveBeenCalled());

      view.rerender(<Host mode="hidden" />);
      view.rerender(<Host mode="visible" />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Find in a folder…" })).toBeDisabled());
    });
  });

  it("colours the found chip with the success tone, in a class of its own", () => {
    const rule = /\.cp-badge\.clean-found-chip\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/--chip-tone:\s*var\(--accent-success\)/);
    expect(rule).toMatch(/--chip-text:\s*var\(--success-text\)/);
  });
});
