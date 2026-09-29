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
import { toQueueItem } from "../library/useLibraryPlayback";
import { PrepareScreen, SET_ENTRY_MIME, SET_GONE_LINE } from "./PrepareScreen";
import { EDITS, FRIDAY, IDS, PLAIN, REFUSALS, TREE, answered, refused } from "./prepare.testFixture";
import { NO_SETS, WHAT_A_SET_IS } from "./prepareFormat";
import { LAST_SET_STORAGE_KEY, PREPARE_PATH, PREPARE_SET_ROUTE, preparePath } from "./prepareLink";

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
    insertTrackInCollection: vi.fn().mockResolvedValue(EDITS.repeatInserted),
    removeCollectionEntries: vi.fn().mockResolvedValue(EDITS.removed),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
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
  return screen.getByRole("table", { name: "Set entries" });
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

async function opened(name = "Friday") {
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
    expect(await screen.findByText(WHAT_A_SET_IS, {}, LOADED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Set from…" })).toBeInTheDocument();
  });

  it("makes a Set where it is asked, and opens it", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set" }, LOADED));
    const dialog = screen.getByRole("dialog", { name: "New Set" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Friday II" } });
    fireEvent.change(within(dialog).getByLabelText("In"), { target: { value: String(IDS.gigs) } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));

    await waitFor(() => expect(where()).toBe(preparePath(50)));
    expect(sets.create).toHaveBeenCalledWith({ name: "Friday II", parent_id: IDS.gigs });
    expect(await screen.findByText("Made the Set “Friday II”.")).toBeInTheDocument();
  });

  it("refuses a Set with no name before asking the engine", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set" }, LOADED));
    const dialog = screen.getByRole("dialog", { name: "New Set" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Give it a name");
    expect(sets.create).not.toHaveBeenCalled();
  });

  it("says why the engine refused a new Set, and stays open", async () => {
    install(noSets);
    sets.create.mockResolvedValue(refused({ code: "INVALID_REQUEST", message: "Too deep", reason: null, path: null }));
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set" }, LOADED));
    const dialog = screen.getByRole("dialog", { name: "New Set" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "X" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Too deep");
    expect(where()).toBe(PREPARE_PATH);
  });

  it("copies a Set from a source it asks for first, then opens it", async () => {
    install(noSets);
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set from…" }, LOADED));
    const picker = await screen.findByRole("dialog", { name: "New Set from…" });
    // No Collection in this tree: the Rekordbox playlist, not its folder.
    const select = within(picker).getByLabelText("Copy the tracks of") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Sunday"]);
    fireEvent.click(within(picker).getByRole("button", { name: "Continue…" }));

    const dialog = await screen.findByRole("dialog", { name: "New Set from “Sunday”" });
    expect(within(dialog).getByText(/Rekordbox playlist “Sunday”/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));

    await waitFor(() => expect(where()).toBe(preparePath(51)));
    expect(sets.createFrom).toHaveBeenCalledWith({
      source: { kind: "playlist", id: 7 },
      name: "Sunday",
      parent_id: null,
    });
    expect(await screen.findByText("Made the Set “Sunday” with 3 entries.")).toBeInTheDocument();
  });

  it("says there is nothing to copy when there is nothing", async () => {
    install(noSets);
    (bridge.getLibraryPlaylists as Fn).mockResolvedValue({ playlists: [], total: 0 });
    renderAt(PREPARE_PATH);
    fireEvent.click(await screen.findByRole("button", { name: "New Set from…" }, LOADED));
    const picker = await screen.findByRole("dialog", { name: "New Set from…" });
    expect(within(picker).getByText(/There is nothing to copy yet/)).toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: "Continue…" })).toBeDisabled();
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

  it("opens another from the header's picker, which offers Sets and their folders", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const picker = screen.getByLabelText("Set") as HTMLSelectElement;
    expect([...picker.options].map((option) => [option.text.trim(), option.disabled])).toEqual([
      ["Gigs", true],
      ["Friday", false],
      ["Scratch", false],
      ["Plain", false],
    ]);
    fireEvent.change(picker, { target: { value: String(IDS.plain) } });
    await waitFor(() => expect(where()).toBe(preparePath(IDS.plain)));
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
    expect(await screen.findByText("This address names no Set.", {}, LOADED)).toBeInTheDocument();
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
    expect(await screen.findByText(NO_SETS)).toBeInTheDocument();
  });
});

describe("the Set", () => {
  it("names it, and says how long it is planned to run and what its checks found", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    const facts = screen.getByRole("status", { name: "" });
    expect(facts).toHaveTextContent(
      "6 entries · 9:00 planned · 4 untimed · 5 warnings · 1 accepted · Files never checked",
    );
    // Each short fact carries its sentence.
    expect(within(facts).getByText(/5 warnings/)).toHaveAttribute(
      "title",
      "2 tempo jumps, 1 key clash, 1 chapter over its target, 1 chapter outside its BPM range",
    );
    expect(within(facts).getByText(/Files never checked/)).toHaveAttribute(
      "title",
      expect.stringMatching(/^Files in this Set have never been checked/),
    );
    // The picker is the title; the name is the page's heading for assistive technology.
    expect(screen.getByLabelText("Set")).toHaveValue(String(IDS.friday));
    // The columns and the lanes share one link, so the line stays one line.
    fireEvent.click(screen.getByRole("button", { name: "View ▾" }));
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Columns…" })).toBeInTheDocument();
  });

  it("shows the Set's own notes and edits them in one write (PREP-12)", async () => {
    sets.setNotes.mockResolvedValue(answered(EDITS.setNotes));
    renderAt(preparePath(IDS.friday));
    await opened();
    const link = within(screen.getByRole("status", { name: "" })).getByRole("button", { name: "Notes…" });
    // The notes themselves are the link's title, so a glance does not open a dialog.
    expect(link).toHaveAttribute("title", "The Loft, 23:00 to 01:00");
    fireEvent.click(link);
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
    fireEvent.click(screen.getByRole("button", { name: "Notes…" }));
    const dialog = await screen.findByRole("dialog", { name: "Notes for “Friday”" });
    fireEvent.change(within(dialog).getByLabelText("Notes"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("at most 10000 characters");
    expect(sets.setNotes).toHaveBeenCalledWith({ set_id: IDS.friday, notes: null });
  });

  it("says what the notes are for when there are none", async () => {
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    expect(screen.getByRole("button", { name: "Notes…" })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Notes for the whole Set/),
    );
  });

  it("draws each chapter's heading as a row, with its time, target and range", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    expect(rows()).toHaveLength(9);
    const headings = rows().filter((row) => row.classList.contains("prepare-heading"));
    expect(headings.map((row) => row.querySelector('[data-column="title"]')?.textContent)).toEqual([
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
    renderAt(preparePath(IDS.friday));
    await opened();
    const first = rowAt(1);
    expect(first.querySelector('[data-column="in"]')).toHaveTextContent("0:30");
    expect(first.querySelector('[data-column="out"]')).toHaveTextContent("4:30");
    expect(first.querySelector('[data-column="planned"]')).toHaveTextContent("4:00");
    expect(first.querySelector('[data-column="position"]')).toHaveTextContent("↻ 1");
    const peakTwo = rowAt(5);
    expect(peakTwo.querySelector('[data-column="transition"]')).toHaveTextContent("⚠ +9.4% tempo");
    expect(rowAt(4).querySelector('[data-column="note"]')).toHaveTextContent("Let the break run");
    expect(peakTwo).toHaveAttribute("draggable", "true");
  });

  it("draws one unnamed chapter as a plain list, and what a transition cannot compare", async () => {
    renderAt(preparePath(IDS.plain));
    await opened("Plain");
    expect(rows()).toHaveLength(2);
    expect(rows().some((row) => row.classList.contains("prepare-heading"))).toBe(false);
    expect(rowAt(1).querySelector('[data-column="transition"]')).toHaveTextContent(/No BPM · No key|No key · No BPM/);
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
    expect(await screen.findByRole("dialog", { name: "Chapter “Peak”" })).toBeInTheDocument();
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
    const gone: SetRefusal = { code: "SET_NOT_FOUND", message: "There is no entry 5", reason: "entry", path: null };
    sets.moveEntry.mockResolvedValue(refused(gone));
    renderAt(preparePath(IDS.friday));
    await opened();
    const before = sets.plan.mock.calls.length;
    const dataTransfer = transfer({ [SET_ENTRY_MIME]: String(E5) });
    drag("dragover", rowAt(3), dataTransfer, 0);
    drag("drop", rowAt(3), dataTransfer, 0);
    expect(await screen.findByText("There is no entry 5")).toBeInTheDocument();
    await waitFor(() => expect(sets.plan.mock.calls.length).toBe(before + 1));
  });
});

describe("an entry's menu", () => {
  it("starts a chapter at an entry, and not where one starts", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(4));
    expect(await menuItem("Start a chapter here")).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Start a chapter here"));
    await waitFor(() => expect(sets.splitChapter).toHaveBeenCalledWith({ entry_id: E2 }));
  });

  it("says the engine's words when it refuses a new chapter", async () => {
    sets.splitChapter.mockResolvedValue(refused(REFUSALS.splitAtStart));
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(5));
    fireEvent.click(await menuItem("Start a chapter here"));
    expect(await screen.findByText(REFUSALS.splitAtStart.message)).toBeInTheDocument();
  });

  it("inserts a repeat straight after the entry, in its chapter", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Insert a repeat after"));
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
    expect(await screen.findByText("Removed 1 entry from “Friday”.")).toBeInTheDocument();
  });

  it("acts on every selected entry", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(rowAt(1));
    fireEvent.click(rowAt(2), { ctrlKey: true });
    // A heading is never selected.
    fireEvent.click(rowAt(3), { ctrlKey: true });
    expect(await within(inspector()).findByText(/2 tracks selected/, {}, LOADED)).toBeInTheDocument();
    fireEvent.contextMenu(rowAt(2));
    fireEvent.click(await menuItem("Remove 2 entries from Set"));
    await waitFor(() =>
      expect(bridge.removeCollectionEntries).toHaveBeenCalledWith({ entry_ids: [E1, E2] }),
    );
  });

  it("leads to a track's Similar tracks", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(4));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Similar tracks" }));
    await waitFor(() => expect(where()).toBe(`/discover/similar/${FRIDAY.entries.entries[2].track_id}`));
  });
});

describe("a heading's menu", () => {
  it("edits the name, targets and notes in one write", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    fireEvent.click(await menuItem("Rename, targets and notes…"));
    const dialog = await screen.findByRole("dialog", { name: "Chapter “Warm-up”" });
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
    fireEvent.click(await menuItem("Rename, targets and notes…"));
    const dialog = await screen.findByRole("dialog", { name: "Chapter “Warm-up”" });
    fireEvent.change(within(dialog).getByLabelText(/^Target length/), { target: { value: "soon" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Not a time: soon");
  });

  it("refuses a BPM that is not one before asking", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.contextMenu(rowAt(0));
    fireEvent.click(await menuItem("Rename, targets and notes…"));
    const dialog = await screen.findByRole("dialog", { name: "Chapter “Warm-up”" });
    fireEvent.change(within(dialog).getByLabelText("Lowest BPM"), { target: { value: "slow" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("A BPM is a number above zero");
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
    const dialog = await screen.findByRole("dialog", { name: "Delete the chapter “Peak”?" });
    expect(within(dialog).getByText(/Its 2 entries join “Warm-up”/)).toBeInTheDocument();
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
    expect(within(zone).getByLabelText("In")).toHaveValue("0:30");
    expect(within(zone).getByLabelText("Out")).toHaveValue("4:30");
    expect(within(zone).getByText("Plays for 4:00")).toBeInTheDocument();
    expect(within(zone).getByText(/Entry 1, in Warm-up · starts at 0:00/)).toBeInTheDocument();
    // Above "Yours", which is about the track.
    const yours = within(inspector()).getByRole("region", { name: "Yours" });
    expect(zone.compareDocumentPosition(yours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("saves both times together when a field is left", async () => {
    const zone = await select(1);
    const out = within(zone).getByLabelText("Out");
    fireEvent.change(out, { target: { value: "4:00" } });
    fireEvent.blur(out);
    await waitFor(() =>
      expect(sets.setEntryTimes).toHaveBeenCalledWith({ entry_id: E1, in_time: "0:30", out_time: "4:00" }),
    );
  });

  it("keeps a refused time in the field, marked, and says why", async () => {
    sets.setEntryTimes.mockResolvedValue(refused(REFUSALS.badTime));
    const zone = await select(1);
    const inField = within(zone).getByLabelText("In");
    fireEvent.change(inField, { target: { value: "4:30" } });
    fireEvent.keyDown(inField, { key: "Enter" });
    expect(await screen.findByText(REFUSALS.badTime.message)).toBeInTheDocument();
    expect(inField).toHaveValue("4:30");
    expect(inField).toHaveAttribute("aria-invalid", "true");
    expect(within(zone).getByText(/Not saved/)).toBeInTheDocument();
  });

  it("does not write times nobody changed", async () => {
    const zone = await select(1);
    fireEvent.blur(within(zone).getByLabelText("In"));
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
    const jump = within(zone).getByText(/Tempo jumps 9.4% faster/).closest("li") as HTMLElement;
    fireEvent.click(within(jump).getByRole("button", { name: "Acknowledge" }));
    await waitFor(() =>
      expect(sets.acknowledge).toHaveBeenCalledWith({ from_entry_id: E3, to_entry_id: E4, warning: "tempo_jump" }),
    );
    const clash = within(zone).getByText(/Keys clash: 8A → 3B \(acknowledged\)/).closest("li") as HTMLElement;
    fireEvent.click(within(clash).getByRole("button", { name: "Withdraw" }));
    await waitFor(() =>
      expect(sets.unacknowledge).toHaveBeenCalledWith({ from_entry_id: E3, to_entry_id: E4, warning: "key_clash" }),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    fireEvent.click(await menuItem("Copy set list"));
    await waitFor(() => expect(sets.setListText).toHaveBeenCalledWith({ set_id: IDS.friday }));

    fireEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    fireEvent.click(await menuItem("Save set list…"));
    await waitFor(() =>
      expect(sets.chooseSetListDestination).toHaveBeenCalledWith({ setName: "Friday", currentPath: null }),
    );
  });

  it("opens the Rekordbox export with the Set ticked", async () => {
    renderAt(preparePath(IDS.friday));
    await opened();
    fireEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    fireEvent.click(await menuItem("Export to Rekordbox…"));
    const dialog = await screen.findByRole("dialog", { name: "Export to Rekordbox" });
    expect(within(dialog).getByRole("checkbox", { name: /Friday/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Plain/ })).not.toBeChecked();
  });
});
