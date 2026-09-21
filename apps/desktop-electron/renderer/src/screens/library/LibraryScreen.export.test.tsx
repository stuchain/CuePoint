/**
 * Export to Rekordbox, from the Library page (EXPORT-07, DEC-087 as amended).
 *
 * Over a faked bridge with the export's routes:
 *
 * - **Two ways in, one dialog.** The header's "Collection file" menu opens it
 *   with nothing ticked; a Collection's context menu opens it with that node
 *   ticked. Both previews are asked for exactly that.
 * - **Nowhere else.** Export is in neither the selection Actions menu nor the
 *   track context menu — DEC-087's amendment, because both are built from one
 *   list scoped to a track selection the export never reads.
 * - **"Refresh first"** closes the dialog and starts a refresh, and queues no
 *   export behind it (DEC-082).
 * - **The missing-file count** opens Clean's missing-file view (DEC-088).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  CollectionNode,
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackRow,
  RekordboxExportPreviewAnswer,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { ScaleProvider } from "../../tokens/ScaleContext";
import fixture from "./rekordboxExport.fixture.json";
import { LibraryScreen } from "./LibraryScreen";

const SUMMARY: LibrarySummary = {
  track_count: 3,
  playlist_count: 0,
  playlist_entry_count: 0,
  library_empty: false,
  source: {
    xml_path: "C:\\Users\\dj\\Music\\collection.xml",
    imported_at: "2026-09-03T10:00:00Z",
    xml_modified_at: "2026-09-03T09:00:00Z",
    xml_size_bytes: 821,
    track_count: 3,
    playlist_count: 0,
    exists: true,
    changed: false,
  },
};

function track(id: number): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: null,
    genre: "Techno",
    key: "8A",
    bpm: 128,
    year: 2024,
    duration_seconds: 300,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `C:\\music\\${id}.mp3`,
    effective_rating: null,
    rating_source: null,
    favorite: false,
  };
}

const TRACKS = [track(1), track(2), track(3)];

function collection(id: number, name: string, kind: CollectionNode["kind"]): CollectionNode {
  return {
    id,
    parent_id: null,
    kind,
    name,
    position: id,
    depth: 0,
    rules: kind === "smart" ? { match: "all", rules: [{ field: "genre", operator: "is", value: "Techno" }] } : null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: kind === "collection" ? 1 : 0,
    track_count: kind === "collection" ? 1 : 0,
    broken: false,
    problem: null,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };
}

const COLLECTIONS = [collection(7, "Loose", "collection"), collection(8, "Fast", "smart")];

function answer(params: Record<string, unknown>): LibrarySearchResponse {
  return {
    query: "",
    total: TRACKS.length,
    limit: Number(params.limit ?? 100),
    offset: Number(params.offset ?? 0),
    tracks: params.fields === "id" ? [] : TRACKS,
    track_ids: params.fields === "id" ? TRACKS.map((row) => row.id!) : undefined,
    library_empty: false,
    mode: "browse",
    scope: (params.playlistId as number | null) ?? null,
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

const preview = (name: keyof typeof fixture) =>
  fixture[name] as unknown as RekordboxExportPreviewAnswer;

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock | Record<string, Mock>>;

function mock(name: string): Mock {
  return bridge[name] as Mock;
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

beforeEach(() => {
  localStorage.clear();
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue(SUMMARY),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => answer(params)),
    getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: [], total: 0 }),
    getCollections: vi.fn().mockResolvedValue({ collections: COLLECTIONS, total: COLLECTIONS.length }),
    getLibraryFilterFields: vi
      .fn()
      .mockResolvedValue({ fields: [], operators: {}, facetable: [], sortable: [] }),
    getLibraryTrack: vi.fn().mockResolvedValue(null),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
    applyBatch: vi.fn(),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    subscribeJobEvents: vi.fn(() => () => undefined),
    cancelJob: vi.fn(),
    showItemInFolder: vi.fn(),
    openXmlFileDialog: vi.fn().mockResolvedValue({ canceled: true }),
    startLibraryImport: vi.fn(),
    startLibraryRefreshPreview: vi.fn().mockResolvedValue({ job_id: "job-preview" }),
    // The Rekordbox export's routes (EXPORT-06).
    getRekordboxExportHistory: vi.fn().mockResolvedValue(fixture.history_empty),
    previewRekordboxExport: vi.fn(async ({ collection_ids }: { collection_ids: number[] }) =>
      collection_ids.length === 0 ? preview("whole_library") : preview("chosen"),
    ),
    startRekordboxExport: vi.fn(),
    chooseRekordboxExportDestination: vi.fn(),
    player: {
      playView: vi.fn().mockResolvedValue({ ok: true }),
      playQueue: vi.fn().mockResolvedValue({ ok: true }),
      playNext: vi.fn().mockResolvedValue(undefined),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    },
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function renderScreen(props: React.ComponentProps<typeof LibraryScreen> = {}) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <LibraryScreen {...props} />
      </ToastProvider>
    </ScaleProvider>,
  );
}

async function ready() {
  await screen.findByRole("table", { name: "Library tracks" });
  await screen.findByText("Track 1");
  await screen.findByRole("treeitem", { name: /Loose/ });
}

/** The header's "Collection file" menu, then its export entry. */
async function exportFromHeader(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Collection file ▾" }));
  const menu = await screen.findByRole("menu", { name: "Collection file" });
  await user.click(within(menu).getByRole("menuitem", { name: "Export to Rekordbox…" }));
}

const exportDialog = () => screen.findByRole("dialog", { name: "Export to Rekordbox" });

function collectionRow(name: string): HTMLElement {
  const tree = screen.getByRole("tree", { name: "Collections" });
  return within(tree)
    .getAllByRole("treeitem")
    .find((item) => within(item).queryByText(name) !== null)!;
}

describe("the Library header's entry (DEC-087)", () => {
  it("imports from the same menu, as the page always has", async () => {
    const user = userEvent.setup();
    renderScreen();
    await ready();

    await user.click(screen.getByRole("button", { name: "Collection file ▾" }));
    const menu = await screen.findByRole("menu", { name: "Collection file" });
    await user.click(within(menu).getByRole("menuitem", { name: "Import a different collection…" }));
    await waitFor(() => expect(mock("openXmlFileDialog")).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Export to Rekordbox" })).toBeNull();
  });

  it("sits beside import and opens the export with nothing ticked", async () => {
    const user = userEvent.setup();
    renderScreen();
    await ready();

    const header = screen.getByRole("banner");
    const actions = within(header).getAllByRole("button").map((button) => button.textContent);
    // Two, not three: three did not fit the header at the default window size
    // and scale, and each took a line of its own (see LibraryHeader.tsx).
    expect(actions).toEqual(["Check for changes", "Collection file ▾"]);

    // Import and export share one menu: the two ends of the source file.
    const file = within(header).getByRole("button", { name: "Collection file ▾" });
    expect(file).toHaveAttribute("aria-haspopup", "menu");
    await user.click(file);
    const menu = await screen.findByRole("menu", { name: "Collection file" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Import a different collection…",
      "Export to Rekordbox…",
    ]);

    await user.click(within(menu).getByRole("menuitem", { name: "Export to Rekordbox…" }));
    const dialog = await exportDialog();
    await within(dialog).findByText(/in the exported file/);

    expect(within(dialog).getByRole("checkbox", { name: /^Loose/ })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /^Fast/ })).not.toBeChecked();
    expect(mock("previewRekordboxExport")).toHaveBeenLastCalledWith({
      collection_ids: [],
      key_format: "normal",
    });
    expect(mock("startRekordboxExport")).not.toHaveBeenCalled();
  });

  it("says the desktop app is needed, rather than opening a dialog that cannot work", async () => {
    const user = userEvent.setup();
    delete bridge.previewRekordboxExport;
    renderScreen();
    await ready();

    await exportFromHeader(user);
    expect(
      await screen.findByText("Exporting to Rekordbox needs the desktop app with the engine connected."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Export to Rekordbox" })).toBeNull();
  });
});

describe("a Collection's context menu (DEC-087)", () => {
  it.each([
    ["Loose", 7],
    ["Fast", 8],
  ])("opens the export with %s ticked", async (name, id) => {
    const user = userEvent.setup();
    renderScreen();
    await ready();

    fireEvent.contextMenu(collectionRow(name), { clientX: 40, clientY: 200 });
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Export to Rekordbox…" }));

    const dialog = await exportDialog();
    await within(dialog).findByText(/in the exported file/);
    expect(within(dialog).getByRole("checkbox", { name: new RegExp(`^${name}`) })).toBeChecked();
    expect(mock("previewRekordboxExport")).toHaveBeenLastCalledWith({
      collection_ids: [id],
      key_format: "normal",
    });
  });

  it("lands in the same dialog the header opens", async () => {
    const user = userEvent.setup();
    renderScreen();
    await ready();

    fireEvent.contextMenu(collectionRow("Loose"));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Export to Rekordbox…" }));
    const fromMenu = await exportDialog();
    const sections = within(fromMenu)
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-label"));
    await user.click(within(fromMenu).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await exportFromHeader(user);
    const fromHeader = await exportDialog();
    await within(fromHeader).findByText(/in the exported file/);
    expect(within(fromHeader).getByRole("checkbox", { name: /^Loose/ })).not.toBeChecked();
    expect(sections[0]).toBe("Destination");
    expect(within(fromHeader).getAllByRole("region")[0]).toHaveAttribute("aria-label", "Destination");
  });
});

describe("where export is not (DEC-087's amendment)", () => {
  it("is not in the track context menu", async () => {
    renderScreen();
    await ready();

    const row = screen.getByText("Track 2").closest("[role=row]")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    const menu = await screen.findByRole("menu");
    const labels = within(menu).getAllByRole("menuitem").map((item) => item.textContent ?? "");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => /rekordbox|export/i.test(label))).toBe(false);
  });

  it("is not in the selection Actions menu", async () => {
    const user = userEvent.setup();
    renderScreen();
    await ready();

    await user.click(screen.getByText("Track 1"));
    await user.click(screen.getByRole("button", { name: "Actions…" }));
    const menu = await screen.findByRole("menu");
    const labels = within(menu).getAllByRole("menuitem").map((item) => item.textContent ?? "");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => /rekordbox|export/i.test(label))).toBe(false);
  });
});

describe("what the dialog hands back to the page", () => {
  it("Refresh first closes the dialog and starts a refresh, queueing no export", async () => {
    const user = userEvent.setup();
    mock("previewRekordboxExport").mockResolvedValue(preview("stale"));
    renderScreen();
    await ready();

    await exportFromHeader(user);
    const dialog = await exportDialog();
    await user.click(await within(dialog).findByRole("button", { name: "Refresh first" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Export to Rekordbox" })).toBeNull());
    await waitFor(() => expect(mock("startLibraryRefreshPreview")).toHaveBeenCalledTimes(1));
    expect(mock("startRekordboxExport")).not.toHaveBeenCalled();
  });

  it("the missing-file count opens Clean's missing-file view", async () => {
    const user = userEvent.setup();
    const onOpenMissingFiles = vi.fn();
    renderScreen({ onOpenMissingFiles });
    await ready();

    fireEvent.contextMenu(collectionRow("Loose"));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Export to Rekordbox…" }));
    const dialog = await exportDialog();
    await user.click(await within(dialog).findByRole("button", { name: "Show missing files" }));

    expect(onOpenMissingFiles).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Export to Rekordbox" })).toBeNull());
  });

  it("a source that is gone offers importing again, from the page's own import", async () => {
    const user = userEvent.setup();
    mock("previewRekordboxExport").mockResolvedValue(preview("source_missing"));
    renderScreen();
    await ready();

    await exportFromHeader(user);
    const dialog = await exportDialog();
    await user.click(await within(dialog).findByRole("button", { name: "Import a different collection…" }));

    await waitFor(() => expect(mock("openXmlFileDialog")).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: "Export to Rekordbox" })).toBeNull();
  });
});
