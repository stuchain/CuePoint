/**
 * The Prepare page (PREP-10, DEC-104, DEC-108, DEC-112).
 *
 * Over the engine's own answers (`prepare.fixture.json`): Friday, six entries
 * in three named chapters with track 1 played twice; Plain, one unnamed
 * chapter; the answers to each edit and the refusals the page acts on.
 *
 * - With no Sets the page says what a Set is and makes one, or one from a
 *   source; `/prepare` reopens the last Set, or the first.
 * - The Set: its header, its own notes (PREP-12), its heading rows (none for
 *   one unnamed chapter), its entries with their warnings.
 * - Each edit is one engine call: a drag, a drop on a heading, the entry and
 *   heading menus, the chapter dialog, the Inspector's "In this Set" zone and
 *   "Acknowledge".
 * - "Play Set" and a double-click hand the entries, repeat included, to
 *   `playQueue` (DEC-108).
 * - A Set that is gone is said and left; set lists and the export are offered.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { CollectionNode, LibraryTrackDetail, SetRefusal } from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { TRACK_DETAIL } from "../library/librarySets.testFixture";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { toQueueItem } from "../library/useLibraryPlayback";
import { cleanSectionState } from "../clean/cleanLink";
import { DOUBLE_CLICK_MS } from "./prepareEditingContext";
import { PrepareScreen, SET_ENTRY_MIME, SET_GONE_LINE } from "./PrepareScreen";
import { EDITS, FRIDAY, IDS, PLAIN, REFUSALS, TREE, answered, refused } from "./prepare.testFixture";
import css from "./prepare.css?raw";
import { PREPARE_TABLE_LAYOUT_KEY } from "./prepareColumns";
import { SETS_NEED_DESKTOP, WHAT_A_SET_IS } from "./prepareFormat";
import { LAST_SET_STORAGE_KEY, PREPARE_PATH, PREPARE_SET_ROUTE, preparePath } from "./prepareLink";

/** What a button draws: the name of its icon, else its words. */
const markOf = (b: HTMLElement): string | null => b.querySelector("[data-icon]")?.getAttribute("data-icon") ?? b.textContent;

const LOADED = { timeout: 3000 };
const [E1, E2, E3, E4, , E5] = IDS.friday_entries;

type Fn = ReturnType<typeof vi.fn>;
let sets: Record<string, Fn>;
let bridge: Record<string, unknown>;
let player: Record<string, Fn>;

const WHOLE: Record<number, typeof FRIDAY> = { [IDS.friday]: FRIDAY, [IDS.plain]: PLAIN, [IDS.scratch]: FRIDAY };

function read(part: "plan" | "entries" | "analysis") {
  return vi.fn(async ({ set_id }: { set_id: number }) =>
    WHOLE[set_id] ? answered(WHOLE[set_id][part]) : refused(REFUSALS.setGone),
  );
}

/** A track's Inspector read: the Library fixture's, with this track in it. */
function detailOf(trackId: number): LibraryTrackDetail {
  const entry = FRIDAY.entries.entries.find((candidate) => candidate.track_id === trackId)
    ?? PLAIN.entries.entries.find((candidate) => candidate.track_id === trackId);
  return { ...TRACK_DETAIL, track: entry!.track, collections: [] };
}

function install(tree: CollectionNode[] = TREE) {
  sets = {
    plan: read("plan"),
    entries: read("entries"),
    analysis: read("analysis"),
    // What fits at a gap: nothing, in PREP-10's tests; PREP-11's are the panel's.
    suggestions: vi.fn(async ({ set_id, before_entry_id, after_entry_id }: Record<string, number | null>) =>
      answered({
        set_id: set_id as number,
        before_entry_id: before_entry_id ?? null,
        after_entry_id: after_entry_id ?? null,
        sides: after_entry_id ? ["before", "after"] : ["before"],
        chapter_id: 0,
        bpm_range: null,
        notation: "camelot",
        unused: {},
        considered: 0,
        duplicates_excluded: 0,
        index_current: true,
        no_fit: null,
        suggestions: [],
      }),
    ),
    setListText: vi.fn().mockResolvedValue(answered({ set_id: IDS.friday, text: "Friday\n" })),
    create: vi.fn(async ({ name }: { name: string }) =>
      answered({ set: { ...TREE[1], id: 50, name } }),
    ),
    createFrom: vi.fn(async () =>
      answered({ set: { ...TREE[1], id: 51, name: "Sunday" }, source: { kind: "playlist", id: 7, name: "Sunday" }, track_count: 3 }),
    ),
    duplicate: vi.fn(),
    setNotes: vi.fn(),
    createChapter: vi.fn(),
    updateChapter: vi.fn().mockResolvedValue(answered(EDITS.chapterUpdated)),
    moveChapter: vi.fn().mockResolvedValue(answered(EDITS.chapterMoved)),
    deleteChapter: vi.fn().mockResolvedValue(answered(EDITS.chapterDeleted)),
    splitChapter: vi.fn().mockResolvedValue(answered(EDITS.split)),
    moveEntry: vi.fn().mockResolvedValue(answered(EDITS.moved)),
    setEntryTimes: vi.fn().mockResolvedValue(answered(EDITS.times)),
    setEntryNote: vi.fn().mockResolvedValue(answered(EDITS.note)),
    acknowledge: vi.fn().mockResolvedValue(answered(EDITS.acknowledged)),
    unacknowledge: vi.fn().mockResolvedValue(answered(EDITS.unacknowledged)),
    saveSetList: vi.fn(),
    chooseSetListDestination: vi.fn().mockResolvedValue({ canceled: true }),
  };
  player = {
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue(undefined),
  };
  bridge = {
    sets,
    player,
    getCollections: vi.fn(async () => ({ collections: tree, total: tree.length })),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detailOf(trackId)),
    getLibraryPlaylists: vi.fn(async () => ({
      playlists: [
        { id: 6, parent_id: null, name: "SETS", kind: "folder", depth: 0, position: 0, path: "SETS", track_count: 0 },
        { id: 7, parent_id: 6, name: "Sunday", kind: "playlist", depth: 1, position: 0, path: "SETS/Sunday", track_count: 3 },
      ],
      total: 2,
    })),
    renameCollection: vi.fn(async ({ id, name }: { id: number; name: string }) => ({
      collection: { ...TREE[1], id, name },
    })),
    deleteCollection: vi.fn(async () => ({ removed: { collections: 1, entries: 6 } })),
    insertTrackInCollection: vi.fn().mockResolvedValue(EDITS.repeatInserted),
    removeCollectionEntries: vi.fn().mockResolvedValue(EDITS.removed),
    startFileCheck: vi.fn().mockResolvedValue({ job_id: "check-1", id: "check-1", state: "queued", tracks: 5 }),
    getJob: vi.fn().mockResolvedValue({ id: "check-1", state: "succeeded" }),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** Where "Missing files" lands: it shows the location state it was handed. */
function CleanProbe() {
  return <p data-testid="clean-state">{JSON.stringify(useLocation().state)}</p>;
}

function renderAt(path: string) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={PREPARE_PATH} element={<PrepareScreen />} />
              <Route path={PREPARE_SET_ROUTE} element={<PrepareScreen />} />
              <Route path="/clean" element={<CleanProbe />} />
              <Route path="*" element={<p>elsewhere</p>} />
            </Routes>
            <Where />
          </MemoryRouter>
          <aside aria-label="Inspector">
            <InspectorSlotOutlet />
          </aside>
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>,
  );
}

function where(): string {
  return screen.getByTestId("where").textContent ?? "";
}

function table() {
  return screen.getByRole("grid", { name: "Set entries" });
}

function rows(): HTMLElement[] {
  return within(table())
    .getAllByRole("row")
    .filter((row) => row.dataset.index !== undefined);
}

function rowAt(index: number): HTMLElement {
  return rows().find((row) => row.dataset.index === String(index))!;
}

function inspector() {
  return screen.getByRole("complementary", { name: "Inspector" });
}

/**
 * A ticked item of the View menu (C126): the menu is opened if it is not open, and stays open
 * when the item is chosen, so the next one is found in the same menu.
 */
function viewItem(name: string): HTMLElement {
  if (!screen.queryByRole("menu")) fireEvent.click(screen.getByRole("button", { name: "View" }));
  return within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name });
}

/** Turns the Mix in and Mix out columns on: View, then the ticked Mix in and Mix out. */
function showTimes() {
  fireEvent.click(viewItem("Mix-in and mix-out columns"));
}

/** The names of the columns the table draws, left to right (not the reserved end column the buttons sit on, M192). */
function headers(): string[] {
  return within(table())
    .getAllByRole("columnheader")
    .filter((header) => header.getAttribute("data-column") !== "entry_buttons")
    .map((header) => header.textContent?.trim() ?? "");
}

/**
 * A saved layout in the new default order with the four default-hidden columns
 * (Mix in, Mix out, Transition, Note) shown, so a test sees the real order.
 */
function showTimesInStorage() {
  const shown = (id: string, width: number) => ({ id, width, hidden: false });
  localStorage.setItem(
    PREPARE_TABLE_LAYOUT_KEY,
    JSON.stringify([
      shown("position", 48),
      shown("title", 170),
      shown("artist", 150),
      shown("key", 60),
      shown("bpm", 72),
      shown("planned", 84),
      shown("in", 60),
      shown("out", 60),
      shown("fit", 48),
      shown("starts_at", 72),
      shown("transition", 160),
      shown("note", 180),
    ]),
  );
}

async function opened(name = "Friday") {
  // The Set's name is the page title (D21, M201).
  await screen.findByRole("heading", { level: 1, name }, LOADED);
  await waitFor(() => expect(rows().length).toBeGreaterThan(0), LOADED);
}

function transfer(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    dropEffect: "none",
    effectAllowed: "none",
    get types() {
      return Object.keys(data);
    },
    getData: (format: string) => data[format] ?? "",
    setData: (format: string, value: string) => {
      data[format] = value;
    },
  } as unknown as DataTransfer;
}

/** A drag event with a pointer height: jsdom rects are zero, so 0 is a row's top half. */
function drag(type: "dragover" | "drop", row: HTMLElement, dataTransfer: DataTransfer, clientY = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(row, event);
}

/** Opens the menu of the page title, the Set's name: the Sets, rename, notes, new, delete. */
function openSetMenu(name = "Friday") {
  fireEvent.click(within(screen.getByRole("heading", { level: 1 })).getByRole("button", { name }));
}

/** Opens the header's Export menu: the file for Rekordbox, the set list. */
function openExportMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
}

/** An entry's menu opens once the track's credits are read, so it is awaited. */
async function menuItem(name: string | RegExp) {
  return within(await screen.findByRole("menu")).getByRole("menuitem", { name });
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 800 });
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

describe("with no Sets", () => {
  const noSets = TREE.filter((node) => node.kind !== "set");

  it("says what a Set is and offers to make one", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    expect(await screen.findByText(new RegExp(`^${WHAT_A_SET_IS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), {}, LOADED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Set…" })).toBeInTheDocument();
    // M350: the copy from a list is a link in the sentence, not a second button in the row.
    const fromList = screen.getByRole("button", { name: "New Set from a list…" });
    expect(fromList.closest(".cp-empty-state__description")).not.toBeNull();
  });

  it("is the shared empty state, with no frame and no card title, and one violet button", async () => {
    install(noSets);
    const { container } = renderAt(PREPARE_PATH);
    await screen.findByText("No Sets yet", {}, LOADED);
    expect(screen.queryByText("Prepare a Set")).toBeNull();
    expect(container.querySelector(".cp-empty-state")).not.toBeNull();
    expect(container.querySelector(".cp-panel")).toBeNull();
    // M350: one secondary New Set, no violet button.
    expect(screen.getByRole("button", { name: "New Set…" }).className).toMatch(/secondary/);
    expect(container.querySelector(".cp-empty-state .cp-btn--primary")).toBeNull();
  });

  it("asks for the name first, and makes nothing until Create (D21 A, M408)", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set…" }, LOADED));
    const dialog = await screen.findByRole("dialog", { name: "New Set" });
    expect(sets.create).not.toHaveBeenCalled();
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("New Set");
    fireEvent.change(name, { target: { value: "Saturday" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(where()).toBe(preparePath(50)), LOADED);
    expect(sets.create).toHaveBeenCalledWith({ name: "Saturday", parent_id: null });
  });

  it("makes nothing when the name dialog is cancelled", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set…" }, LOADED));
    const dialog = await screen.findByRole("dialog", { name: "New Set" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New Set" })).toBeNull());
    expect(sets.create).not.toHaveBeenCalled();
    expect(where()).toBe(PREPARE_PATH);
  });

  it("says why the engine refused a new Set, and stays where it was", async () => {
    install(noSets);
    sets.create.mockResolvedValue(refused({ code: "INVALID_REQUEST", message: "Too deep", reason: null, path: null }));
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set…" }, LOADED));
    const dialog = await screen.findByRole("dialog", { name: "New Set" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await within(dialog).findByText(/Too deep/)).toBeInTheDocument();
    expect(where()).toBe(PREPARE_PATH);
  });

  it("copies a Set from a list in one dialog, with the source, the name and Create, then opens it", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set from a list…" }, LOADED));
    const dialog = await screen.findByRole("dialog", { name: "New Set from a list" });
    // No Collection in this tree: the Rekordbox playlist, not its folder.
    const select = within(dialog).getByLabelText("Copy the tracks of") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Sunday"]);
    // The name starts as the source's, and the sentence says what a copy means.
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Sunday");
    expect(within(dialog).getByText(/Rekordbox playlist “Sunday”/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Continue/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(where()).toBe(preparePath(51)), LOADED);
    expect(sets.createFrom).toHaveBeenCalledWith({
      source: { kind: "playlist", id: 7 },
      name: "Sunday",
      parent_id: null,
    });
    expect(await screen.findByText("Made the Set “Sunday” with 3 tracks.")).toBeInTheDocument();
  });

  it("says there is nothing to copy when there is nothing", async () => {
    install(noSets);
    (bridge.getLibraryPlaylists as Fn).mockResolvedValue({ playlists: [], total: 0 });
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set from a list…" }, LOADED));
    const dialog = await screen.findByRole("dialog", { name: "New Set from a list" });
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();
  });
});

describe("the Set's name, the page title with its menu (D21, M201, M408)", () => {
  it("is the title, and its menu holds the Sets, Rename, Notes, New Set, New Set from a list and Delete", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const title = within(screen.getByRole("heading", { level: 1 })).getByRole("button", { name: "Friday" });
    expect(title).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(title);
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Friday",
      "Scratch",
      "Plain",
      "Rename…",
      "Notes (1)…",
      // M408: New Set asks for the name first, so it ends in "…" (D33).
      "New Set…",
      "New Set from a list…",
      "Delete…",
    ]);
  });

  it("opens another Set from the menu", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("Plain"));
    await waitFor(() => expect(where()).toBe(preparePath(IDS.plain)));
    await opened("Plain");
  });

  it("renames the Set in the dialog a new Set shares, and says Save", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("Rename…"));
    const dialog = await screen.findByRole("dialog", { name: "Rename the Set" });
    const field = within(dialog).getByLabelText("Name");
    expect(field).toHaveValue("Friday");
    fireEvent.change(field, { target: { value: "Friday late" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bridge.renameCollection).toHaveBeenCalledWith({ id: IDS.friday, name: "Friday late" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses a Set with no name before asking the engine", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("Rename…"));
    const dialog = await screen.findByRole("dialog", { name: "Rename the Set" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText(/Give it a name/)).toBeInTheDocument();
    expect(bridge.renameCollection).not.toHaveBeenCalled();
  });

  it("asks before deleting the Set, in the one wording every delete uses, then leaves it", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    const item = await menuItem("Delete…");
    fireEvent.click(item);
    const dialog = await screen.findByRole("dialog", { name: "Delete “Friday”?" });
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(bridge.deleteCollection).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Set" }));
    await waitFor(() => expect(bridge.deleteCollection).toHaveBeenCalledWith({ id: IDS.friday }));
    expect(await screen.findByText("Deleted the Set “Friday”")).toBeInTheDocument();
  });

  it("makes a new Set from its menu, once it is named (M408)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("New Set…"));
    const dialog = await screen.findByRole("dialog", { name: "New Set" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(where()).toBe(preparePath(50)), LOADED);
    expect(sets.create).toHaveBeenCalledWith({ name: "New Set", parent_id: null });
  });

  it("copies a Set from a list, from the same menu", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("New Set from a list…"));
    const dialog = await screen.findByRole("dialog", { name: "New Set from a list" });
    expect(within(dialog).getByText("Copy the tracks of")).toBeInTheDocument();
  });
});

describe("the header's facts and buttons (PRP-3, PRP-6, PRP-10)", () => {
  it("opens Clean's Missing files from the files fact, and no longer checks files itself", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(within(factsLine()).getByRole("button", { name: "Missing files" }));
    await waitFor(() => expect(where()).toBe("/clean"));
    expect(JSON.parse(screen.getByTestId("clean-state").textContent ?? "null")).toEqual(
      JSON.parse(JSON.stringify(cleanSectionState("missing"))),
    );
    expect(bridge.startFileCheck).not.toHaveBeenCalled();
  });

  it("says no times are planned until one is typed", async () => {
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    const facts = document.querySelector(".prepare-header__facts") as HTMLElement;
    // No "0:00 planned" to read as a plan: the count's title says no times are planned yet.
    expect(facts).not.toHaveTextContent("planned");
    expect(within(facts).getByText(/ tracks?$/)).toHaveAttribute(
      "title",
      expect.stringMatching(/^No times planned yet\. Select a track, then type its mix-in and mix-out times in the table/),
    );
  });

  it("titles the page with the Set's name, then View, Export as the main action and a grey Play Set (D21, M201, M326)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const header = screen.getByRole("heading", { level: 1 }).closest("header") as HTMLElement;
    // The Set's name is the title and the switcher: one button inside the heading.
    expect(header).toHaveTextContent(/^Friday/);
    expect(within(screen.getByRole("heading", { level: 1 })).getAllByRole("button")).toHaveLength(1);
    const buttons = within(header).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Friday",
      "View",
      "Export",
      "Play Set",
      "5 warnings",
      "Missing files",
    ]);
    // Export is the one violet button, the main action; Play Set is grey (M326).
    expect(buttons[2]).toHaveClass("cp-btn--primary");
    expect(header.querySelectorAll(".cp-btn--primary")).toHaveLength(1);
    expect(buttons[3]).toHaveClass("cp-btn--secondary");
    const actions = header.querySelector(".cp-screen-header__actions")!;
    expect(actions).toContainElement(buttons[2]);
    expect(actions).toContainElement(buttons[3]);
    for (const name of ["View", "Export"]) {
      const button = within(header).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-haspopup", "menu");
    }
  });

  it("holds Export to Rekordbox, Save set list and Copy set list in one Export menu", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Export to Rekordbox…",
      "Save set list…",
      "Copy set list",
    ]);
  });

  it("has no Match tracks… and no Check now, and no Notes or New Set button of its own", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    for (const name of [/Match tracks/, /Check now/, /^Notes/, /^New Set/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("while a Set is read (PRP-12)", () => {
  it("says it with the shared Loading, not inside a panel of its own", async () => {
    sets.plan.mockImplementation(() => new Promise(() => undefined));
    renderAt(preparePath(IDS.friday));
    const loading = await screen.findByText("Loading the Set…", {}, LOADED);
    // The shared Loading, not a Panel of its own (M351).
    expect(loading.closest(".cp-panel")).toBeNull();
    expect(loading.closest("[role='status']")).not.toBeNull();
  });
});

describe("the selected track (PAGES-03)", () => {
  afterEach(() => setSelectedTrack(null));

  it("is the selected entry's track, with its key, and goes with the selection and the page", async () => {
    const view = renderAt(preparePath(IDS.friday));
    await opened();
    expect(getSelectedTrack()).toBeNull();
    fireEvent.click(rowAt(2));
    const entry = FRIDAY.entries.entries.find((candidate) => candidate.entry_id === E2)!;
    await waitFor(() =>
      expect(getSelectedTrack()).toEqual({ id: entry.track_id, key: entry.track.effective_key ?? null }),
    );
    fireEvent.click(rowAt(0));
    view.unmount();
    expect(getSelectedTrack()).toBeNull();
  });
});

describe("which Set opens", () => {
  it("opens the first Set in the tree when none was open before", async () => {
    renderAt(PREPARE_PATH);
    await waitFor(() => expect(where()).toBe(preparePath(IDS.friday)), LOADED);
    await opened();
    expect(localStorage.getItem(LAST_SET_STORAGE_KEY)).toBe(String(IDS.friday));
  });

  it("reopens the Set last open (DEC-027)", async () => {
    localStorage.setItem(LAST_SET_STORAGE_KEY, String(IDS.plain));
    renderAt(PREPARE_PATH);
    await waitFor(() => expect(where()).toBe(preparePath(IDS.plain)), LOADED);
    await opened("Plain");
  });

  it("says a Set that is gone is gone, forgets it and opens another", async () => {
    localStorage.setItem(LAST_SET_STORAGE_KEY, "999");
    renderAt(preparePath(999));
    expect(await screen.findByText(SET_GONE_LINE, {}, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe(preparePath(IDS.friday)), LOADED);
    await opened();
  });

  it("says an address that names no Set names none", async () => {
    renderAt("/prepare/friday");
    expect(await screen.findByText("This address names no Set", {}, LOADED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open your Sets" }));
    await waitFor(() => expect(where()).toBe(preparePath(IDS.friday)), LOADED);
  });

  it("says what went wrong reading a Set, and tries again", async () => {
    sets.plan.mockRejectedValueOnce(new Error("The engine is not running"));
    renderAt(preparePath(IDS.friday));
    expect(await screen.findByText("The engine is not running", {}, LOADED)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await opened();
  });

  it("is unavailable, and says so, in a shell without the Sets bridge", async () => {
    delete bridge.sets;
    renderAt(PREPARE_PATH);
    expect(await screen.findByText(SETS_NEED_DESKTOP)).toBeInTheDocument();
  });
});

describe("the Set", () => {
  it("names it, and says how long it is planned to run and what its checks found", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const facts = document.querySelector(".prepare-header__facts") as HTMLElement;
    expect(facts).toHaveTextContent("6 tracks · 0:09:00 · 5 warnings");
    // What asks something of the person sits beside the facts, never inside them (they give way).
    expect(facts).toHaveTextContent("Files not checked · Missing files");
    // Each short fact carries its sentence: the untimed and the accepted are in their titles.
    expect(within(facts).getByText("0:09:00")).toHaveAttribute(
      "title",
      "Planned length of the Set. 4 without times.",
    );
    // The warnings' count is a button: it goes to the first one (M199).
    expect(within(facts).getByRole("button", { name: "5 warnings" })).toHaveAttribute(
      "title",
      "2 tempo jumps, 1 key clash, 1 chapter over its target, 1 chapter outside its BPM range, 1 marked OK",
    );
    expect(facts).not.toHaveTextContent("without times");
    expect(facts).not.toHaveTextContent("marked OK");
    expect(within(facts).getByRole("button", { name: "Missing files" })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Files in this Set have never been checked/),
    );
    // The page's title is the Set open.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Friday");
    // The lanes, the transition strip and the times share one link, so the line stays one line;
    // the columns are the Set table's corner button (R4-2).
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitemcheckbox");
    expect(items.map((item) => item.textContent)).toEqual([
      "Tempo and key lane",
      "Transition strip",
      "Mix-in and mix-out columns",
    ]);
    // Ticked on and off, not "Show" and "Hide" (C126); the strips are off in a fresh layout, and the times item stands for both columns (C246).
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "false", "mixed"]);
  });

  it("shows the Set's own notes and edits them in one write (PREP-12)", async () => {
    sets.setNotes.mockResolvedValue(answered(EDITS.setNotes));
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    const item = await menuItem("Notes (1)…");
    // The notes themselves are the entry's title, so a glance does not open a dialog.
    expect(item).toHaveAttribute("title", "The Loft, 23:00 to 01:00");
    fireEvent.click(item);
    const dialog = await screen.findByRole("dialog", { name: "Notes for “Friday”" });
    const field = within(dialog).getByLabelText("Notes");
    expect(field).toHaveValue("The Loft, 23:00 to 01:00");

    fireEvent.change(field, { target: { value: "  The Loft, 23:00 to 01:30  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sets.setNotes).toHaveBeenCalledWith({ set_id: IDS.friday, notes: "The Loft, 23:00 to 01:30" });
    // Every accepted edit re-reads the Set.
    await waitFor(() => expect(sets.plan.mock.calls.length).toBeGreaterThan(1));
  });

  it("clears the notes with a blank field, and keeps the dialog open with a refusal", async () => {
    sets.setNotes.mockResolvedValueOnce(
      refused({ code: "INVALID_REQUEST", message: "A note may be at most 10000 characters, got 10001", reason: null, path: null }),
    );
    renderAt(preparePath(IDS.friday));
    await opened();
    openSetMenu();
    fireEvent.click(await menuItem("Notes (1)…"));
    const dialog = await screen.findByRole("dialog", { name: "Notes for “Friday”" });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(/at most 10000 characters/)).toBeInTheDocument();
    expect(sets.setNotes).toHaveBeenCalledWith({ set_id: IDS.friday, notes: null });
  });

  it("says what the notes are for when there are none", async () => {
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    openSetMenu("Plain");
    expect(await menuItem("Notes…")).toHaveAttribute(
      "title",
      expect.stringMatching(/^Notes for the whole Set/),
    );
  });

  it("draws each chapter's heading as a row, with its time, target and range", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(rows()).toHaveLength(9);
    const headings = rows().filter((row) => row.classList.contains("prepare-heading"));
    expect(headings.map((row) => row.querySelector(".prepare-heading__name")?.textContent)).toEqual([
      "Warm-up",
      "Peak",
      "Close",
    ]);
    const warmUp = headings[0];
    expect(warmUp.querySelector('[data-column="planned"]')).toHaveTextContent("9:00 of 8:00");
    expect(warmUp.querySelector('[data-column="bpm"]')).toHaveTextContent("120–123");
    expect(warmUp.querySelector('[data-column="transition"]')).toHaveTextContent(
      "Over target · Outside BPM range",
    );
    expect(warmUp.querySelector('[data-column="note"]')).toHaveTextContent("Keep it low");
    expect(warmUp).toHaveAttribute("draggable", "false");
  });

  it("draws each entry's plan, repeat and transition", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.friday));
    await opened();
    const first = rowAt(1);
    expect(first.querySelector('[data-column="in"]')).toHaveTextContent("0:30");
    expect(first.querySelector('[data-column="out"]')).toHaveTextContent("4:30");
    expect(first.querySelector('[data-column="planned"]')).toHaveTextContent("4:00");
    expect(first.querySelector('[data-column="position"]')).toHaveTextContent("1");
    expect(first.querySelector('[data-column="position"] [data-icon="repeat-after"]')).not.toBeNull();
    const peakTwo = rowAt(5);
    expect(peakTwo.querySelector('[data-column="transition"]')).toHaveTextContent("+9.4% tempo");
    // The warning mark is drawn, not typed (C138).
    expect(peakTwo.querySelector('[data-column="transition"] [data-icon="warning"]')).not.toBeNull();
    expect(rowAt(4).querySelector('[data-column="note"]')).toHaveTextContent("Let the break run");
    expect(peakTwo).toHaveAttribute("draggable", "true");
  });

  it("draws one unnamed chapter as a plain list, and what a transition cannot compare", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    expect(rows()).toHaveLength(2);
    expect(rows().some((row) => row.classList.contains("prepare-heading"))).toBe(false);
    expect(rowAt(1).querySelector('[data-column="transition"]')).toHaveTextContent("No BPM");
  });

  it("reads the Set again when the library changes anywhere", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const before = sets.plan.mock.calls.length;
    act(() => announceLibraryChange());
    await waitFor(() => expect(sets.plan.mock.calls.length).toBe(before + 1));
  });
});

describe("playing (DEC-108)", () => {
  const queue = () => FRIDAY.entries.entries.map((entry) => toQueueItem(entry.track));

  it("plays the Set from its start, the repeat in its place", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Play Set" }));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledWith(queue(), 0));
    const titles = (player.playQueue.mock.calls[0][0] as { title: string }[]).map((item) => item.title);
    expect(titles).toEqual(["Warm One", "Warm Two", "Peak One", "Peak Two", "Warm One", "Close"]);
  });

  it("plays the Set from the entry double-clicked, the repeat's own place", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.doubleClick(rowAt(7));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledWith(queue(), 4));
  });

  it("opens a chapter's dialog on a heading's double-click, and plays nothing", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.doubleClick(rowAt(3));
    expect(await screen.findByRole("dialog", { name: "Edit chapter “Peak”" })).toBeInTheDocument();
    expect(player.playQueue).not.toHaveBeenCalled();
  });

  it("says what the player refused", async () => {
    player.playQueue.mockResolvedValue({ ok: false, error: "No audio device" });
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Play Set" }));
    expect(await screen.findByText("No audio device")).toBeInTheDocument();
  });

  it("queues entries without interrupting", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Play next"));
    await waitFor(() => expect(player.playNext).toHaveBeenCalledWith([toQueueItem(FRIDAY.entries.entries[1].track)]));
    expect(await screen.findByText("1 track queued to play next")).toBeInTheDocument();
  });
});

describe("dragging an entry", () => {
  it("carries the entry, not only the track, and never a heading", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const dataTransfer = transfer();
    fireEvent.dragStart(rowAt(8), { dataTransfer });
    expect(dataTransfer.getData(SET_ENTRY_MIME)).toBe(String(E5));
  });

  it("dropped on a heading goes to that chapter's start", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const dataTransfer = transfer({ [SET_ENTRY_MIME]: String(E5) });
    drag("dragover", rowAt(3), dataTransfer, 5);
    drag("drop", rowAt(3), dataTransfer, 5);
    await waitFor(() =>
      expect(sets.moveEntry).toHaveBeenCalledWith({ entry_id: E5, position: 2, chapter_id: 2 }),
    );
    // Re-read after the move.
    await waitFor(() => expect(sets.plan.mock.calls.length).toBeGreaterThan(1));
  });

  it("dropped below a chapter's last entry stays in that chapter", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const dataTransfer = transfer({ [SET_ENTRY_MIME]: String(E1) });
    drag("dragover", rowAt(2), dataTransfer, 5);
    drag("drop", rowAt(2), dataTransfer, 5);
    await waitFor(() =>
      expect(sets.moveEntry).toHaveBeenCalledWith({ entry_id: E1, position: 1, chapter_id: 1 }),
    );
  });

  it("ignores a drag that is neither an entry nor tracks, and a drop where it already is", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // Tracks are PREP-11's to drop here (PrepareSource.test.tsx); text is nobody's.
    const text = transfer({ "text/plain": "Warm One" });
    drag("dragover", rowAt(2), text, 0);
    expect(rowAt(2)).not.toHaveAttribute("data-drop");
    const same = transfer({ [SET_ENTRY_MIME]: String(E2) });
    drag("dragover", rowAt(2), same, 0);
    drag("drop", rowAt(2), same, 0);
    expect(sets.moveEntry).not.toHaveBeenCalled();
  });

  it("says why the engine refused a move, and re-reads when the entry had gone", async () => {
    const gone: SetRefusal = { code: "SET_NOT_FOUND", message: "There is no track 5", reason: "entry", path: null };
    sets.moveEntry.mockResolvedValue(refused(gone));
    renderAt(preparePath(IDS.friday));
    await opened();
    const before = sets.plan.mock.calls.length;
    const dataTransfer = transfer({ [SET_ENTRY_MIME]: String(E5) });
    drag("dragover", rowAt(3), dataTransfer, 0);
    drag("drop", rowAt(3), dataTransfer, 0);
    expect(await screen.findByText("There is no track 5")).toBeInTheDocument();
    await waitFor(() => expect(sets.plan.mock.calls.length).toBe(before + 1));
  });
});

describe("an entry's menu", () => {
  it("starts a chapter at an entry, and not where one starts", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(4));
    expect(await menuItem("New chapter")).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("New chapter"));
    await waitFor(() => expect(sets.splitChapter).toHaveBeenCalledWith({ entry_id: E2 }));
  });

  it("says the engine's words when it refuses a new chapter", async () => {
    sets.splitChapter.mockResolvedValue(refused(REFUSALS.splitAtStart));
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(5));
    fireEvent.click(await menuItem("New chapter"));
    expect(await screen.findByText(REFUSALS.splitAtStart.message)).toBeInTheDocument();
  });

  it("inserts a repeat straight after the entry, in its chapter", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Repeat"));
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: IDS.friday,
        track_id: FRIDAY.entries.entries[1].track_id,
        position: 2,
        chapter_id: 1,
      }),
    );
  });

  it("removes the entry, and says so", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove from Set"));
    await waitFor(() => expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E2] }));
    expect(await screen.findByText("Removed 1 track from “Friday”")).toBeInTheDocument();
  });

  it("offers Undo with the removal, and puts the entry back where it was", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove from Set"));
    const gone = FRIDAY.entries.entries[1];
    expect(await screen.findByText("Removed 1 track from “Friday”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: IDS.friday,
        track_id: gone.track_id,
        position: gone.position,
        chapter_id: gone.chapter_id,
      }),
    );
  });

  it("says which entries Undo could not bring back when an Undo insert fails, and keeps going", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    fireEvent.click(rowAt(2), { ctrlKey: true });
    expect(await within(inspector()).findByText(/2 selected/, {}, LOADED)).toBeInTheDocument();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove 2 tracks from Set"));
    expect(await screen.findByText(/^Removed .* from “Friday”$/)).toBeInTheDocument();
    const insert = bridge.insertTrackInCollection as unknown as ReturnType<typeof vi.fn>;
    insert.mockClear();
    insert.mockRejectedValueOnce(new Error("gone"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("Could not undo the removal of 1 of 2 tracks. The rest are back."),
    ).toBeInTheDocument();
  });

  it("says in a danger toast that Undo could not bring the Set's entries back when none comes back (SB2)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove from Set"));
    expect(await screen.findByText("Removed 1 track from “Friday”")).toBeInTheDocument();
    const insert = bridge.insertTrackInCollection as unknown as ReturnType<typeof vi.fn>;
    insert.mockClear();
    insert.mockRejectedValueOnce(new Error("gone"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    const failed = await screen.findByText("Could not undo the removal from “Friday”.");
    expect(failed.closest(".cp-toast")).toHaveClass("cp-toast--error");
  });

  it("acts on every selected entry", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    fireEvent.click(rowAt(2), { ctrlKey: true });
    // A heading is never selected.
    fireEvent.click(rowAt(3), { ctrlKey: true });
    expect(await within(inspector()).findByText(/2 selected/, {}, LOADED)).toBeInTheDocument();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove 2 tracks from Set"));
    await waitFor(() =>
      expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E1, E2] }),
    );
  });

  it("leads to a track's Similar tracks", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(4));
    fireEvent.click(await screen.findByRole("menuitem", { name: "More" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Similar tracks" }));
    await waitFor(() => expect(where()).toBe(`/discover/similar/${FRIDAY.entries.entries[2].track_id}`));
  });
});

describe("a heading's menu", () => {
  it("edits the name, targets and notes in one write", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    fireEvent.click(await menuItem("Edit chapter…"));
    const dialog = await screen.findByRole("dialog", { name: "Edit chapter “Warm-up”" });
    // What a chapter is, before the fields that set it (PRP-11).
    expect(
      within(dialog).getByText(
        "A chapter is a part of the Set — warm-up, peak, closing — with its own target length and tempo range.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Warm-up");
    expect(within(dialog).getByLabelText(/^Target length/)).toHaveValue("8:00");
    expect(within(dialog).getByLabelText("Lowest BPM")).toHaveValue("120");
    expect(within(dialog).getByLabelText("Highest BPM")).toHaveValue("123");
    expect(within(dialog).getByLabelText("Notes")).toHaveValue("Keep it low");

    fireEvent.change(within(dialog).getByLabelText(/^Target length/), { target: { value: "10:00" } });
    fireEvent.change(within(dialog).getByLabelText("Highest BPM"), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sets.updateChapter).toHaveBeenCalledTimes(1);
    expect(sets.updateChapter).toHaveBeenCalledWith({
      chapter_id: 1,
      name: "Warm-up",
      target: "10:00",
      bpm_min: 120,
      bpm_max: null,
      notes: "Keep it low",
    });
  });

  it("keeps the dialog open with the engine's reason when it refuses", async () => {
    sets.updateChapter.mockResolvedValue(
      refused({ code: "INVALID_REQUEST", message: "Not a time: soon", reason: null, path: null }),
    );
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    fireEvent.click(await menuItem("Edit chapter…"));
    const dialog = await screen.findByRole("dialog", { name: "Edit chapter “Warm-up”" });
    fireEvent.change(within(dialog).getByLabelText(/^Target length/), { target: { value: "soon" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Not a time: soon")).toBeInTheDocument();
  });

  it("refuses a BPM that is not one before asking", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    fireEvent.click(await menuItem("Edit chapter…"));
    const dialog = await screen.findByRole("dialog", { name: "Edit chapter “Warm-up”" });
    fireEvent.change(within(dialog).getByLabelText("Lowest BPM"), { target: { value: "slow" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText(/A BPM is a number above zero/)).toBeInTheDocument();
    expect(sets.updateChapter).not.toHaveBeenCalled();
  });

  it("moves a chapter down, and not the first one up", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    expect(await menuItem("Move chapter up")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(await menuItem("Move chapter down"));
    await waitFor(() => expect(sets.moveChapter).toHaveBeenCalledWith({ chapter_id: 1, position: 1 }));
  });

  it("deletes a chapter after saying where its entries go", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(3));
    fireEvent.click(await menuItem("Delete chapter…"));
    const dialog = await screen.findByRole("dialog", { name: "Delete “Peak”?" });
    // The shared lead says it is permanent, then what happens to the entries (C165).
    expect(within(dialog).getByText("This cannot be undone.")).toBeInTheDocument();
    expect(within(dialog).getByText(/Its 2 tracks join “Warm-up”/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chapter" }));
    await waitFor(() => expect(sets.deleteChapter).toHaveBeenCalledWith({ chapter_id: 2 }));
  });
});

describe("the entry's plan in the Inspector", () => {
  async function select(index: number) {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(index));
    return within(inspector()).findByRole("region", { name: "In this Set" }, LOADED);
  }

  it("shows the entry's times and note above the track", async () => {
    const zone = await select(1);
    expect(within(zone).getByLabelText("Mix in")).toHaveValue("0:30");
    expect(within(zone).getByLabelText("Mix out")).toHaveValue("4:30");
    // A placeholder reads as an example, never as a value already there (area 85).
    expect(within(zone).getByLabelText("Mix in")).toHaveAttribute("placeholder", "0:00");
    expect(within(zone).getByLabelText("Mix out").getAttribute("placeholder")).toMatch(/^(\d+:\d{2})?$/);
    expect(within(zone).getByLabelText("Note").tagName).toBe("TEXTAREA");
    expect(within(zone).getByText("Time 4:00")).toBeInTheDocument();
    expect(within(zone).getByText(/Entry 1, in Warm-up · starts at 0:00/)).toBeInTheDocument();
    // Above the tabs (Overview, Yours …), which are about the track.
    const yours = within(inspector()).getByRole("tablist");
    expect(zone.compareDocumentPosition(yours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("saves both times together when a field is left", async () => {
    const zone = await select(1);
    const out = within(zone).getByLabelText("Mix out");
    fireEvent.change(out, { target: { value: "4:00" } });
    fireEvent.blur(out);
    await waitFor(() =>
      expect(sets.setEntryTimes).toHaveBeenCalledWith({ entry_id: E1, in_time: "0:30", out_time: "4:00" }),
    );
  });

  it("keeps a refused time in the field, marked, and says why", async () => {
    sets.setEntryTimes.mockResolvedValue(refused(REFUSALS.badTime));
    const zone = await select(1);
    const inField = within(zone).getByLabelText("Mix in");
    fireEvent.change(inField, { target: { value: "4:30" } });
    fireEvent.keyDown(inField, { key: "Enter" });
    expect(await screen.findByText(REFUSALS.badTime.message)).toBeInTheDocument();
    expect(inField).toHaveValue("4:30");
    expect(inField).toHaveAttribute("aria-invalid", "true");
    expect(within(zone).getByText(/Not saved/)).toBeInTheDocument();
  });

  it("does not write times nobody changed", async () => {
    const zone = await select(1);
    fireEvent.blur(within(zone).getByLabelText("Mix in"));
    expect(sets.setEntryTimes).not.toHaveBeenCalled();
  });

  it("saves a note when it is left, and clears a blank one", async () => {
    const zone = await select(4);
    const note = within(zone).getByLabelText("Note");
    expect(note).toHaveValue("Let the break run");
    fireEvent.change(note, { target: { value: "  " } });
    fireEvent.blur(note);
    await waitFor(() => expect(sets.setEntryNote).toHaveBeenCalledWith({ entry_id: E3, note: null }));
  });

  it("moves an entry to another chapter, to the nearest place in it", async () => {
    const zone = await select(1);
    fireEvent.change(within(zone).getByLabelText("Chapter"), { target: { value: "3" } });
    await waitFor(() =>
      expect(sets.moveEntry).toHaveBeenCalledWith({ entry_id: E1, position: 3, chapter_id: 3 }),
    );
  });

  it("acknowledges a transition warning, and withdraws an acknowledged one", async () => {
    const zone = await select(5);
    const jump = within(zone).getByText(/Tempo jumps faster \(\+9\.4%\)/).closest("li") as HTMLElement;
    fireEvent.click(within(jump).getByRole("button", { name: "Mark OK" }));
    await waitFor(() =>
      expect(sets.acknowledge).toHaveBeenCalledWith({ from_entry_id: E3, to_entry_id: E4, warning: "tempo_jump" }),
    );
    const clash = within(zone).getByText(/Keys clash: 8A → 3B \(OK\)/).closest("li") as HTMLElement;
    fireEvent.click(within(clash).getByRole("button", { name: "Undo Mark OK" }));
    await waitFor(() =>
      expect(sets.unacknowledge).toHaveBeenCalledWith({ from_entry_id: E3, to_entry_id: E4, warning: "key_clash" }),
    );
  });

  it("says what accepting does, once, above the warnings (PRP-5)", async () => {
    const zone = await select(5);
    const list = within(zone).getByRole("list", { name: "Warnings" });
    const hint = within(zone).getByText(
      "Mark a warning OK once you have heard the mix work. It comes back if either track changes.",
    );
    expect(hint.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(zone).queryByText(/acknowledge/i)).toBeNull();
  });

  it("asks for an out time in words when there is none (PRP-3)", async () => {
    const zone = await select(4);
    expect(
      within(zone).getByText("No out time yet: type one to count this track in the Set's length."),
    ).toBeInTheDocument();
  });

  it("says a repeat is played again, where", async () => {
    const zone = await select(7);
    expect(within(zone).getByText("Played again: also at 1")).toBeInTheDocument();
  });

  it("draws no zone with nothing selected", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(within(inspector()).queryByRole("region", { name: "In this Set" })).toBeNull();
  });
});

describe("set lists and the export", () => {
  it("copies the set list, and saves one through the dialog", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openExportMenu();
    fireEvent.click(await menuItem("Copy set list"));
    await waitFor(() => expect(sets.setListText).toHaveBeenCalledWith({ set_id: IDS.friday }));

    openExportMenu();
    fireEvent.click(await menuItem("Save set list…"));
    await waitFor(() =>
      expect(sets.chooseSetListDestination).toHaveBeenCalledWith({ setName: "Friday", currentPath: null }),
    );
  });

  it("opens the Rekordbox export with the Set ticked, from the header's Export button (C216)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    openExportMenu();
    fireEvent.click(await menuItem("Export to Rekordbox…"));
    const dialog = await screen.findByRole("dialog", { name: "Export to Rekordbox" });
    // The tick list sits behind Details (DEC-247).
    fireEvent.click(within(dialog).getByRole("button", { name: "What goes in the file" }));
    expect(within(dialog).getByRole("checkbox", { name: /Friday/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Plain/ })).not.toBeChecked();
  });
});

// ------------------------------------------------------------------ FLW-17

/** The facts line. */
const factsLine = () => document.querySelector(".prepare-header__facts") as HTMLElement;
/** An entry button, on the row it is drawn on (C15d, DEC-249). */
const button = (name: string, index = 2) => within(rowAt(index)).getByRole("button", { name });
const tableKey = (init: KeyboardEventInit) => fireEvent.keyDown(table(), init);

describe("selecting in the Set (area 36)", () => {
  const selectedRows = () =>
    within(table())
      .getAllByRole("row")
      .filter((row) => row.getAttribute("aria-selected") === "true");

  it("selects every entry on Ctrl+A, never a chapter heading, and lets go on Escape", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    act(() => table().focus());
    tableKey({ key: "a", ctrlKey: true });
    await waitFor(() => expect(selectedRows()).toHaveLength(FRIDAY.entries.entries.length));
    expect(selectedRows().every((row) => !row.classList.contains("prepare-heading"))).toBe(true);
    tableKey({ key: "Escape" });
    await waitFor(() => expect(selectedRows()).toHaveLength(0));
  });

  it("draws a heading that cannot sort as plain text, and a click on it sorts nothing", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const headers = within(table()).getAllByRole("columnheader");
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(headers[2]).getByText(/./));
    for (const header of within(table()).getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("aria-sort", "none");
    }
  });

  it("draws View and Export as menu buttons with a small arrow, the height of Play Set", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    for (const name of ["View", "Export"]) {
      const trigger = screen.getByRole("button", { name });
      expect(trigger).toHaveAttribute("aria-haspopup", "menu");
      expect(trigger.querySelector('.cp-btn__menu [data-icon="chevron-down"]')).not.toBeNull();
    }
  });
});

describe("the entry buttons (FLW-17, C15d)", () => {
  const names = ["Move up", "Move down", "New chapter", "Repeat", "Remove"];

  it("are drawn only on the selected row, in short words with the full names kept (DEC-249)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // Nothing selected: nothing drawn, on the row or on the facts line.
    for (const name of names) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(within(factsLine()).queryByRole("group", { name: "Selected tracks" })).toBeNull();

    fireEvent.click(rowAt(2));
    const group = within(rowAt(2)).getByRole("group", { name: "Selected tracks" });
    expect(within(group).getAllByRole("button").map(markOf)).toEqual([
      "arrow-up",
      "arrow-down",
      "New chapter",
      "Repeat",
      "Remove",
    ]);
    for (const name of names) expect(button(name)).toBeEnabled();
    expect(button("Move up")).toHaveAttribute("title", "Move up (Alt+↑)");
    expect(button("Remove")).toHaveAttribute("title", "Remove (Delete)");
    // Only the one row carries them.
    expect(screen.getAllByRole("button", { name: "Move up" })).toHaveLength(1);
    // The facts line has none of them any more.
    for (const name of names) expect(within(factsLine()).queryByRole("button", { name })).toBeNull();
  });

  it("are the shared small grey Button, with no hover filter of their own (C6)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    const group = within(rowAt(2)).getByRole("group", { name: "Selected tracks" });
    for (const each of within(group).getAllByRole("button")) {
      expect(each).toHaveClass("cp-btn", "cp-btn--sm", "cp-btn--secondary");
    }
    expect(css).not.toMatch(/filter:\s*brightness/);
  });

  it("sit on the focused entry's row when several are selected, and say how many they act on", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    fireEvent.click(rowAt(4), { ctrlKey: true });
    expect(screen.getAllByRole("button", { name: "Move up" })).toHaveLength(1);
    expect(button("Move up", 4)).toHaveAttribute("title", "Move 2 tracks up (Alt+↑)");
    expect(button("Remove", 4)).toHaveAttribute("title", "Remove 2 tracks (Delete)");
  });

  it("leave the selection alone when pressed, once they let the pointer through", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(rowAt(2));
      fireEvent.click(rowAt(4), { ctrlKey: true });
      const group = within(rowAt(4)).getByRole("group", { name: "Selected tracks" });
      // Not yet: the pointer goes through to the row, so these presses would not be the buttons'.
      expect(getComputedStyle(group).pointerEvents).toBe("none");
      act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS));
      expect(getComputedStyle(group).pointerEvents).not.toBe("none");
    } finally {
      vi.useRealTimers();
    }
    // A press that reached the row would select it alone (a click) or play it (a double-click).
    fireEvent.mouseDown(button("Move up", 4));
    fireEvent.click(button("Move up", 4));
    fireEvent.doubleClick(button("Move up", 4));
    expect(player.playQueue).not.toHaveBeenCalled();
    expect(rowAt(2)).toHaveAttribute("aria-selected", "true");
    expect(rowAt(4)).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(sets.moveEntry).toHaveBeenCalled());
  });

  it("let the pointer through for a double-click's length (500 ms) after they appear, so its second click plays the row", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(rowAt(2));
      const group = within(rowAt(2)).getByRole("group", { name: "Selected tracks" });
      expect(DOUBLE_CLICK_MS).toBe(500);
      expect(getComputedStyle(group).pointerEvents).toBe("none");
      act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS - 1));
      expect(getComputedStyle(group).pointerEvents).toBe("none");
      act(() => void vi.advanceTimersByTime(1));
      expect(getComputedStyle(group).pointerEvents).not.toBe("none");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hold a mouse click on Remove back for a double-click's length, and drop it for a double-click", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // A click of the mouse (detail 1): nothing yet, then Remove after the interval.
      fireEvent.click(button("Remove"), { detail: 1 });
      act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS - 1));
      expect(bridge.removeCollectionEntries).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(1));
      expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E2] });

      // A double-click aimed at the row's right end: it plays the row, and removes nothing.
      (bridge.removeCollectionEntries as Fn).mockClear();
      fireEvent.click(button("Remove"), { detail: 1 });
      fireEvent.click(button("Remove"), { detail: 2 });
      fireEvent.doubleClick(button("Remove"));
      act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS * 2));
      expect(bridge.removeCollectionEntries).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(player.playQueue).toHaveBeenCalled());
  });

  describe("take the form the row has room for (DEC-249)", () => {
    // jsdom lays nothing out, so the widths the browser would measure are stood in for: a Set scroll
    // area `scroll` wide, a number column 50 and a title column 200 (which the buttons may cover); the words 400, the glyphs 150.
    // M192: the buttons sit on a reserved end column, so the room is the scroll width less every
    // other column's least width: #, Title, Artist, BPM, Key, Time, Mix in and Fit are
    // 40 + 120 + 100 + 56 + 48 + 72 + 48 + 40 = 524 at scale 1, 786 at the tests' 1.5.
    let restore: (() => void)[] = [];
    function layout(scroll: number) {
      const widths = (element: Element) =>
        element.matches('[data-column="position"]')
          ? 50
          : element.matches('[data-column="title"]')
            ? 200
            : element.matches('[data-measure="words"]')
              ? 400
              : element.matches('[data-measure="glyphs"]')
                ? 150
                : 0;
      const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
      const client = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return widths(this);
        },
      });
      Object.defineProperty(Element.prototype, "clientWidth", {
        configurable: true,
        get(this: Element) {
          return this.classList.contains("track-table__scroll") ? scroll : 0;
        },
      });
      restore.push(() => {
        if (offset) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
        if (client) Object.defineProperty(Element.prototype, "clientWidth", client);
        else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
      });
    }
    afterEach(() => {
      restore.forEach((undo) => undo());
      restore = [];
    });

    it("draws the words where they fit beside the number and the title", async () => {
      layout(1200); // room 1200 - 786 = 414: the words (400) fit
      renderAt(preparePath(IDS.friday));
      await opened();
      fireEvent.click(rowAt(2));
      expect(within(within(rowAt(2)).getByRole("group", { name: "Selected tracks" })).getAllByRole("button").map(markOf)).toEqual([
        "arrow-up",
        "arrow-down",
        "New chapter",
        "Repeat",
        "Remove",
      ]);
    });

    it("draws glyphs where only they fit, the full names kept", async () => {
      layout(950); // room 164: the words (400) do not fit, the glyphs (150) do
      renderAt(preparePath(IDS.friday));
      await opened();
      fireEvent.click(rowAt(2));
      expect(button("New chapter").textContent).toBe("Chapter");
      expect(markOf(button("Repeat"))).toBe("repeat-after");
      expect(markOf(button("Remove"))).toBe("remove");
    });

    it("draws one Actions button that opens the row's menu where not even the glyphs fit", async () => {
      layout(800); // room 14: not even the glyphs fit
      renderAt(preparePath(IDS.friday));
      await opened();
      fireEvent.click(rowAt(2));
      const group = within(rowAt(2)).getByRole("group", { name: "Selected tracks" });
      expect(within(group).getAllByRole("button")).toHaveLength(1);
      expect(within(group).queryByRole("button", { name: "Remove" })).toBeNull();
      fireEvent.click(within(group).getByRole("button", { name: "Actions" }));
      // The entry's own context menu, as a right-click opens it.
      expect(await menuItem("Remove from Set")).toBeInTheDocument();
      expect(await menuItem("Play")).toBeInTheDocument();
    });
  });

  it("press Remove at once from the keyboard", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    // Enter or Space on a button is a click with no detail.
    fireEvent.click(button("Remove"), { detail: 0 });
    await waitFor(() => expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E2] }));
  });

  it("are not drawn while a time on their row is being typed in, so they never cover its fields", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    expect(within(rowAt(2)).getByRole("group", { name: "Selected tracks" })).toBeInTheDocument();
    tableKey({ key: "F2" });
    await within(rowAt(2)).findByRole("textbox");
    expect(within(rowAt(2)).queryByRole("group", { name: "Selected tracks" })).toBeNull();
    // Escape drops the typing, and the buttons are back.
    fireEvent.keyDown(within(rowAt(2)).getByRole("textbox"), { key: "Escape" });
    await waitFor(() => expect(within(rowAt(2)).getByRole("group", { name: "Selected tracks" })).toBeInTheDocument());
  });

  it("tell their hint with the themed tip on keyboard focus, drawn in the page and not inside the clipped row", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    act(() => button("Move up").focus());
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Move up (Alt+↑)");
    expect(tip.parentElement).toBe(document.body);
    expect(button("Move up")).toHaveAttribute("aria-describedby", tip.id);
  });

  it("let Tab go from the table to the row's first enabled button, and Shift+Tab on it back to the table", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // The first entry cannot move up: its first enabled button is Move down.
    fireEvent.click(rowAt(1));
    act(() => table().focus());
    expect(fireEvent.keyDown(table(), { key: "Tab" })).toBe(false);
    expect(button("Move down", 1)).toHaveFocus();
    // Tab between the buttons is the browser's.
    expect(fireEvent.keyDown(button("Move down", 1), { key: "Tab" })).toBe(true);
    // Shift+Tab on the first one is the table's.
    expect(fireEvent.keyDown(button("Move down", 1), { key: "Tab", shiftKey: true })).toBe(false);
    expect(table()).toHaveFocus();
    // Shift+Tab on a later button is the browser's.
    expect(fireEvent.keyDown(button("Remove", 1), { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("leave Tab alone with no entry selected", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    act(() => table().focus());
    expect(fireEvent.keyDown(table(), { key: "Tab" })).toBe(true);
  });

  it("keep only the keys the table acts on, and let Escape and the app's keys through", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    const seen: string[] = [];
    const spy = (event: KeyboardEvent) => seen.push(event.key);
    document.addEventListener("keydown", spy);
    try {
      for (const key of ["Escape", "Enter", "ArrowDown", "Delete", "F2", "F5", "Tab"]) {
        fireEvent.keyDown(button("Move up"), { key });
      }
    } finally {
      document.removeEventListener("keydown", spy);
    }
    expect(seen).toEqual(["Escape", "F5", "Tab"]);
  });

  it("keep focus on ↓ after the Set is re-read and the row's node is moved", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    const [one, two, ...rest] = FRIDAY.entries.entries;
    const [first, ...others] = FRIDAY.plan.chapters;
    // The answer to Move down: E2 and E3 swapped (E3 is the next chapter's first).
    sets.moveEntry.mockImplementationOnce(async () => {
      // A real browser drops focus to the page when React moves the row's node; jsdom does not.
      (document.activeElement as HTMLElement | null)?.blur();
      sets.entries.mockImplementation(async () =>
        answered({ ...FRIDAY.entries, entries: [one, rest[0], two, ...rest.slice(1)].map((entry, position) => ({ ...entry, position })) }),
      );
      sets.plan.mockImplementation(async () => answered({ ...FRIDAY.plan, chapters: [first, ...others] }));
      return answered(EDITS.moved);
    });
    const down = button("Move down");
    act(() => down.focus());
    fireEvent.click(down);
    await waitFor(() => expect(sets.moveEntry).toHaveBeenCalled());
    // However React redraws the row, focus is on the same button afterwards, never lost to the page.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement).toHaveAttribute("data-entry-button", "down");

  });

  it("put focus on the table after Remove, when the buttons are gone", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    const remove = button("Remove");
    act(() => remove.focus());
    fireEvent.click(remove);
    await waitFor(() => expect(bridge.removeCollectionEntries).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).toBe(table()));
  });

  it("move an entry up and down by one, and across a chapter's heading as a step", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    fireEvent.click(button("Move up"));
    await waitFor(() => expect(sets.moveEntry).toHaveBeenLastCalledWith({ entry_id: E2, position: 0, chapter_id: 1 }));
    fireEvent.click(button("Move down"));
    // E2 is its chapter's last entry: down is across the heading, position unchanged.
    await waitFor(() => expect(sets.moveEntry).toHaveBeenLastCalledWith({ entry_id: E2, position: 1, chapter_id: 2 }));
  });

  it("work a second move out from the order the first one made, not the one before it", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // The server's answer after E2 moves up: E2 and E1 swapped in their chapter.
    const [first, ...others] = FRIDAY.plan.chapters;
    const [one, two, ...rest] = FRIDAY.entries.entries;
    expect([first.entry_ids, one.entry_id, two.entry_id]).toEqual([[E1, E2], E1, E2]);
    sets.moveEntry.mockImplementationOnce(async () => {
      sets.entries.mockImplementation(async () => answered({ ...FRIDAY.entries, entries: [{ ...two, position: 0 }, { ...one, position: 1 }, ...rest] }));
      sets.plan.mockImplementation(async () =>
        answered({ ...FRIDAY.plan, chapters: [{ ...first, entry_ids: [E2, E1] }, ...others] }),
      );
      return answered(EDITS.moved);
    });
    fireEvent.click(rowAt(2));
    // Both presses land at once, as a quick second keystroke does.
    fireEvent.click(button("Move up"));
    fireEvent.click(button("Move down"));
    await waitFor(() => expect(sets.moveEntry).toHaveBeenCalledTimes(2));
    // From the new order E2 is first in its chapter, so down is one step, inside it.
    expect(sets.moveEntry).toHaveBeenLastCalledWith({ entry_id: E2, position: 1, chapter_id: 1 });
  });

  it("move several selected entries together", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    fireEvent.click(rowAt(4), { ctrlKey: true });
    fireEvent.click(button("Move up", 4));
    await waitFor(() => expect(sets.moveEntry).toHaveBeenCalledTimes(2));
    expect(sets.moveEntry.mock.calls.map(([call]) => call)).toEqual([
      { entry_id: E2, position: 0, chapter_id: 1 },
      { entry_id: E3, position: 2, chapter_id: 1 },
    ]);
  });

  it("say why an entry cannot move", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    expect(button("Move up", 1)).toBeDisabled();
    expect(button("Move up", 1)).toHaveAttribute("title", "Already first in the Set");
    expect(button("New chapter", 1)).toBeDisabled();
    fireEvent.click(rowAt(8));
    expect(button("Move down", 8)).toHaveAttribute("title", "Already last in the Set");
  });

  it("start a chapter at the first selected entry, repeat one entry and remove all selected", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    fireEvent.click(rowAt(5), { ctrlKey: true });
    // The focused row is the last one picked.
    expect(button("Repeat", 5)).toBeDisabled();
    expect(button("Repeat", 5)).toHaveAttribute("title", "Select one track");
    fireEvent.click(button("New chapter", 5));
    await waitFor(() => expect(sets.splitChapter).toHaveBeenCalledWith({ entry_id: E2 }));
    fireEvent.click(button("Remove", 5));
    await waitFor(() => expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E2, E4] }));

    fireEvent.click(rowAt(2));
    fireEvent.click(button("Repeat"));
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: IDS.friday,
        track_id: FRIDAY.entries.entries[1].track_id,
        position: 2,
        chapter_id: 1,
      }),
    );
  });

  it("answer Alt+Up, Alt+Down and Delete on the table, as the queue does", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    tableKey({ key: "ArrowUp", altKey: true });
    await waitFor(() => expect(sets.moveEntry).toHaveBeenLastCalledWith({ entry_id: E2, position: 0, chapter_id: 1 }));
    tableKey({ key: "ArrowDown", altKey: true });
    await waitFor(() => expect(sets.moveEntry).toHaveBeenCalledTimes(2));
    tableKey({ key: "Delete" });
    await waitFor(() => expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E2] }));
  });

  it("leave Delete to a field being typed in", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // Mix in shows by default (C246).
    fireEvent.click(rowAt(1));
    fireEvent.click(within(rowAt(1)).getByRole("button", { name: /Mix in/ }));
    fireEvent.keyDown(await within(rowAt(1)).findByRole("textbox"), { key: "Delete" });
    expect(bridge.removeCollectionEntries).not.toHaveBeenCalled();
  });

  it("make a chapter's name its one button, which opens its dialog (M205)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // No "Edit…" beside the name: the name is the button, and its hint says what it does.
    for (const [index, name] of [
      [0, "Warm-up"],
      [3, "Peak"],
    ] as const) {
      const buttons = within(rowAt(index)).getAllByRole("button");
      expect(buttons.map((button) => button.textContent)).toEqual([name]);
      expect(buttons[0]).toHaveAttribute("title", "Edit chapter");
    }
    fireEvent.click(within(rowAt(3)).getByRole("button", { name: "Peak" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(player.playQueue).not.toHaveBeenCalled();
  });

  it("let the keyboard reach a chapter's button, and Enter on it press it", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const edit = within(rowAt(3)).getByRole("button", { name: "Peak" });
    // A Tab stop, not tabindex -1: a keyboard user can land on it.
    expect(edit).not.toHaveAttribute("tabindex", "-1");
    // Enter on the button is the button's, not the table's Enter on the row.
    edit.focus();
    expect(fireEvent.keyDown(edit, { key: "Enter" })).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();

    // Enter on the heading row itself still opens Edit.
    fireEvent.click(rowAt(3));
    tableKey({ key: "Enter" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("move and delete a chapter from its dialog", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(within(rowAt(3)).getByRole("button", { name: "Peak" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Move up" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Move down" }));
    await waitFor(() => expect(sets.moveChapter).toHaveBeenCalledWith({ chapter_id: 2, position: 2 }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chapter…" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete “Peak”?" });
    expect(confirm).toHaveTextContent(/join/);
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete chapter" }));
    await waitFor(() => expect(sets.deleteChapter).toHaveBeenCalledWith({ chapter_id: 2 }));
  });

  it("keeps what was typed in a chapter's dialog when the chapter is moved", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(within(rowAt(3)).getByRole("button", { name: "Peak" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Name/ }), { target: { value: "Drop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move up" }));
    await waitFor(() => expect(sets.moveChapter).toHaveBeenCalledWith({ chapter_id: 2, position: 0 }));
    expect(within(await screen.findByRole("dialog")).getByRole("textbox", { name: /^Name/ })).toHaveValue("Drop");
  });

  it("cannot move the first chapter up from its dialog", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(within(rowAt(0)).getByRole("button", { name: "Warm-up" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Move down" })).toBeEnabled();
  });
});

// ------------------------------------------------------------------ FLW-18

describe("In and Out in the table (FLW-18)", () => {
  // Mix in and Mix out are hidden by default (R4-5): a layout that shows them stands in for View ▸ Show times.
  beforeEach(() => showTimesInStorage());
  const cell = (index: number, name: RegExp) => within(rowAt(index)).getByRole("button", { name });
  const editor = () => within(table()).getByRole("textbox");

  it("starts typing on a click of the cell, and Enter saves both times and keeps focus on the table", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    expect(editor()).toHaveValue("0:30");
    fireEvent.change(editor(), { target: { value: "1:00" } });
    fireEvent.keyDown(editor(), { key: "Enter" });
    await waitFor(() =>
      expect(sets.setEntryTimes).toHaveBeenCalledWith({ entry_id: E1, in_time: "1:00", out_time: "4:30" }),
    );
    // Enter commits and stops there (SB3): no jump to Mix out, and the row keeps the keyboard.
    await waitFor(() => expect(within(table()).queryByRole("textbox")).toBeNull());
    expect(document.activeElement).toBe(table());
    expect(player.playQueue).not.toHaveBeenCalled();
  });

  it("moves from Mix in to the same entry's Mix out on Tab", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.change(editor(), { target: { value: "1:00" } });
    fireEvent.keyDown(editor(), { key: "Tab" });
    await waitFor(() => expect(editor()).toHaveValue("4:30"));
    expect(within(rowAt(1)).getByRole("textbox")).toBe(editor());
  });

  it("moves from Mix out to the next entry's Mix in on Tab, and selects that entry", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix out/));
    fireEvent.change(editor(), { target: { value: "4:00" } });
    fireEvent.keyDown(editor(), { key: "Tab" });
    await waitFor(() =>
      expect(sets.setEntryTimes).toHaveBeenCalledWith({ entry_id: E1, in_time: "0:30", out_time: "4:00" }),
    );
    await waitFor(() => expect(within(rowAt(2)).getByRole("textbox")).toHaveValue(""));
    expect(rowAt(2)).toHaveAttribute("aria-selected", "true");
  });

  it("goes back on Shift+Tab", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(2, /Mix in/));
    fireEvent.keyDown(editor(), { key: "Tab", shiftKey: true });
    await waitFor(() => expect(within(rowAt(1)).getByRole("textbox")).toHaveValue("4:30"));
    // Nothing was typed, so nothing was written.
    expect(sets.setEntryTimes).not.toHaveBeenCalled();
  });

  it("plays from the focused row on Enter and starts the Mix in time on F2 (SB3)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    tableKey({ key: "Enter" });
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledTimes(1));
    // The queue is that entry and the rest of the Set, the same as a double-click.
    expect(player.playQueue.mock.calls[0][1]).toBe(1);
    expect(within(table()).queryByRole("textbox")).toBeNull();
    tableKey({ key: "F2" });
    expect(within(rowAt(2)).getByRole("textbox")).toBeInTheDocument();
    expect(player.playQueue).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(within(table()).queryByRole("textbox")).toBeNull();
  });

  it("returns the keyboard to the table on Escape, as Enter does", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(2));
    tableKey({ key: "F2" });
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(within(table()).queryByRole("textbox")).toBeNull();
    expect(table()).toHaveFocus();
  });

  it("shows the Mix in column first when F2 is pressed with it hidden", async () => {
    localStorage.setItem(PREPARE_TABLE_LAYOUT_KEY, JSON.stringify([{ id: "in", width: 56, hidden: true }]));
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(headers()).not.toContain("Mix in");
    fireEvent.click(rowAt(2));
    tableKey({ key: "F2" });
    expect(headers()).toContain("Mix in");
    expect(within(rowAt(2)).getByRole("textbox")).toBeInTheDocument();
  });

  it("does nothing on F2 over a chapter's heading", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(3));
    tableKey({ key: "F2" });
    expect(within(table()).queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels on Escape without writing", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.change(editor(), { target: { value: "2:00" } });
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(within(table()).queryByRole("textbox")).toBeNull();
    expect(sets.setEntryTimes).not.toHaveBeenCalled();
    expect(within(rowAt(1)).getByText("0:30")).toBeInTheDocument();
  });

  it("writes nothing for a cell left as it was", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.keyDown(editor(), { key: "Enter" });
    expect(sets.setEntryTimes).not.toHaveBeenCalled();
    await waitFor(() => expect(within(table()).queryByRole("textbox")).toBeNull());
  });

  it("saves when the cell is left", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix out/));
    fireEvent.change(editor(), { target: { value: "4:10" } });
    fireEvent.blur(editor());
    await waitFor(() =>
      expect(sets.setEntryTimes).toHaveBeenCalledWith({ entry_id: E1, in_time: "0:30", out_time: "4:10" }),
    );
  });

  it("says a refused time on the facts line, naming the entry, and keeps the cell open", async () => {
    sets.setEntryTimes.mockResolvedValue(refused(REFUSALS.badTime));
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.change(editor(), { target: { value: "4:40" } });
    fireEvent.keyDown(editor(), { key: "Enter" });
    // The reason first, the entry's name last (it is the first to give way).
    const reason = await within(factsLine()).findByText(`Not saved: ${REFUSALS.badTime.message}`);
    expect(reason).toBeInTheDocument();
    expect(within(factsLine()).getByText("(Warm One)")).toBeInTheDocument();
    expect(reason.parentElement).toHaveAttribute("title", `Not saved: ${REFUSALS.badTime.message} (Warm One)`);
    expect(reason.nextElementSibling).toHaveTextContent("(Warm One)");
    expect(editor()).toHaveValue("4:40");
    expect(editor()).toHaveAttribute("aria-invalid", "true");
    // The facts line, not a toast: no row changes height.
    expect(screen.queryByRole("alert")).toBeNull();
    // Escape drops the typing and the words.
    fireEvent.keyDown(editor(), { key: "Escape" });
    expect(within(factsLine()).queryByText(/Not saved/)).toBeNull();
  });

  it("saves one entry's times one after another, so a later save never sends back the Mix in before the first", async () => {
    let finishFirst: (answer: ReturnType<typeof answered>) => void = () => undefined;
    sets.setEntryTimes.mockImplementationOnce(
      () => new Promise((resolve) => (finishFirst = resolve as typeof finishFirst)),
    );
    renderAt(preparePath(IDS.friday));
    await opened();
    // Mix in is left by a click (a blur's save, slow to answer) ...
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.change(editor(), { target: { value: "0:40" } });
    fireEvent.blur(editor());
    await waitFor(() => expect(sets.setEntryTimes).toHaveBeenCalledTimes(1));
    // ... and Mix out is typed and saved with Enter before it has answered.
    fireEvent.click(cell(1, /Mix out/));
    fireEvent.change(editor(), { target: { value: "4:10" } });
    fireEvent.keyDown(editor(), { key: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sets.setEntryTimes).toHaveBeenCalledTimes(1);
    finishFirst(answered(EDITS.times));
    await waitFor(() => expect(sets.setEntryTimes).toHaveBeenCalledTimes(2));
    expect(sets.setEntryTimes).toHaveBeenLastCalledWith({ entry_id: E1, in_time: "0:40", out_time: "4:10" });
  });

  it("does not close the cell typed in now when a refusal for another one comes late", async () => {
    let refuse: (answer: ReturnType<typeof refused>) => void = () => undefined;
    sets.setEntryTimes.mockImplementationOnce(() => new Promise((resolve) => (refuse = resolve as typeof refuse)));
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(1, /Mix in/));
    fireEvent.change(editor(), { target: { value: "4:40" } });
    fireEvent.keyDown(editor(), { key: "Enter" });
    await waitFor(() => expect(sets.setEntryTimes).toHaveBeenCalledTimes(1));
    // Typing has moved on to another entry's Mix in when the refusal arrives.
    fireEvent.click(cell(2, /Mix in/));
    expect(within(rowAt(2)).getByRole("textbox")).toBeInTheDocument();
    refuse(refused(REFUSALS.badTime));
    await within(factsLine()).findByText(`Not saved: ${REFUSALS.badTime.message}`);
    expect(within(rowAt(2)).getByRole("textbox")).toBeInTheDocument();
  });

  it("still plays on a double-click of the cell", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(cell(2, /Mix in/));
    fireEvent.doubleClick(within(rowAt(2)).getByRole("textbox"));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledTimes(1));
    expect(player.playQueue.mock.calls[0][1]).toBe(1);
    expect(within(table()).queryByRole("textbox")).toBeNull();
  });

  it("keeps the Inspector's fields", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    const zone = await within(inspector()).findByRole("region", { name: "In this Set" }, LOADED);
    expect(within(zone).getByLabelText("Mix in")).toHaveValue("0:30");
    expect(within(zone).getByLabelText("Mix out")).toHaveValue("4:30");
  });

  it("offers no cell on a chapter's heading", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(within(rowAt(0)).queryByRole("button", { name: /Mix in/ })).toBeNull();
  });
});

// ------------------------------------------------------------------ FLW-19

describe("the Set table's columns (R4-5)", () => {
  it("shows #, Title, Artist, BPM, Key, Time, Mix in and Fit, and keeps the rest out of the way (C246, D12, M199)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // Fit shows from the start: it is the one column that marks a warning on a row (M199). Mix out,
    // Starts at, Transition and Note are in the column picker.
    expect(headers()).toEqual(["#", "Title", "Artist", "BPM", "Key", "Time", "Mix in", "Fit"]);
    // M192: after them, the reserved end column the selected row's buttons sit on, with no heading.
    const all = within(table()).getAllByRole("columnheader");
    expect(all[all.length - 1]).toHaveAttribute("data-column", "entry_buttons");
    expect(rowAt(1).querySelector('[data-column="entry_buttons"]')).not.toBeNull();
    expect(rowAt(1).querySelector('[data-column="entry_buttons"]')?.textContent).toBe("");
  });

  it("leaves Time, Mix in and Mix out out while no track has a time, and brings them back when asked (D21, M200)", async () => {
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    expect(headers()).not.toContain("Time");
    expect(headers()).not.toContain("Mix in");
    expect(headers()).toContain("Title");
    // Not ticked while they are left out; choosing the item shows both, with Time.
    expect(viewItem("Mix-in and mix-out columns")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(viewItem("Mix-in and mix-out columns"));
    expect(headers()).toEqual(expect.arrayContaining(["Time", "Mix in", "Mix out"]));
  });

  it("opens the column picker from the button in the table's header corner, not from View", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(within(table()).getByRole("button", { name: "Columns" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Mix out" })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Mix in" })).toBeChecked();
  });

  it("draws the Key cell as a Camelot chip", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const chip = rowAt(1).querySelector('[data-column="key"] .key-chip');
    expect(chip).toHaveTextContent(/^\d{1,2}[AB]$/);
    expect(chip).toHaveClass(`key-chip--${chip!.textContent}`);
  });

  it("ticks both time columns on from View ▸ Mix in and Mix out, and off again, with the menu left open (C126)", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    // Only Mix in shows by default (C246), so the item, which stands for both, is not ticked.
    expect(headers()).toContain("Mix in");
    expect(headers()).not.toContain("Mix out");
    // Mixed, not unticked: one of the two shows. Choosing it from there shows both.
    expect(viewItem("Mix-in and mix-out columns")).toHaveAttribute("aria-checked", "mixed");
    // M194: a mixed tick is drawn as the dash (P1 changed the menu), not the half dot.
    expect(viewItem("Mix-in and mix-out columns").querySelector('[data-icon="dash"]')).not.toBeNull();
    expect(viewItem("Mix-in and mix-out columns").querySelector('[data-icon="dot-half"]')).toBeNull();
    showTimes();
    expect(headers()).toEqual(expect.arrayContaining(["Mix in", "Mix out"]));
    // The menu is still open, and the item is ticked.
    expect(viewItem("Mix-in and mix-out columns")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(viewItem("Mix-in and mix-out columns"));
    expect(headers()).not.toContain("Mix in");
    expect(headers()).not.toContain("Mix out");
    expect(viewItem("Mix-in and mix-out columns")).toHaveAttribute("aria-checked", "false");
  });

  it("shows both when only one is showing, rather than swapping them", async () => {
    localStorage.setItem(
      PREPARE_TABLE_LAYOUT_KEY,
      JSON.stringify([
        { id: "in", width: 60, hidden: true },
        { id: "out", width: 60, hidden: false },
      ]),
    );
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(headers()).toContain("Mix out");
    expect(headers()).not.toContain("Mix in");
    expect(viewItem("Mix-in and mix-out columns")).toHaveAttribute("aria-checked", "mixed");
    fireEvent.click(viewItem("Mix-in and mix-out columns"));
    expect(headers()).toEqual(expect.arrayContaining(["Mix in", "Mix out"]));
  });

  it("respects a layout saved under the new key", async () => {
    localStorage.setItem(PREPARE_TABLE_LAYOUT_KEY, JSON.stringify([{ id: "note", width: 180, hidden: false }]));
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(headers()).toContain("Note");
  });

  it("starts afresh for a layout saved under the old key", async () => {
    for (const old of ["cuepoint-prepare-set-layout", "cuepoint-prepare-set-layout-2", "cuepoint-prepare-set-layout-3"]) {
      localStorage.setItem(old, JSON.stringify([{ id: "note", width: 180, hidden: false }]));
    }
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(headers()).not.toContain("Note");
    expect(PREPARE_TABLE_LAYOUT_KEY).toBe("cuepoint-prepare-set-layout-4");
  });

  it("draws a dot for how each track mixes in: filled fits, half one side off, a ring both off", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.friday));
    await opened();
    const dots = within(table()).getAllByRole("img", { name: /^Fits$|Tempo jumps|Keys clash|BPM to compare/ });
    // Six entries; the first has no change into it, so it has no dot.
    expect(dots.map((dot) => dot.className.replace("prepare-fit prepare-fit--", ""))).toEqual([
      "fit",
      "fit",
      "one",
      "both",
      "fit",
    ]);
    // Drawn with the pixel dots and a ring, not typed (C138).
    expect(dots.map((dot) => dot.querySelector("[data-icon]")?.getAttribute("data-icon") ?? "ring")).toEqual([
      "dot-filled",
      "dot-filled",
      "dot-half",
      "ring",
      "dot-filled",
    ]);
    expect(dots.every((dot) => !/[●◐○]/.test(dot.textContent ?? ""))).toBe(true);
    // One side off: the tempo jump is open, the key clash was accepted.
    expect(dots[2]).toHaveAccessibleName(expect.stringMatching(/^Tempo jumps/));
    expect(dots[2]).not.toHaveAccessibleName(expect.stringMatching(/Keys clash/));
    expect(dots[3]).toHaveAccessibleName(expect.stringMatching(/^Tempo jumps.*\. Keys clash/));
    expect(dots[3]!.getAttribute("data-hint")).toMatch(/Tempo jumps.*\. Keys clash/);
    expect(dots[0]).toHaveAccessibleName("Fits");
  });

  it("counts a chapter's open warnings on its heading instead of a dot", async () => {
    showTimesInStorage();
    renderAt(preparePath(IDS.friday));
    await opened();
    const count = within(rowAt(0)).getByRole("img", { name: "2 open warnings in this chapter" });
    expect(count).toHaveTextContent("2");
    expect(count).toHaveAttribute("data-hint", "2 open warnings in this chapter");
    expect(rowAt(0).querySelector(".prepare-fit")).toBeNull();
  });
});

describe("the key notice (FLW-19)", () => {
  function withoutKeys() {
    const keyless = {
      ...FRIDAY,
      analysis: {
        ...FRIDAY.analysis,
        without_key: 2,
        shape: {
          ...FRIDAY.analysis.shape,
          entries: FRIDAY.analysis.shape.entries.map((e) =>
            e.entry_id === E3 || e.entry_id === E4 ? { ...e, key: null, camelot: null } : e,
          ),
        },
      },
    };
    WHOLE[IDS.friday] = keyless;
  }
  afterEach(() => {
    WHOLE[IDS.friday] = FRIDAY;
  });

  it("says once how many entries have no Beatport key, and is not a warning", async () => {
    withoutKeys();
    renderAt(preparePath(IDS.friday));
    await opened();
    const notice = within(factsLine()).getByText(/^2 without a key/);
    expect(notice).toHaveAttribute("title", expect.stringMatching(/^2 tracks have no Beatport key/));
    expect(factsLine()).toHaveTextContent("5 warnings");
  });

  it("is plain text, with no Match tracks… beside it", async () => {
    withoutKeys();
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(within(factsLine()).queryByRole("button", { name: /Match tracks/ })).toBeNull();
    expect(within(factsLine()).getByText(/^2 without a key/).closest("button")).toBeNull();
    expect(screen.queryByText(/Match the tracks to get theirs/)).toBeNull();
  });

  it("is absent when every entry has a key", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(factsLine()).not.toHaveTextContent("without a key");
  });
});

describe("the transition strip's caption and Accept (FLW-19)", () => {
  function openStrip() {
    localStorage.setItem("cuepoint-prepare-transition", "1");
    (bridge as { waveforms?: unknown }).waveforms = {
      get: vi.fn(async () => ({
        value: { width: null, paused: false, waveforms: [], unknown: [] },
        refusal: null,
      })),
      request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
      analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
    };
  }

  it("reads the keys and the tempo change of the selected entry into the next, without its times", async () => {
    openStrip();
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    expect(await screen.findByTestId("transition-words")).toHaveTextContent(/^8A → 9A · next key up · \+1\.6%$/);
  });

  it("ends the line with one warning, the first still open, and Accept writes the acceptance", async () => {
    openStrip();
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(4));
    // The tempo jump is open and the key clash accepted: one is shown, the other is "+1 more".
    const warning = await screen.findByTestId("transition-warning");
    expect(screen.getAllByTestId("transition-warning")).toHaveLength(1);
    expect(warning).toHaveTextContent(/^Tempo jumpMark OK\+1 more$/);
    expect(within(warning).getByText("+1 more")).toHaveAttribute("data-hint", "Keys clash: 8A → 3B (OK)");
    fireEvent.click(within(warning).getByRole("button", { name: "Mark OK" }));
    await waitFor(() =>
      expect(sets.acknowledge).toHaveBeenCalledWith({ from_entry_id: E3, to_entry_id: E4, warning: "tempo_jump" }),
    );
  });
});
