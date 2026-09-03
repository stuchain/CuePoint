/**
 * The Library page (LIBRARY-11).
 *
 * The acceptance criterion is a sentence about a user: they can import a
 * collection, see it, refresh it, and **cancel a refresh at the preview without
 * anything changing**. These tests are written against that sentence, so the
 * ones that matter most are the ones that assert nothing happened.
 *
 * The bridge is faked at `window.cuepoint`, which is where the renderer's only
 * contact with the engine lives. Jobs are followed the way the real page
 * follows them — start, then wait for a terminal state — so a page that forgot
 * to wait would show its "done" toast against a job still running and fail
 * here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LibraryScreen } from "./LibraryScreen";
import { ToastProvider } from "../../components";
import type { LibrarySummary, RefreshDiff } from "../../api/cuepointBridge.types";

function category<T>(count = 0, items: T[] = []) {
  return { count, items, truncated: count > items.length };
}

const EMPTY_SUMMARY: LibrarySummary = {
  track_count: 0,
  playlist_count: 0,
  playlist_entry_count: 0,
  library_empty: true,
  source: null,
};

function loadedSummary(overrides: Partial<LibrarySummary> = {}): LibrarySummary {
  return {
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
    ...overrides,
  };
}

function diff(overrides: Partial<RefreshDiff> = {}): RefreshDiff {
  return {
    diff_id: "diff-1",
    xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
    is_empty: false,
    duration_seconds: 0.5,
    computed_at: "2026-09-03T11:00:00Z",
    xml_modified_at: "2026-09-03T10:30:00Z",
    xml_size_bytes: 2048,
    tracks: {
      added: category(3),
      changed: category(10),
      removed: category(2, [
        {
          rekordbox_track_id: "7",
          title: "Gone Track",
          artist: "Departed",
          file_path: "/m/7.mp3",
        },
        {
          rekordbox_track_id: "8",
          title: "Also Gone",
          artist: "Departed",
          file_path: "/m/8.mp3",
        },
      ]),
      relinked: category(),
      notable_changed_count: 10,
    },
    playlists: { added: category(), changed: category(4), removed: category() },
    references: {
      collection_count: 0,
      set_count: 0,
      referenced_track_count: 0,
      referenced_track_ids: [],
      has_references: false,
    },
    ...overrides,
  };
}

const APPLIED = {
  diff_id: "diff-1",
  xml_path: "C:\\Users\\dj\\Downloads\\collection.xml",
  track_count: 3881,
  tracks_inserted: 3,
  tracks_updated: 3878,
  tracks_deleted: 2,
  relinked_count: 0,
  playlists: { nodes: 234, playlists: 206, folders: 28, entries: 13800 },
  references: {
    collection_count: 0,
    set_count: 0,
    referenced_track_count: 0,
    referenced_track_ids: [],
    has_references: false,
  },
  duration_seconds: 0.6,
  summary_line: "Library refreshed",
};

interface Bridge {
  getLibrarySummary: ReturnType<typeof vi.fn>;
  startLibraryImport: ReturnType<typeof vi.fn>;
  startLibraryRefreshPreview: ReturnType<typeof vi.fn>;
  startLibraryRefreshApply: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  getJobResults: ReturnType<typeof vi.fn>;
  openXmlFileDialog: ReturnType<typeof vi.fn>;
}

let bridge: Bridge;

function install(overrides: Partial<Bridge> = {}) {
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue(EMPTY_SUMMARY),
    startLibraryImport: vi.fn().mockResolvedValue({ job_id: "job-import" }),
    startLibraryRefreshPreview: vi.fn().mockResolvedValue({ job_id: "job-preview" }),
    startLibraryRefreshApply: vi.fn().mockResolvedValue({ job_id: "job-apply" }),
    // No `subscribeJobEvents` on purpose: the page must work through the poll
    // fallback too, and polling is the path a browser-lab render takes.
    getJob: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    getJobResults: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    openXmlFileDialog: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "C:\\new\\collection.xml" }),
    ...overrides,
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

function renderScreen(props: { onOpenRekordboxInstructions?: () => void } = {}) {
  return render(
    <ToastProvider>
      <LibraryScreen {...props} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the empty state", () => {
  it("says what to do rather than showing zeroes", async () => {
    renderScreen();

    expect(await screen.findByText(/No collection imported yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import a collection/i })).toBeInTheDocument();
    // Zeroes would read as "your library is empty", which is a different
    // problem from "you have not imported anything".
    expect(screen.queryByTestId("library-track-count")).not.toBeInTheDocument();
  });

  it("offers the export instructions when the shell supplies them", async () => {
    const onOpen = vi.fn();
    renderScreen({ onOpenRekordboxInstructions: onOpen });

    await userEvent.click(await screen.findByRole("button", { name: /How do I export/i }));

    expect(onOpen).toHaveBeenCalled();
  });

  it("omits the instructions button when the shell has none to offer", async () => {
    renderScreen();
    await screen.findByText(/No collection imported yet/i);

    expect(screen.queryByRole("button", { name: /How do I export/i })).not.toBeInTheDocument();
  });
});

describe("importing", () => {
  it("picks a file, runs the job, and shows what landed", async () => {
    bridge.getLibrarySummary
      .mockResolvedValueOnce(EMPTY_SUMMARY)
      .mockResolvedValue(loadedSummary());
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    await waitFor(() => expect(bridge.startLibraryImport).toHaveBeenCalled());
    expect(bridge.startLibraryImport).toHaveBeenCalledWith({
      xml_path: "C:\\new\\collection.xml",
    });
    expect(await screen.findByTestId("library-track-count")).toHaveTextContent("3,880");
    // Both the name and the full path say "collection.xml", deliberately: the
    // name is what a user recognises, the path is what they check when a file
    // has moved.
    expect(screen.getAllByText(/collection\.xml/).length).toBeGreaterThan(0);
  });

  it("starts nothing when the file dialog is cancelled", async () => {
    bridge.openXmlFileDialog.mockResolvedValue({ canceled: true });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(bridge.startLibraryImport).not.toHaveBeenCalled();
  });

  it("explains a failed import instead of leaving the page silent", async () => {
    bridge.getJob.mockResolvedValue({
      id: "job-import",
      state: "failed",
      error: { code: "LIBRARY_XML_NO_COLLECTION", message: "no COLLECTION" },
    });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(await screen.findByText(/Export Collection/i)).toBeInTheDocument();
  });

  it("reports a refusal that happens before a job exists", async () => {
    bridge.startLibraryImport.mockRejectedValue(new Error("No such file: /gone.xml"));
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Import a collection/i }));

    expect(await screen.findByText(/No such file/i)).toBeInTheDocument();
  });
});

describe("an imported library", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
  });

  it("shows the counts and where they came from", async () => {
    renderScreen();

    expect(await screen.findByTestId("library-track-count")).toHaveTextContent("3,880");
    expect(screen.getByText(/234 playlists/)).toBeInTheDocument();
    expect(screen.getByText(/13,870 entries/)).toBeInTheDocument();
    expect(screen.getByText("C:\\Users\\dj\\Downloads\\collection.xml")).toBeInTheDocument();
  });

  it("says the export is unchanged when it is", async () => {
    renderScreen();

    expect(await screen.findByText(/Unchanged since your last import/i)).toBeInTheDocument();
    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  it("flags an export that has moved on", async () => {
    bridge.getLibrarySummary.mockResolvedValue(
      loadedSummary({ source: { ...loadedSummary().source!, changed: true } }),
    );
    renderScreen();

    expect(await screen.findByText(/has changed since your last import/i)).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
  });

  it("flags an export that is no longer there", async () => {
    bridge.getLibrarySummary.mockResolvedValue(
      loadedSummary({
        source: { ...loadedSummary().source!, exists: false, changed: null },
      }),
    );
    renderScreen();

    expect(await screen.findByText(/no longer where it was/i)).toBeInTheDocument();
  });

  it("does not list tracks — that is Phase 4's job", async () => {
    // The scope boundary this step is most likely to be eroded at.
    renderScreen();
    await screen.findByTestId("library-track-count");

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("the refresh preview (DEC-032)", () => {
  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: diff(),
    });
  });

  async function openPreview() {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));
    return screen.findByRole("dialog");
  }

  it("shows the counts a user is being asked to confirm", async () => {
    const dialog = await openPreview();

    expect(within(dialog).getByTestId("count-added")).toHaveTextContent("3");
    expect(within(dialog).getByTestId("count-changed")).toHaveTextContent("10");
    expect(within(dialog).getByTestId("count-removed")).toHaveTextContent("2");
  });

  it("puts the removals in front of the user, and names what goes with them", async () => {
    const dialog = await openPreview();

    const alert = within(dialog).getAllByRole("alert")[0]!;
    expect(alert).toHaveTextContent(/2 tracks/);
    expect(alert).toHaveTextContent(/cannot be undone/i);
    expect(within(dialog).getByText("Gone Track")).toBeInTheDocument();
    // And the number is on the button being pressed, not only in the paragraph.
    expect(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    ).toBeInTheDocument();
  });

  it("applies nothing until it is confirmed", async () => {
    await openPreview();

    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("applies the previewed diff by its id when confirmed", async () => {
    const dialog = await openPreview();
    bridge.getJobResults.mockResolvedValue({
      id: "job-apply",
      state: "succeeded",
      result: APPLIED,
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    await waitFor(() =>
      expect(bridge.startLibraryRefreshApply).toHaveBeenCalledWith({
        diff_id: "diff-1",
        confirm_references: false,
      }),
    );
    expect(await screen.findByText(/3,881 tracks in your library/)).toBeInTheDocument();
  });

  it("changes nothing when the preview is cancelled", async () => {
    // The acceptance criterion, stated as a test.
    const dialog = await openPreview();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("changes nothing when the preview is dismissed with Escape", async () => {
    // SHELL-10 gave every dialog Escape; here it has to mean "no" rather than
    // "yes, quietly".
    await openPreview();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("says so plainly when there is nothing to do", async () => {
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: diff({
        is_empty: true,
        tracks: {
          added: category(),
          changed: category(),
          removed: category(),
          relinked: category(),
          notable_changed_count: 0,
        },
        playlists: { added: category(), changed: category(), removed: category() },
      }),
    });
    const dialog = await openPreview();

    expect(within(dialog).getByText(/already matches this export/i)).toBeInTheDocument();
    // Nothing to confirm, so there is no confirm button to press by mistake.
    expect(
      within(dialog).queryByRole("button", { name: /refresh|Apply/i }),
    ).not.toBeInTheDocument();
  });

  it("explains a preview that failed rather than opening an empty dialog", async () => {
    bridge.getJob.mockResolvedValue({
      id: "job-preview",
      state: "failed",
      error: { code: "LIBRARY_NOT_IMPORTED" },
    });
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));

    expect(await screen.findByText(/Import a Rekordbox collection first/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a stale diff rather than applying it", async () => {
    const dialog = await openPreview();
    bridge.startLibraryRefreshApply.mockRejectedValue(
      new Error("collection.xml has changed since this preview was computed"),
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    expect(await screen.findByText(/has changed since this preview/i)).toBeInTheDocument();
  });
});

describe("the reference warning (DEC-011)", () => {
  // Zero in every library this build can produce — Collections arrive in Phase
  // 6 — so the path is exercised with a diff that answers non-zero. What is
  // being pinned is that the confirmation exists and gates the apply, so Phase
  // 6 inherits a flow that has been used rather than only written.
  const withReferences = diff({
    references: {
      collection_count: 2,
      set_count: 1,
      referenced_track_count: 2,
      referenced_track_ids: [7, 8],
      has_references: true,
    },
  });

  beforeEach(() => {
    bridge.getLibrarySummary.mockResolvedValue(loadedSummary());
    bridge.getJobResults.mockResolvedValue({
      id: "job-preview",
      state: "succeeded",
      result: withReferences,
    });
  });

  async function openPreview() {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Check for changes/i }));
    return screen.findByRole("dialog");
  }

  it("names the Collections and Sets that would change", async () => {
    const dialog = await openPreview();

    expect(within(dialog).getByText(/2 Collections and 1 Set/)).toBeInTheDocument();
  });

  it("will not apply until the extra warning is acknowledged", async () => {
    const dialog = await openPreview();
    const confirm = within(dialog).getByRole("button", {
      name: /Remove 2 tracks and refresh/i,
    });

    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(bridge.startLibraryRefreshApply).not.toHaveBeenCalled();
  });

  it("passes the confirmation through once it is given", async () => {
    const dialog = await openPreview();

    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Remove 2 tracks and refresh/i }),
    );

    await waitFor(() =>
      expect(bridge.startLibraryRefreshApply).toHaveBeenCalledWith({
        diff_id: "diff-1",
        confirm_references: true,
      }),
    );
  });
});

describe("without an engine", () => {
  it("says so instead of failing silently", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderScreen();

    // No summary to show, and no crash: the browser-lab render is a supported
    // way to work on this page.
    expect(await screen.findByText(/No collection imported yet/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Import a collection/i }));
    expect(await screen.findByText(/needs the desktop app/i)).toBeInTheDocument();
  });
});
