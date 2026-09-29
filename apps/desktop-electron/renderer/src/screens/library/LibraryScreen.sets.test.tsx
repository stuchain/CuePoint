/**
 * Sets in the Library page (PREP-09, DEC-104), over the engine's own answers
 * (`librarySets.fixture.json`) behind a faked bridge.
 *
 * - **The scope.** Selecting a Set scopes the table as a Collection does, and
 *   says the rows are its tracks once each (fact 3). Order and removal are
 *   Prepare's: no "Remove from" and no row drop inside a Set.
 * - **"Add to Set…"** joins the operations list, with a picker of Sets, and
 *   says what it skipped. "Add to Collection" no longer offers a Set.
 * - **"New Set from…"** a Collection or a Rekordbox playlist asks a name and a
 *   place, makes the Set, and opens it; "New Set from the selection…" takes
 *   the selected tracks in the table's order (PREP-12).
 * - **A Set's menu**: set lists saved and copied, the export with it ticked.
 * - **The Inspector** opens a Set in Prepare where there is one.
 * - **A refresh** that emptied a Set says so when the Set is opened.
 * - **A shell without the Sets bridge** offers none of it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackRow,
  RefreshDiff,
  RekordboxExportPreviewAnswer,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import exportFixture from "./rekordboxExport.fixture.json";
import { LibraryScreen } from "./LibraryScreen";
import { COLLECTIONS_PANE_STORAGE_KEY } from "./collectionTree";
import { TRACK_IDS_MIME } from "./collectionDrag";
import {
  ADDED_TO_SET,
  CREATED_FROM_COLLECTION,
  CREATED_FROM_PLAYLIST,
  CREATED_FROM_SELECTION,
  DELETE_PREVIEW,
  FRIDAY,
  GIGS,
  REFERENCES,
  SET_BROWSE,
  SET_LIST_SAVED,
  SET_LIST_TEXT,
  TRACK_DETAIL,
  TREE,
  WARMUP,
  answered,
} from "./librarySets.testFixture";

const SUMMARY: LibrarySummary = {
  track_count: 5,
  playlist_count: 1,
  playlist_entry_count: 3,
  library_empty: false,
  source: {
    xml_path: "C:\\Users\\dj\\Music\\collection.xml",
    imported_at: "2026-09-29T10:00:00Z",
    xml_modified_at: "2026-09-29T09:00:00Z",
    xml_size_bytes: 821,
    track_count: 5,
    playlist_count: 1,
    exists: true,
    changed: false,
  },
};

const TRACKS = SET_BROWSE.tracks as LibraryTrackRow[];

const PLAYLISTS = {
  playlists: [
    { id: 1, parent_id: null, name: "SETS", kind: "folder", depth: 0, position: 0, path: "SETS", track_count: 0 },
    { id: 2, parent_id: 1, name: "Sunday", kind: "playlist", depth: 1, position: 0, path: "SETS/Sunday", track_count: 3 },
  ],
  total: 2,
};

function browse(params: Record<string, unknown>, rows: LibraryTrackRow[] = TRACKS): LibrarySearchResponse {
  return {
    ...SET_BROWSE,
    total: rows.length,
    tracks: params.fields === "id" ? [] : rows,
    track_ids: params.fields === "id" ? rows.map((row) => row.id!) : undefined,
    scope: (params.playlistId as number | null) ?? null,
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
  };
}

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;
/** The Sets namespace (PREP-08), or undefined for a shell without it. */
let sets: Record<string, Mock> | undefined;

function install() {
  (window as unknown as { cuepoint?: unknown }).cuepoint = { ...bridge, ...(sets ? { sets } : {}) };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

let writeText: Mock;

beforeEach(() => {
  localStorage.clear();
  // Gigs open, as a user who filed Friday there left it.
  localStorage.setItem(
    COLLECTIONS_PANE_STORAGE_KEY,
    JSON.stringify({ expandedIds: [GIGS.id], selectedId: null, collapsed: false }),
  );
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue(SUMMARY),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => browse(params)),
    getLibraryPlaylists: vi.fn().mockResolvedValue(PLAYLISTS),
    getCollections: vi.fn().mockResolvedValue({ collections: TREE, total: TREE.length }),
    getLibraryFilterFields: vi
      .fn()
      .mockResolvedValue({ fields: [], operators: {}, facetable: [], sortable: [] }),
    getLibraryTrack: vi.fn().mockResolvedValue(TRACK_DETAIL),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
    applyBatch: vi.fn().mockResolvedValue({ applied: ADDED_TO_SET }),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    subscribeJobEvents: vi.fn(() => () => undefined),
    cancelJob: vi.fn(),
    showItemInFolder: vi.fn(),
    openXmlFileDialog: vi.fn().mockResolvedValue({ canceled: true }),
    startLibraryImport: vi.fn(),
    startLibraryRefreshPreview: vi.fn().mockResolvedValue({ job_id: "job-preview" }),
    startLibraryRefreshApply: vi.fn().mockResolvedValue({ job_id: "job-apply" }),
    previewCollectionDelete: vi.fn().mockResolvedValue({ removes: DELETE_PREVIEW }),
    deleteCollection: vi.fn(),
    getRekordboxExportHistory: vi.fn().mockResolvedValue(exportFixture.history_empty),
    previewRekordboxExport: vi.fn(
      async () => exportFixture.chosen_set as unknown as RekordboxExportPreviewAnswer,
    ),
    startRekordboxExport: vi.fn(),
    chooseRekordboxExportDestination: vi.fn(),
  };
  sets = {
    create: vi.fn(),
    createFrom: vi.fn(async ({ source }: { source: { kind: string } }) =>
      answered(source.kind === "playlist" ? CREATED_FROM_PLAYLIST : CREATED_FROM_COLLECTION),
    ),
    duplicate: vi.fn(),
    setListText: vi.fn().mockResolvedValue(answered(SET_LIST_TEXT)),
    saveSetList: vi.fn().mockResolvedValue(answered(SET_LIST_SAVED)),
    chooseSetListDestination: vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: "/music/set lists/Friday.csv" }),
  };
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function renderScreen(props: React.ComponentProps<typeof LibraryScreen> = {}) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <LibraryScreen {...props} />
          <InspectorSlotOutlet />
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>,
  );
}

async function ready() {
  await screen.findByRole("table", { name: "Library tracks" });
  await screen.findByText("Warm Two");
  const tree = await screen.findByRole("tree", { name: "Collections" });
  await within(tree).findByText("Friday copy");
}

function treeRow(name: string, kind: string): HTMLElement {
  const tree = screen.getByRole("tree", { name: "Collections" });
  return within(tree)
    .getAllByRole("treeitem")
    .find((item) => item.getAttribute("data-kind") === kind && within(item).queryByText(name))!;
}

function lastBrowse(): Record<string, unknown> {
  const calls = bridge.browseLibrary.mock.calls.filter(([params]) => params.fields !== "id");
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

async function rowMenu(title: string): Promise<HTMLElement> {
  fireEvent.contextMenu(await screen.findByText(title));
  return screen.findByRole("menu");
}

const labels = (menu: HTMLElement) =>
  within(menu).getAllByRole("menuitem").map((item) => item.textContent);

describe("a Set as the table's scope (DEC-104, fact 3)", () => {
  it("scopes the table as a Collection does, in its running order", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        scope: "collection",
        collectionId: FRIDAY.id,
        sort: "collection_position",
        dir: "asc",
      }),
    );
  });

  it("says its rows are its tracks once each", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(
      "“Friday” is a Set of 6 entries. The table lists each of its 5 tracks once, in the order they first play.",
    );
    // Nowhere to open it yet, so no link to nowhere.
    expect(within(note).queryByRole("button")).toBeNull();
  });

  it("links to Prepare from the note once there is a Prepare", async () => {
    const onOpenInPrepare = vi.fn();
    renderScreen({ onOpenInPrepare });
    await ready();
    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    await userEvent.click(
      within(await screen.findByRole("note")).getByRole("button", { name: "Open in Prepare" }),
    );
    expect(onOpenInPrepare).toHaveBeenCalledWith(FRIDAY.id);
  });

  it("says nothing of Sets over a Collection", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Warm-up", "collection")).getByText("Warm-up"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ collectionId: WARMUP.id }));
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("offers no removal inside a Set, which is Prepare's, and still does in a Collection", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    await screen.findByRole("note");
    const inSet = labels(await rowMenu("Warm Two"));
    expect(inSet).toContain("Add to Set…");
    expect(inSet.some((label) => label?.startsWith("Remove from"))).toBe(false);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(within(treeRow("Warm-up", "collection")).getByText("Warm-up"));
    await waitFor(() => expect(screen.queryByRole("note")).toBeNull());
    expect(labels(await rowMenu("Warm Two"))).toContain("Remove from “Warm-up”");
  });

  it("does not take a row dropped inside it, where a Collection does", async () => {
    const dragOverRow = () => {
      const row = screen.getByText("Peak One").closest("[role='row']") as HTMLElement;
      const transfer = {
        types: [TRACK_IDS_MIME],
        getData: () => JSON.stringify([3]),
        setData: vi.fn(),
        dropEffect: "",
        effectAllowed: "",
      };
      // `fireEvent` answers false when a handler prevented the default, which
      // is how a table offers itself as a drop target.
      return fireEvent.dragOver(row, { dataTransfer: transfer });
    };
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Warm-up", "collection")).getByText("Warm-up"));
    await waitFor(() => expect(lastBrowse()).toMatchObject({ collectionId: WARMUP.id }));
    expect(dragOverRow()).toBe(false);

    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    await screen.findByRole("note");
    expect(dragOverRow()).toBe(true);
  });
});

describe("Add to Set… (DEC-104, DEC-058)", () => {
  it("offers the Sets and the folders they are filed in, and nothing else", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(await rowMenu("Close")).getByRole("menuitem", { name: "Add to Set…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to Set" });
    const options = within(dialog).getAllByRole("option");
    expect(options.map((option) => option.textContent?.replace(/\d+$/, "").trim())).toEqual([
      "Gigs",
      "Friday",
      "Warm-up",
      "Ada",
      "Friday copy",
      "Empty",
      "Sunday",
    ]);
    expect(options[0]).toBeDisabled();
    expect(options[1]).toBeEnabled();
  });

  it("adds through the batch and says what it skipped, in the engine's counts", async () => {
    renderScreen();
    await ready();
    await userEvent.click(within(await rowMenu("Close")).getByRole("menuitem", { name: "Add to Set…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to Set" });
    await userEvent.click(within(dialog).getAllByRole("option")[1]!);
    await waitFor(() =>
      expect(bridge.applyBatch).toHaveBeenCalledWith({
        selection: { track_ids: [5] },
        operation: { kind: "add_to_collection", value: FRIDAY.id },
      }),
    );
    expect(
      await screen.findByText("Added 1 track to “Friday” — 1 were already there."),
    ).toBeInTheDocument();
  });

  it("says there is no undo for a Set, not for a Collection", async () => {
    bridge.applyBatch.mockResolvedValue({ applied: { ...ADDED_TO_SET, changed: 40 } });
    renderScreen();
    await ready();
    await userEvent.click(within(await rowMenu("Close")).getByRole("menuitem", { name: "Add to Set…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to Set" });
    await userEvent.click(within(dialog).getAllByRole("option")[1]!);
    expect(
      await screen.findByText(
        "Added 40 tracks to “Friday” — 1 were already there. There is no undo for Set changes.",
      ),
    ).toBeInTheDocument();
  });

  it("is no longer how a Set is reached from Add to Collection", async () => {
    renderScreen();
    await ready();
    await userEvent.click(
      within(await rowMenu("Close")).getByRole("menuitem", { name: "Add to Collection…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Add to Collection" });
    const option = (name: string) =>
      within(dialog)
        .getAllByRole("option")
        .find((item) => item.textContent?.startsWith(name))!;
    expect(option("Friday")).toBeDisabled();
    expect(
      within(dialog)
        .getAllByRole("option")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent?.replace(/\d+$/, "")),
    ).toEqual(["Warm-up"]);
  });
});

describe("New Set from… (DEC-104)", () => {
  it("copies a Collection into a Set beside it, and opens it", async () => {
    renderScreen();
    await ready();
    fireEvent.contextMenu(treeRow("Warm-up", "collection"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "New Set from…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from “Warm-up”" });
    expect(dialog).toHaveTextContent(/in its order and with any repeats/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));

    expect(sets!.createFrom).toHaveBeenCalledWith({
      source: { kind: "collection", id: WARMUP.id },
      name: "Warm-up",
      parent_id: null,
    });
    expect(await screen.findByText("Made the Set “Warm-up” with 3 entries.")).toBeInTheDocument();
    await waitFor(() =>
      expect(lastBrowse()).toMatchObject({
        scope: "collection",
        collectionId: CREATED_FROM_COLLECTION.set.id,
      }),
    );
    expect(screen.queryByRole("dialog", { name: /New Set from/ })).toBeNull();
  });

  it("copies a Rekordbox playlist, into the folder chosen", async () => {
    renderScreen();
    await ready();
    const playlists = screen.getByRole("tree", { name: "Playlists" });
    await userEvent.click(within(playlists).getByRole("button", { name: "Expand SETS" }));
    fireEvent.contextMenu(within(playlists).getByText("Sunday"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "New Set from…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from “Sunday”" });
    expect(dialog).toHaveTextContent(/refreshing from Rekordbox never changes the Set/);
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "In" }), String(GIGS.id));
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(sets!.createFrom).toHaveBeenCalledWith({
      source: { kind: "playlist", id: 2 },
      name: "Sunday",
      parent_id: GIGS.id,
    });
    expect(await screen.findByText("Made the Set “Sunday” with 3 entries.")).toBeInTheDocument();
  });

  it("makes a Set from the selection, in the table's order and not the clicks' (PREP-12)", async () => {
    sets!.createFrom.mockResolvedValue(answered(CREATED_FROM_SELECTION));
    renderScreen();
    await ready();
    // The later row first, then the earlier one added to it.
    fireEvent.click(await screen.findByText("Close"));
    fireEvent.click(screen.getByText("Warm One"), { ctrlKey: true });
    await userEvent.click(
      within(await rowMenu("Close")).getByRole("menuitem", { name: "New Set from the selection…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from the 2 selected tracks" });
    expect(dialog).toHaveTextContent(/in the order the table shows them/);
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("New Set");
    await userEvent.clear(name);
    await userEvent.type(name, "Picked");
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));

    const inTableOrder = TRACKS.filter((row) => row.title === "Warm One" || row.title === "Close").map(
      (row) => row.id,
    );
    expect(sets!.createFrom).toHaveBeenCalledWith({
      source: { kind: "selection", track_ids: inTableOrder },
      name: "Picked",
      parent_id: null,
    });
    expect(await screen.findByText("Made the Set “Picked” with 3 entries.")).toBeInTheDocument();
  });

  it("makes a Set of the one track a menu was opened on", async () => {
    sets!.createFrom.mockResolvedValue(answered(CREATED_FROM_SELECTION));
    renderScreen();
    await ready();
    await userEvent.click(
      within(await rowMenu("Close")).getByRole("menuitem", { name: "New Set from the selection…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from the 1 selected track" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(sets!.createFrom).toHaveBeenCalledWith({
      source: { kind: "selection", track_ids: [5] },
      name: "New Set",
      parent_id: null,
    });
  });

  it("files a selection's Set beside the Collection the table is showing", async () => {
    sets!.createFrom.mockResolvedValue(answered(CREATED_FROM_SELECTION));
    renderScreen();
    await ready();
    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    await screen.findByRole("note");
    await userEvent.click(
      within(await rowMenu("Close")).getByRole("menuitem", { name: "New Set from the selection…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from the 1 selected track" });
    expect(within(dialog).getByRole("combobox", { name: "In" })).toHaveValue(String(GIGS.id));
  });

  it("keeps the dialog open with the engine's refusal", async () => {
    sets!.createFrom.mockResolvedValue({
      value: null,
      refusal: {
        code: "INVALID_REQUEST",
        message: "'Warm-up' holds 1,200 tracks: a Set holds at most 1,000",
        reason: null,
        path: null,
      },
    });
    renderScreen();
    await ready();
    fireEvent.contextMenu(treeRow("Warm-up", "collection"));
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "New Set from…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Set from “Warm-up”" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/a Set holds at most 1,000/);
  });
});

describe("a Set's menu in the tree", () => {
  async function fromMenu(entry: string) {
    fireEvent.contextMenu(treeRow("Friday", "set"));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: entry }));
  }

  it("saves a set list where the dialog chose, and says what was written", async () => {
    renderScreen();
    await ready();
    await fromMenu("Save set list…");
    expect(sets!.chooseSetListDestination).toHaveBeenCalledWith({
      setName: "Friday",
      currentPath: null,
    });
    expect(
      await screen.findByText("Saved “Friday” as a CSV set list — 6 entries, 6 untimed."),
    ).toBeInTheDocument();
  });

  it("copies the set list's text", async () => {
    renderScreen();
    await ready();
    await fromMenu("Copy set list");
    expect(await screen.findByText("Copied the set list for “Friday”.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SET_LIST_TEXT.text);
  });

  it("exports it to Rekordbox with it ticked", async () => {
    renderScreen();
    await ready();
    await fromMenu("Export to Rekordbox…");
    await screen.findByRole("dialog", { name: "Export to Rekordbox" });
    await waitFor(() =>
      expect(bridge.previewRekordboxExport).toHaveBeenCalledWith(
        expect.objectContaining({ collection_ids: [FRIDAY.id] }),
      ),
    );
  });

  it("offers Open in Prepare once there is a Prepare", async () => {
    const onOpenInPrepare = vi.fn();
    renderScreen({ onOpenInPrepare });
    await ready();
    await fromMenu("Open in Prepare");
    expect(onOpenInPrepare).toHaveBeenCalledWith(FRIDAY.id);
  });

  it("says a folder's delete takes its Sets and their plans", async () => {
    renderScreen();
    await ready();
    fireEvent.contextMenu(treeRow("Gigs", "folder"));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Gigs?" });
    expect(dialog).toHaveTextContent(
      "This removes 1 folder and 4 Sets, with 17 track entries filed in them. " +
        "Each Set's chapters, planned times and notes go with it. No tracks are deleted.",
    );
  });
});

describe("the Inspector's Sets", () => {
  it("opens a Set in Prepare once there is a Prepare", async () => {
    const onOpenInPrepare = vi.fn();
    renderScreen({ onOpenInPrepare });
    await ready();
    await userEvent.click(screen.getByText("Warm One"));
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenCalled());
    const sets = await screen.findByRole("region", { name: "Sets" });
    await userEvent.click(within(sets).getByRole("button", { name: "Friday" }));
    expect(onOpenInPrepare).toHaveBeenCalledWith(FRIDAY.id);
  });
});

describe("a Set a refresh emptied (DEC-011, PREP-02)", () => {
  function diff(): RefreshDiff {
    const category = (count = 0) => ({ count, items: [], truncated: false });
    return {
      diff_id: "diff-1",
      xml_path: "C:\\Users\\dj\\Music\\collection.xml",
      is_empty: false,
      contents_compared: true,
      duration_seconds: 0.5,
      computed_at: "2026-09-29T11:00:00Z",
      xml_modified_at: "2026-09-29T10:30:00Z",
      xml_size_bytes: 2048,
      tracks: {
        added: category(),
        changed: category(),
        removed: category(1),
        relinked: category(),
        notable_changed_count: 0,
      },
      playlists: { added: category(), changed: category(), removed: category() },
      references: REFERENCES,
    } as unknown as RefreshDiff;
  }

  it("says the refresh took its tracks, from the Sets the warning named", async () => {
    bridge.browseLibrary.mockImplementation(async (params: Record<string, unknown>) =>
      browse(params, params.scope ? [] : TRACKS),
    );
    bridge.getJobResults
      .mockResolvedValueOnce({ id: "job-preview", state: "succeeded", result: diff() })
      .mockResolvedValue({ id: "job-apply", state: "succeeded", result: null });
    renderScreen();
    await ready();

    await userEvent.click(screen.getByRole("button", { name: /Check for changes/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/1 in 1 Collection, 1 in 1 Set/);
    await userEvent.click(within(dialog).getByLabelText(/I understand/i));
    await userEvent.click(within(dialog).getByRole("button", { name: /Remove 1 track/i }));
    await waitFor(() => expect(bridge.startLibraryRefreshApply).toHaveBeenCalled());

    await userEvent.click(within(treeRow("Friday", "set")).getByText("Friday"));
    expect(await screen.findByText("This Set is empty.")).toBeInTheDocument();
    expect(screen.getByText(/no longer in your Rekordbox export/)).toBeInTheDocument();
    expect(screen.queryByText(/Drop tracks onto it/)).toBeNull();
  });
});

describe("a shell without the Sets bridge", () => {
  it("draws the engine's Sets and offers nothing it cannot do", async () => {
    sets = undefined;
    install();
    renderScreen();
    await ready();
    expect(screen.queryByRole("button", { name: "New Set" })).toBeNull();
    expect(labels(await rowMenu("Close"))).not.toContain("Add to Set…");
    expect(labels(screen.getByRole("menu"))).not.toContain("New Set from the selection…");
    await userEvent.keyboard("{Escape}");
    fireEvent.contextMenu(treeRow("Friday", "set"));
    expect(labels(await screen.findByRole("menu"))).toEqual([
      "Rename",
      "Delete…",
      "Export to Rekordbox…",
    ]);
    await userEvent.keyboard("{Escape}");
    fireEvent.contextMenu(treeRow("Warm-up", "collection"));
    expect(labels(await screen.findByRole("menu"))).not.toContain("New Set from…");
  });

  it("still offers New Set where it can", async () => {
    renderScreen();
    await ready();
    expect(screen.getByRole("button", { name: "New Set" })).toBeInTheDocument();
  });
});
