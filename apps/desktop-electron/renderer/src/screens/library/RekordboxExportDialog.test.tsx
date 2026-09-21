/**
 * "Export to Rekordbox…" (EXPORT-07, DEC-084, DEC-087).
 *
 * Over a faked bridge answering with the engine's own responses
 * (`rekordboxExport.fixture.json`, produced by the Python suite):
 *
 * - **Both ways in** open the same dialog, with nothing ticked or with the one
 *   node ticked, and the preview is asked for exactly that.
 * - **The dialog says what will be written, in order**, including every
 *   warning and each notation's consequence line.
 * - **Nothing is written until confirm**, confirm says what it will do, and it
 *   is disabled while a refusal stands or before a destination is chosen.
 * - **"Refresh first"** hands off to the page and starts nothing here.
 * - **A busy library is waited for**, and the preview asked again when it ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  CollectionNode,
  RekordboxExportHistory,
  RekordboxExportPreviewAnswer,
  RekordboxExportResult,
  RekordboxExportStartAnswer,
} from "../../api/cuepointBridge.types";
import { buildCollectionTree, type CollectionTreeNode } from "./collectionTree";
import fixture from "./rekordboxExport.fixture.json";
import { OPEN_IN_REKORDBOX } from "./rekordboxExport";
import { RekordboxExportDialog, type RekordboxExportDialogProps } from "./RekordboxExportDialog";

type Fixture = keyof typeof fixture;
const answer = (name: Fixture) => fixture[name] as unknown as RekordboxExportPreviewAnswer;
const HISTORY_EMPTY = fixture.history_empty as unknown as RekordboxExportHistory;
const HISTORY = fixture.history as unknown as RekordboxExportHistory;
const WRITTEN = fixture.result_written as unknown as RekordboxExportResult;
const CANCELLED = fixture.result_cancelled as unknown as RekordboxExportResult;

const CHOSEN_FILE = "C:\\Users\\dj\\Music\\Exports\\CuePoint Export 2026-09-21.xml";
const OTHER_FILE = "C:\\Users\\dj\\Music\\Exports\\Saturday.xml";

function node(
  id: number,
  kind: CollectionNode["kind"],
  name: string,
  parent_id: number | null = null,
  extra: Partial<CollectionNode> = {},
): CollectionNode {
  return {
    id,
    parent_id,
    kind,
    name,
    position: id,
    depth: 0,
    rules: kind === "smart" ? { match: "all", rules: [] } : null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: kind === "collection" ? 2 : 0,
    track_count: 0,
    broken: false,
    problem: null,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
    ...extra,
  };
}

/** The tree the fixture's library holds, as the pane reads it. */
const TREE: CollectionTreeNode[] = buildCollectionTree([
  node(1, "folder", "Gigs"),
  node(2, "collection", "Saturday", 1),
  node(3, "folder", "2026", 1),
  node(4, "collection", "Summer", 3),
  node(7, "collection", "Loose"),
  node(8, "smart", "Fast"),
  node(9, "smart", "Tagged", null, { broken: true, problem: "Its tag was deleted" }),
]);

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;
let listeners: Map<string, (event: { state: string }) => void>;
let jobStates: Record<string, string>;
let results: Record<string, unknown>;

function started(jobId = "x-1"): RekordboxExportStartAnswer {
  return {
    started: {
      job_id: jobId,
      id: jobId,
      state: "queued",
      collection_ids: [7],
      key_format: "normal",
      destination_path: CHOSEN_FILE,
    },
    refusal: null,
  };
}

beforeEach(() => {
  listeners = new Map();
  jobStates = {};
  results = { "x-1": WRITTEN };
  bridge = {
    getRekordboxExportHistory: vi.fn().mockResolvedValue(HISTORY_EMPTY),
    previewRekordboxExport: vi.fn(
      async ({ collection_ids, key_format }: { collection_ids: number[]; key_format: string }) => {
        if (collection_ids.length === 0) return answer("whole_library");
        if (key_format === "camelot") return answer("chosen_camelot");
        if (key_format === "short") return answer("chosen_short");
        return answer("chosen");
      },
    ),
    chooseRekordboxExportDestination: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: CHOSEN_FILE }),
    startRekordboxExport: vi.fn().mockResolvedValue(started()),
    getJob: vi.fn(async (id: string) => ({ id, state: jobStates[id] ?? "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({
      id,
      state: jobStates[id] ?? "succeeded",
      result: results[id],
    })),
    subscribeJobEvents: vi.fn((id: string, onEvent: (event: { state: string }) => void) => {
      listeners.set(id, onEvent);
      return () => listeners.delete(id);
    }),
    cancelJob: vi.fn().mockResolvedValue({ id: "x-1", state: "cancelled" }),
    showItemInFolder: vi.fn().mockResolvedValue(undefined),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function renderDialog(props: Partial<RekordboxExportDialogProps> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onRefreshFirst: vi.fn(),
    onImport: vi.fn(),
    onOpenMissingFiles: vi.fn(),
  };
  render(
    <RekordboxExportDialog open initialIds={[]} tree={TREE} {...handlers} {...props} />,
  );
  return handlers;
}

const dialog = () => screen.getByRole("dialog");
const confirmButton = () =>
  within(dialog()).getByRole("button", { name: /^Export( |$)/ });
const box = (name: string) => within(dialog()).getByRole("checkbox", { name: new RegExp(`^${name}`) });

async function previewed(text = /in the exported file/) {
  await within(dialog()).findByText(text);
  await waitFor(() => expect(screen.queryByText(/Working out what the export/)).toBeNull());
}

async function chooseDestination(user = userEvent.setup()) {
  await user.click(within(dialog()).getByRole("button", { name: "Choose…" }));
  await within(dialog()).findByText(CHOSEN_FILE);
}

describe("the two ways in (DEC-087)", () => {
  it("opens from the header with nothing ticked and previews the whole file", async () => {
    renderDialog({ initialIds: [] });
    await previewed();

    for (const name of ["Gigs", "Saturday", "Summer", "Loose", "Fast"]) {
      expect(box(name)).not.toBeChecked();
    }
    expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
      collection_ids: [],
      key_format: "normal",
    });
    expect(within(dialog()).getByTestId("export-playlist-headline")).toHaveTextContent(
      "No playlists are added. Tick a Collection to send it to Rekordbox as a playlist.",
    );
  });

  it("opens from a Collection's menu with that node ticked, and previews it", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();

    expect(box("Loose")).toBeChecked();
    expect(box("Saturday")).not.toBeChecked();
    expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
      collection_ids: [7],
      key_format: "normal",
    });
  });

  it("opens from a Smart Collection's menu with it ticked", async () => {
    renderDialog({ initialIds: [8] });
    await previewed();
    expect(box("Fast")).toBeChecked();
    expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
      collection_ids: [8],
      key_format: "normal",
    });
  });

  it("opens from a folder's menu with everything under it ticked and fixed", async () => {
    renderDialog({ initialIds: [1] });
    await previewed();

    expect(box("Gigs")).toBeChecked();
    for (const name of ["Saturday", "2026", "Summer"]) {
      expect(box(name)).toBeChecked();
      expect(box(name)).toBeDisabled();
    }
    expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
      collection_ids: [1],
      key_format: "normal",
    });
  });
});

describe("choosing what to send", () => {
  it("asks for a new preview when a tick changes, and sends a folder once", async () => {
    const user = userEvent.setup();
    renderDialog();
    await previewed();

    await user.click(box("Saturday"));
    await user.click(box("Gigs"));
    await waitFor(() =>
      expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
        collection_ids: [1],
        key_format: "normal",
      }),
    );
    await previewed();
    expect(within(dialog()).getByTestId("export-playlist-headline")).toHaveTextContent(
      "4 playlists added, in a folder called “CuePoint”",
    );
  });

  it("offers no tick for a broken Smart Collection, and says why", async () => {
    renderDialog();
    await previewed();
    expect(box("Tagged")).toBeDisabled();
    expect(box("Tagged").closest("label")).toHaveAttribute("title", "Its tag was deleted");
  });

  it("says what to do when there are no Collections at all", async () => {
    renderDialog({ tree: [] });
    await previewed();
    expect(within(dialog()).getByText(/You have no Collections yet/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole("checkbox")).toBeNull();
  });

  it("says a ticked folder with nothing in it adds no playlists", async () => {
    bridge.previewRekordboxExport.mockResolvedValue(answer("empty_folder"));
    renderDialog({ initialIds: [3] });
    await previewed();
    expect(within(dialog()).getByTestId("export-playlist-headline")).toHaveTextContent(
      "What you ticked holds no Collections, so no playlists are added.",
    );
  });

  it("draws a late answer to an older question as nothing", async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: RekordboxExportPreviewAnswer) => void = () => undefined;
    bridge.previewRekordboxExport
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(answer("chosen"));
    renderDialog({ initialIds: [] });
    await waitFor(() => expect(bridge.previewRekordboxExport).toHaveBeenCalledTimes(1));

    await user.click(box("Loose"));
    await previewed();
    resolveFirst(answer("collision"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(within(dialog()).queryByText(/already has a top-level folder/)).toBeNull();
    expect(within(dialog()).getByTestId("export-playlist-headline")).toHaveTextContent(
      "4 playlists added",
    );
  });
});

describe("numbers only for the question on screen", () => {
  it("takes the old numbers away while a changed choice is being previewed", async () => {
    const user = userEvent.setup();
    renderDialog({ initialIds: [7] });
    await previewed();
    expect(within(dialog()).getByTestId("export-track-count")).toBeInTheDocument();

    bridge.previewRekordboxExport.mockImplementation(() => new Promise(() => undefined));
    await user.click(box("Saturday"));

    await waitFor(() => expect(within(dialog()).queryByTestId("export-track-count")).toBeNull());
    expect(within(dialog()).queryByRole("list", { name: "Playlists to add" })).toBeNull();
    expect(confirmButton()).toHaveTextContent(/^Export$/);
    expect(confirmButton()).toBeDisabled();
  });
});

describe("what the preview says, in order", () => {
  it("states the destination, source, tracks, playlists, warnings and notation in that order", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();

    const order = within(dialog())
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-label"));
    expect(order).toEqual(["Destination", "Source", "Tracks", "Playlists", "Warnings", "Key notation"]);
  });

  it("counts the tracks and what changes in them, field by field", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();

    expect(within(dialog()).getByTestId("export-track-count")).toHaveTextContent(
      "4 tracks in the exported file",
    );
    expect(within(dialog()).getByText("2 tracks rewritten with CuePoint's values")).toBeInTheDocument();
    const fields = within(dialog()).getByRole("list", { name: "Changed fields" });
    expect(within(fields).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Key: 1 track",
      "Genre: 1 track",
      "Rating: 1 track",
    ]);
  });

  it("lists each playlist at the path it lands on, with what the file cannot hold", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();

    const list = within(dialog()).getByRole("list", { name: "Playlists to add" });
    const items = within(list).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "CuePoint/Gigs/Saturday3 tracks of 4",
      "CuePoint/Gigs/2026/Summer1 track",
      "CuePoint/Loose1 track",
      "CuePoint/Fast2 tracks of 3 · Smart Collection, as it matches now",
    ]);
  });

  it("names the source and says it is never changed", async () => {
    renderDialog();
    await previewed();
    expect(
      within(dialog()).getByText(/Patches a copy of collection\.xml.*never changed/),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(/1 track in the file is not in your CuePoint library/),
    ).toBeInTheDocument();
  });

  it("draws every warning: tracks the file lacks and missing files", async () => {
    const handlers = renderDialog({ initialIds: [7] });
    await previewed();

    const warnings = within(dialog()).getByRole("region", { name: "Warnings" });
    expect(within(warnings).getByText(/2 playlist entries pointing at it are left out/)).toBeInTheDocument();
    expect(within(warnings).getByText(/1 track has its audio file missing/)).toBeInTheDocument();

    await userEvent.setup().click(within(warnings).getByRole("button", { name: "Show missing files" }));
    expect(handlers.onOpenMissingFiles).toHaveBeenCalledTimes(1);
  });

  it("draws a never-checked library as not counted, never as zero", async () => {
    renderDialog();
    await previewed();
    expect(within(dialog()).getByText(/Files have never been checked/)).toBeInTheDocument();
    expect(within(dialog()).queryByText(/0 tracks have their audio file missing/)).toBeNull();
  });

  it("draws a name collision", async () => {
    bridge.previewRekordboxExport.mockResolvedValue(answer("collision"));
    renderDialog({ initialIds: [7] });
    await previewed();
    expect(
      within(dialog()).getByText(/already has a top-level folder called “CuePoint”.*“CuePoint \(2\)”/),
    ).toBeInTheDocument();
  });

  it("describes an export that changes nothing as a copy", async () => {
    renderDialog();
    await previewed();
    expect(within(dialog()).getByText(/exact copy of your collection file/)).toBeInTheDocument();
  });
});

describe("the key notation (DEC-089)", () => {
  it("starts in the notation the last export used", async () => {
    bridge.getRekordboxExportHistory.mockResolvedValue(HISTORY);
    renderDialog({ initialIds: [7] });
    await previewed();

    expect(within(dialog()).getByRole("combobox", { name: /Key notation/ })).toHaveValue("camelot");
    expect(bridge.previewRekordboxExport).toHaveBeenCalledTimes(1);
    expect(bridge.previewRekordboxExport).toHaveBeenCalledWith({ collection_ids: [7], key_format: "camelot" });
  });

  it("starts in classic, saying nothing, when nothing has been exported", async () => {
    renderDialog();
    await previewed();
    expect(within(dialog()).getByRole("combobox", { name: /Key notation/ })).toHaveValue("normal");
    expect(within(dialog()).queryByTestId("export-key-consequence")).toBeNull();
  });

  it.each([
    ["camelot", "Camelot keys (8A)"],
    ["short", "short keys (Amin)"],
  ])("states %s's consequence where it is chosen, and previews it", async (format, words) => {
    const user = userEvent.setup();
    renderDialog({ initialIds: [7] });
    await previewed();

    await user.selectOptions(within(dialog()).getByRole("combobox", { name: /Key notation/ }), format);
    const line = await within(dialog()).findByTestId("export-key-consequence");
    expect(line).toHaveTextContent(words);
    expect(line).toHaveTextContent("import this file into CuePoint later");
    await waitFor(() =>
      expect(bridge.previewRekordboxExport).toHaveBeenLastCalledWith({
        collection_ids: [7],
        key_format: format,
      }),
    );
  });

  it("takes the line away again when classic is chosen back", async () => {
    const user = userEvent.setup();
    bridge.getRekordboxExportHistory.mockResolvedValue(HISTORY);
    renderDialog({ initialIds: [7] });
    await previewed();
    expect(within(dialog()).getByTestId("export-key-consequence")).toBeInTheDocument();

    await user.selectOptions(within(dialog()).getByRole("combobox", { name: /Key notation/ }), "normal");
    expect(within(dialog()).queryByTestId("export-key-consequence")).toBeNull();
  });

  it("offers the three labels the file-tag path offers", async () => {
    renderDialog();
    await previewed();
    const options = within(within(dialog()).getByRole("combobox", { name: /Key notation/ }))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "As Rekordbox writes it (Am, C#)",
      "Camelot (8A, 12B)",
      "Short (Amin, Gmaj)",
    ]);
  });
});

describe("the destination", () => {
  it("starts unchosen, naming the folder the save dialog will open in", async () => {
    bridge.getRekordboxExportHistory.mockResolvedValue(HISTORY);
    renderDialog();
    await previewed();
    expect(
      within(dialog()).getByText(/Not chosen yet — the save dialog opens in C:\\Users\\dj\\Music\\Exports/),
    ).toBeInTheDocument();
  });

  it("is chosen in the save dialog, and reopens it at that choice", async () => {
    const user = userEvent.setup();
    renderDialog();
    await previewed();

    await chooseDestination(user);
    expect(bridge.chooseRekordboxExportDestination).toHaveBeenLastCalledWith({ currentPath: null });

    bridge.chooseRekordboxExportDestination.mockResolvedValue({ canceled: false, filePath: OTHER_FILE });
    await user.click(within(dialog()).getByRole("button", { name: "Change…" }));
    await within(dialog()).findByText(OTHER_FILE);
    expect(bridge.chooseRekordboxExportDestination).toHaveBeenLastCalledWith({
      currentPath: CHOSEN_FILE,
    });
  });

  it("stays as it was when the save dialog is cancelled", async () => {
    const user = userEvent.setup();
    bridge.chooseRekordboxExportDestination.mockResolvedValue({ canceled: true });
    renderDialog();
    await previewed();

    await user.click(within(dialog()).getByRole("button", { name: "Choose…" }));
    await waitFor(() => expect(bridge.chooseRekordboxExportDestination).toHaveBeenCalled());
    expect(within(dialog()).getByText(/Not chosen yet/)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

describe("confirming", () => {
  it("says what it will do, and waits for a destination", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();

    expect(confirmButton()).toHaveTextContent("Export 4 tracks and 4 playlists");
    expect(confirmButton()).toBeDisabled();
    expect(within(dialog()).getByTestId("export-blocker")).toHaveTextContent(
      "Choose where to save the file.",
    );
  });

  it("writes nothing while choosing, ticking and changing notation", async () => {
    const user = userEvent.setup();
    renderDialog({ initialIds: [7] });
    await previewed();

    await user.click(box("Saturday"));
    await user.selectOptions(within(dialog()).getByRole("combobox", { name: /Key notation/ }), "camelot");
    await chooseDestination(user);
    await previewed();

    expect(bridge.startRekordboxExport).not.toHaveBeenCalled();
  });

  it("starts the export it previewed, follows the job and says what it wrote", async () => {
    const user = userEvent.setup();
    const handlers = renderDialog({ initialIds: [7] });
    await previewed();
    await chooseDestination(user);

    await user.click(confirmButton());

    expect(bridge.startRekordboxExport).toHaveBeenCalledWith({
      collection_ids: [7],
      key_format: "normal",
      destination_path: CHOSEN_FILE,
    });
    expect(
      await within(dialog()).findByText(
        "Exported to CuePoint Export 2026-09-21.xml: 4 tracks, 3 rewritten, 4 playlists added.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).getByText(OPEN_IN_REKORDBOX)).toBeInTheDocument();

    await user.click(within(dialog()).getByRole("button", { name: "Show in folder" }));
    expect(bridge.showItemInFolder).toHaveBeenCalledWith(WRITTEN.destination_path);

    await user.click(within(dialog()).getByRole("button", { name: "Done" }));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("cannot be closed or confirmed twice while the export runs, and can be stopped", async () => {
    const user = userEvent.setup();
    jobStates["x-1"] = "running";
    results["x-1"] = CANCELLED;
    const handlers = renderDialog({ initialIds: [7] });
    await previewed();
    await chooseDestination(user);

    await user.click(confirmButton());
    const stop = await within(dialog()).findByRole("button", { name: "Stop" });
    expect(within(dialog()).getByText(/the file appears only once it is complete/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(handlers.onClose).not.toHaveBeenCalled();

    await user.click(stop);
    expect(bridge.cancelJob).toHaveBeenCalledWith("x-1");

    jobStates["x-1"] = "cancelled";
    listeners.get("x-1")!({ state: "cancelled" });
    expect(
      await within(dialog()).findByText(
        "Stopped. Nothing was written, and the file you chose was left as it was.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).queryByRole("button", { name: "Show in folder" })).toBeNull();
    expect(bridge.startRekordboxExport).toHaveBeenCalledTimes(1);
  });

  it("says why a failed job failed", async () => {
    const user = userEvent.setup();
    jobStates["x-1"] = "failed";
    results["x-1"] = undefined;
    bridge.getJob.mockImplementation(async (id: string) => ({
      id,
      state: "failed",
      error: { code: "REKORDBOX_EXPORT_FAILED", message: "The disk is full." },
    }));
    renderDialog({ initialIds: [7] });
    await previewed();
    await chooseDestination(user);

    await user.click(confirmButton());
    expect(await within(dialog()).findByText("The disk is full.")).toBeInTheDocument();
  });

  it("shows a refused destination and holds confirm until another file is chosen", async () => {
    const user = userEvent.setup();
    bridge.startRekordboxExport.mockResolvedValueOnce(answer("destination_is_source"));
    renderDialog({ initialIds: [7] });
    await previewed();
    await chooseDestination(user);

    await user.click(confirmButton());
    const refused = await within(dialog()).findByRole("region", { name: "Refused" });
    expect(refused).toHaveTextContent(/never writes over it/);
    await previewed();
    expect(confirmButton()).toBeDisabled();

    bridge.chooseRekordboxExportDestination.mockResolvedValue({ canceled: false, filePath: OTHER_FILE });
    await user.click(within(refused).getByRole("button", { name: "Choose another file…" }));
    await within(dialog()).findByText(OTHER_FILE);
    expect(within(dialog()).queryByRole("region", { name: "Refused" })).toBeNull();
    expect(confirmButton()).toBeEnabled();
  });
});

describe("refusals (DEC-082, DEC-083)", () => {
  it.each([
    ["source_missing", /not there any more/],
    ["source_invalid", /cannot be read as a Rekordbox collection/],
    ["never_imported", /Import your Rekordbox collection first/],
  ] as const)("a %s refusal holds confirm and offers importing", async (name, words) => {
    const user = userEvent.setup();
    bridge.previewRekordboxExport.mockResolvedValue(answer(name));
    const handlers = renderDialog({ initialIds: [7] });
    await chooseDestination(user);

    const refused = await within(dialog()).findByRole("region", { name: "Refused" });
    expect(refused).toHaveTextContent(words);
    expect(confirmButton()).toBeDisabled();
    expect(within(dialog()).getByTestId("export-blocker")).toHaveTextContent("problem above");
    expect(within(dialog()).queryByRole("region", { name: "Tracks" })).toBeNull();

    await user.click(within(refused).getByRole("button", { name: "Import a different collection…" }));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
    expect(bridge.startRekordboxExport).not.toHaveBeenCalled();
  });

  it("waits for a busy library and previews again when the job ends", async () => {
    const user = userEvent.setup();
    jobStates["job-import"] = "running";
    bridge.previewRekordboxExport.mockResolvedValueOnce(answer("library_busy"));
    renderDialog({ initialIds: [7] });
    await chooseDestination(user);

    const refused = await within(dialog()).findByRole("region", { name: "Refused" });
    expect(refused).toHaveTextContent("An import is running.");
    expect(confirmButton()).toBeDisabled();
    await waitFor(() => expect(listeners.has("job-import")).toBe(true));

    jobStates["job-import"] = "succeeded";
    listeners.get("job-import")!({ state: "succeeded" });
    await previewed();
    expect(within(dialog()).queryByRole("region", { name: "Refused" })).toBeNull();
    expect(confirmButton()).toBeEnabled();
    expect(bridge.previewRekordboxExport).toHaveBeenCalledTimes(2);
  });

  it("offers trying again for a file that could not be read", async () => {
    const user = userEvent.setup();
    bridge.previewRekordboxExport.mockResolvedValueOnce({
      preview: null,
      refusal: { ...answer("source_missing").refusal!, reason: "source_unreadable" },
    });
    renderDialog({ initialIds: [7] });
    const refused = await within(dialog()).findByRole("region", { name: "Refused" });

    await user.click(within(refused).getByRole("button", { name: "Try again" }));
    await previewed();
    expect(bridge.previewRekordboxExport).toHaveBeenCalledTimes(2);
  });

  it("shows an unforeseen failure in the engine's words", async () => {
    bridge.previewRekordboxExport.mockRejectedValue(new Error("No such collection to export: 7"));
    renderDialog({ initialIds: [7] });
    expect(await within(dialog()).findByText("No such collection to export: 7")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});

describe("staleness (DEC-082)", () => {
  it("warns with the real numbers and still lets the export go ahead", async () => {
    const user = userEvent.setup();
    bridge.previewRekordboxExport.mockResolvedValue(answer("stale"));
    renderDialog({ initialIds: [7] });
    await previewed();
    await chooseDestination(user);

    const source = within(dialog()).getByRole("region", { name: "Source" });
    expect(within(source).getByRole("alert")).toHaveTextContent(
      /collection\.xml has changed since you imported it.*830 bytes, was 821 bytes/,
    );
    expect(confirmButton()).toBeEnabled();
  });

  it("offers Refresh first, which hands off and starts nothing here", async () => {
    const user = userEvent.setup();
    bridge.previewRekordboxExport.mockResolvedValue(answer("stale"));
    const handlers = renderDialog({ initialIds: [7] });
    await previewed();

    await user.click(within(dialog()).getByRole("button", { name: "Refresh first" }));
    expect(handlers.onRefreshFirst).toHaveBeenCalledTimes(1);
    expect(bridge.startRekordboxExport).not.toHaveBeenCalled();
  });

  it("offers it too when staleness cannot be known", async () => {
    bridge.previewRekordboxExport.mockResolvedValue(answer("stale_unknown"));
    renderDialog();
    await previewed();
    expect(within(dialog()).getByText(/cannot tell whether the file has changed/)).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Refresh first" })).toBeInTheDocument();
  });

  it("offers nothing to refresh when the file is the one imported", async () => {
    renderDialog({ initialIds: [7] });
    await previewed();
    expect(within(dialog()).queryByRole("button", { name: "Refresh first" })).toBeNull();
  });
});

describe("without the desktop app", () => {
  it("says so, and cannot export", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderDialog({ initialIds: [7] });
    expect(
      within(dialog()).getByText("Exporting needs the desktop app with the engine connected."),
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    expect(within(dialog()).getByRole("button", { name: "Choose…" })).toBeDisabled();
  });
});
