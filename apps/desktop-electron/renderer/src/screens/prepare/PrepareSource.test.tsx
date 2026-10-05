/**
 * The Prepare page's source panel and lanes (PREP-11, DEC-105, DEC-111).
 *
 * Over the engine's own answers (`prepareSource.fixture.json`): Build is Open
 * (Open One, Open Two, Bridge Deep) then Peak (Peak Loud, Peak Two), 140–150
 * BPM; Shape holds every lane case; Blank is empty.
 *
 * - **The point**: the gap after the selected entry, or the end, named in
 *   words; Suggestions asks the engine for exactly that gap and chapter.
 * - **Suggestions**: each side's reasons, the score, the "in this Set" mark,
 *   the chapter's range, a gap nothing bridges with each side's own list, a
 *   stale gap re-read, an empty Set said.
 * - **Inserting**: "Insert here" and the row menu put the selection at the
 *   point, in order, and select what went in; a drag of rows drops where it
 *   lands, a heading's chapter start included; an empty Set takes a drop; a
 *   gesture too big for the Set is refused whole.
 * - **The pool** and **the Library tab**: remembered, sent as the Library's own
 *   parameters, searched through the one browse route.
 * - **The lanes**: from the View menu, remembered, and a column selects its entry.
 * - **The transition strip** (WAVE-07): from the View menu, remembered, the
 *   selected entry beside the next, and a half selects its entry.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type {
  CollectionNode,
  LibraryBrowseParams,
  LibraryTrackDetail,
  LibraryTrackRow,
  SetSuggestionsRequest,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { TRACK_IDS_MIME } from "../library/collectionDrag";
import { TRACK_DETAIL } from "../library/librarySets.testFixture";
import { toQueueItem } from "../library/useLibraryPlayback";
import { PrepareScreen } from "./PrepareScreen";
import { answered, refused } from "./prepare.testFixture";
import {
  BLANK,
  BROWSE,
  BUILD,
  INSERTED,
  SHAPE,
  SOURCE_IDS,
  SOURCE_PLAYLISTS,
  SOURCE_REFUSALS,
  SOURCE_TREE,
  SUGGESTIONS,
} from "./prepareSource.testFixture";
import { PREPARE_PATH, PREPARE_SET_ROUTE, preparePath } from "./prepareLink";
import { EMPTY_SET_SUGGESTIONS } from "./SourcePanel";
import {
  LANES_STORAGE_KEY,
  SOURCE_POOL_STORAGE_KEY,
  SOURCE_TAB_STORAGE_KEY,
  TRANSITION_STORAGE_KEY,
} from "./sourcePanelState";
import { END_OF_SET, NO_SELECTION_WORDS } from "./transitionStrip";

const LOADED = { timeout: 3000 };
const [OPEN_ONE, OPEN_TWO, BRIDGE, PEAK_LOUD, PEAK_TWO] = SOURCE_IDS.build_entries;
const [OPEN, PEAK] = SOURCE_IDS.build_chapters;

type Fn = ReturnType<typeof vi.fn>;
let sets: Record<string, Fn>;
interface TestBridge {
  insertTrackInCollection: Fn;
  browseLibrary: Fn;
  [method: string]: unknown;
}
let bridge: TestBridge;
let player: Record<string, Fn>;

const WHOLE: Record<number, typeof BUILD> = {
  [SOURCE_IDS.build]: BUILD,
  [SOURCE_IDS.shape]: SHAPE,
  [SOURCE_IDS.blank]: BLANK,
};

function read(part: "plan" | "entries" | "analysis") {
  return vi.fn(async ({ set_id }: { set_id: number }) =>
    WHOLE[set_id] ? answered(WHOLE[set_id][part]) : refused(SOURCE_REFUSALS.setGone),
  );
}

/** What the engine answered for each gap and pool the fixture asked about. */
function suggest(request: SetSuggestionsRequest) {
  if (request.set_id === SOURCE_IDS.blank) return refused(SOURCE_REFUSALS.emptySet);
  if (request.against === "before") return answered(SUGGESTIONS.noFitBefore);
  if (request.against === "after") return answered(SUGGESTIONS.noFitAfter);
  if (request.before_entry_id === BRIDGE) return answered(SUGGESTIONS.noFit);
  if (request.after_entry_id == null) return answered(SUGGESTIONS.end);
  if (request.scope === "collection") return answered(SUGGESTIONS.poolCollection);
  if (request.scope === "smart") return answered(SUGGESTIONS.poolSmart);
  if (request.playlist_id != null) return answered(SUGGESTIONS.poolPlaylist);
  return answered(SUGGESTIONS.both);
}

const ALL_TRACKS: LibraryTrackRow[] = BROWSE.library.tracks;

function detailOf(trackId: number): LibraryTrackDetail {
  const track = ALL_TRACKS.find((candidate) => candidate.id === trackId) ?? ALL_TRACKS[0];
  return { ...TRACK_DETAIL, track, collections: [] };
}

function install(tree: CollectionNode[] = SOURCE_TREE) {
  sets = {
    plan: read("plan"),
    entries: read("entries"),
    analysis: read("analysis"),
    suggestions: vi.fn(async (request: SetSuggestionsRequest) => suggest(request)),
    setListText: vi.fn(),
    create: vi.fn(),
    createFrom: vi.fn(),
    duplicate: vi.fn(),
    setNotes: vi.fn(),
    createChapter: vi.fn(),
    updateChapter: vi.fn(),
    moveChapter: vi.fn(),
    deleteChapter: vi.fn(),
    splitChapter: vi.fn(),
    moveEntry: vi.fn(),
    setEntryTimes: vi.fn(),
    setEntryNote: vi.fn(),
    acknowledge: vi.fn(),
    unacknowledge: vi.fn(),
    saveSetList: vi.fn(),
    chooseSetListDestination: vi.fn(),
  };
  player = {
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playView: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue(undefined),
  };
  bridge = {
    sets,
    player,
    getCollections: vi.fn(async () => ({ collections: tree, total: tree.length })),
    getLibraryPlaylists: vi.fn(async () => ({ playlists: SOURCE_PLAYLISTS, total: SOURCE_PLAYLISTS.length })),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detailOf(trackId)),
    // The engine echoes the order it was asked for (LIBUI-03), which is how a
    // window knows an answer is to the question asked now.
    browseLibrary: vi.fn(async (params: LibraryBrowseParams) => ({
      ...(params.q ? BROWSE.search : params.scope === "collection" ? BROWSE.crate : BROWSE.library),
      sort: params.sort,
      dir: params.dir,
    })),
    insertTrackInCollection: vi.fn().mockResolvedValue(INSERTED),
    removeCollectionEntries: vi.fn(),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
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
          </MemoryRouter>
          <aside aria-label="Inspector">
            <InspectorSlotOutlet />
          </aside>
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>,
  );
}

function rowsOf(name: string): HTMLElement[] {
  return within(screen.getByRole("table", { name }))
    .getAllByRole("row")
    .filter((row) => row.dataset.index !== undefined);
}

function setRow(entryId: number): HTMLElement {
  const index = rowIndexOf(entryId);
  return rowsOf("Set entries").find((row) => row.dataset.index === String(index))!;
}

/** The Set table's row index for an entry: Build draws two headings. */
function rowIndexOf(entryId: number): number {
  const order = [-OPEN, OPEN_ONE, OPEN_TWO, BRIDGE, -PEAK, PEAK_LOUD, PEAK_TWO];
  return order.indexOf(entryId);
}

async function opened(name = "Build") {
  await screen.findByRole("heading", { level: 1, name }, LOADED);
}

function panel() {
  return screen.getByRole("region", { name: "Add to the Set" });
}

function point() {
  return within(panel()).getByRole("status", { name: /^Insert: / });
}

async function suggestionRows(): Promise<HTMLElement[]> {
  await waitFor(() => expect(rowsOf("Suggestions").length).toBeGreaterThan(0), LOADED);
  return rowsOf("Suggestions");
}

function titleOf(row: HTMLElement): string {
  return row.querySelector('[data-column="title"]')?.textContent?.replace("↻", "").trim() ?? "";
}

function lastRequest(): SetSuggestionsRequest {
  const calls = sets.suggestions.mock.calls;
  return calls[calls.length - 1][0] as SetSuggestionsRequest;
}

function transfer(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    dropEffect: "none",
    effectAllowed: "uninitialized",
    get types() {
      return Object.keys(data);
    },
    getData: (format: string) => data[format] ?? "",
    setData: (format: string, value: string) => {
      data[format] = value;
    },
  } as unknown as DataTransfer;
}

function drag(type: "dragstart" | "dragover" | "drop", element: HTMLElement, dataTransfer: DataTransfer, clientY = 0) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(element, event);
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
});

describe("the insertion point", () => {
  it("is the end of the Set with nothing selected, and Suggestions asks for exactly that", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(point()).toHaveAccessibleName("Insert: After “Peak Two”, at the end of the Set, in Peak");
    await suggestionRows();
    expect(lastRequest()).toMatchObject({
      set_id: SOURCE_IDS.build,
      before_entry_id: PEAK_TWO,
      after_entry_id: null,
      chapter_id: PEAK,
      against: null,
      scope: null,
    });
  });

  it("follows the selected entry to the gap after it", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    expect(point()).toHaveAccessibleName("Insert: Between “Open One” and “Open Two”, in Open");
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({ before_entry_id: OPEN_ONE, after_entry_id: OPEN_TWO, chapter_id: OPEN }),
    );
  });

  it("asks once for the gap a quick walk stops at", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await suggestionRows();
    const before = sets.suggestions.mock.calls.length;
    fireEvent.click(setRow(OPEN_ONE));
    fireEvent.click(setRow(OPEN_TWO));
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(sets.suggestions.mock.calls.length).toBe(before + 1));
    expect(lastRequest()).toMatchObject({ before_entry_id: OPEN_ONE });
  });
});

describe("Suggestions", () => {
  async function between() {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(lastRequest()).toMatchObject({ before_entry_id: OPEN_ONE }));
    await waitFor(() => expect(titleOf(rowsOf("Suggestions")[0])).toBe("Bridge Deep"), LOADED);
    return rowsOf("Suggestions");
  }

  it("lists what fits both sides, best first, with each side's reasons and the score", async () => {
    const rows = await between();
    expect(rows.map(titleOf)).toEqual(SUGGESTIONS.both.suggestions.map((s) => s.track.title));
    const first = rows[0];
    const [best] = SUGGESTIONS.both.suggestions;
    expect(within(first).getByText(String(best.score))).toHaveAttribute(
      "title",
      `The mean of ${best.before!.score} and ${best.after!.score}`,
    );
    // The title says it all again, for a panel too narrow to show the columns.
    expect(first.querySelector('[data-column="title"] [title]')).toHaveAttribute(
      "title",
      [
        "Bridge Deep · score 69.8",
        "With the one before: Close tempo: 124 → 125 · Same key: 8A · Same genre: House",
        "With the one after: Close tempo: 126 → 125 · One step on the wheel: 9A → 8A · Same genre: House",
        "Already in this Set once: inserting it plays it again",
      ].join("\n"),
    );
    const previous = first.querySelector('[data-column="before"]')!;
    const next = first.querySelector('[data-column="after"]')!;
    expect(previous.textContent).toMatch(/Same key: 8A/);
    expect(next.textContent).toMatch(/One step on the wheel: 9A → 8A/);
  });

  it("marks a track already in the Set, and not one that is not", async () => {
    const rows = await between();
    const bridgeDeep = rows.find((row) => titleOf(row) === "Bridge Deep")!;
    expect(within(bridgeDeep).getByLabelText("Already in this Set once: inserting it plays it again")).toBeInTheDocument();
    const spare = rows.find((row) => titleOf(row) === "Deep Spare")!;
    expect(within(spare).queryByLabelText(/Already in this Set/)).toBeNull();
  });

  it("says the chapter's range narrowed the list", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(await within(panel()).findByText("Only tracks inside Peak's range, 140–150 BPM.", {}, LOADED)).toBeInTheDocument();
    // One side fitted: no column for the other.
    await suggestionRows();
    expect(screen.getByRole("table", { name: "Suggestions" }).querySelector('[data-column="after"]')).toBeNull();
  });

  it("says when nothing bridges a gap, and offers each side's own list", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(BRIDGE));
    expect(
      await within(panel()).findByText(/Nothing fits between “Bridge Deep” \(125 BPM\) and “Peak Loud” \(145 BPM\): they are 16% apart/, {}, LOADED),
    ).toHaveTextContent("Keys clash: 8A → 3B.");

    fireEvent.click(within(panel()).getByRole("button", { name: "Fit before “Peak Loud”" }));
    await waitFor(() => expect(lastRequest()).toMatchObject({ before_entry_id: BRIDGE, against: "after" }));
    expect(await within(panel()).findByText("Fitting before “Peak Loud” only", { exact: false }, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(rowsOf("Suggestions").map(titleOf)).toContain("Fast Lane"));
    expect(screen.getByRole("table", { name: "Suggestions" }).querySelector('[data-column="before"]')).toBeNull();

    fireEvent.click(within(panel()).getByRole("button", { name: "Fit both sides" }));
    await waitFor(() => expect(lastRequest()).toMatchObject({ against: null }));
    fireEvent.click(await within(panel()).findByRole("button", { name: "Fit after “Bridge Deep”" }, LOADED));
    await waitFor(() => expect(lastRequest()).toMatchObject({ against: "before" }));
  });

  it("forgets one side's list when the gap changes", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(BRIDGE));
    fireEvent.click(await within(panel()).findByRole("button", { name: "Fit after “Bridge Deep”" }, LOADED));
    await waitFor(() => expect(lastRequest()).toMatchObject({ against: "before" }));
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(lastRequest()).toMatchObject({ before_entry_id: OPEN_ONE, against: null }));
  });

  it("re-reads the Set when the gap went stale under it", async () => {
    sets.suggestions.mockResolvedValueOnce(refused(SOURCE_REFUSALS.stale));
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const reads = sets.plan.mock.calls.length;
    expect(await screen.findByText(SOURCE_REFUSALS.stale.message, {}, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(sets.plan.mock.calls.length).toBeGreaterThan(reads));
    await suggestionRows();
  });

  it("says any other refusal in the panel, with a way to ask again", async () => {
    sets.suggestions.mockResolvedValueOnce(
      refused({ code: "INVALID_REQUEST", message: "limit must be a whole number", reason: null, path: null }),
    );
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(await within(panel()).findByText("limit must be a whole number", {}, LOADED)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "Try again" }));
    await suggestionRows();
  });

  it("says an empty Set has nothing to fit against, and asks the engine nothing", async () => {
    renderAt(preparePath(SOURCE_IDS.blank));
    await opened("Blank");
    expect(within(panel()).getByText(EMPTY_SET_SUGGESTIONS)).toBeInTheDocument();
    expect(sets.suggestions).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole("button", { name: "Open the Library tab" }));
    expect(within(panel()).getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
  });

  it("plays the list from a double-clicked suggestion, as a library row plays (DEC-012)", async () => {
    const rows = await between();
    fireEvent.doubleClick(rows[1]);
    await waitFor(() => expect(player.playQueue).toHaveBeenCalled());
    const [items, index] = player.playQueue.mock.calls[0];
    expect(index).toBe(1);
    expect(items).toEqual(SUGGESTIONS.both.suggestions.map((s) => toQueueItem(s.track)));
  });
});

describe("inserting", () => {
  it("puts the selected suggestion at the point, selects it, and says so", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(titleOf(rowsOf("Suggestions")[1])).toBe("Deep Spare"), LOADED);
    const insert = within(panel()).getByRole("button", { name: "Insert here" });
    expect(insert).toBeDisabled();
    fireEvent.click(rowsOf("Suggestions")[1]);
    expect(insert).toBeEnabled();
    const reads = sets.plan.mock.calls.length;
    fireEvent.click(insert);
    await waitFor(() => expect(bridge.insertTrackInCollection).toHaveBeenCalledTimes(1));
    const spare = SUGGESTIONS.both.suggestions[1].track_id;
    expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
      collection_id: SOURCE_IDS.build,
      track_id: spare,
      position: 1,
      chapter_id: OPEN,
    });
    expect(await screen.findByText("Inserted “Deep Spare” into “Build”.", {}, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(sets.plan.mock.calls.length).toBeGreaterThan(reads));
  });

  it("puts several in the table's order, one place after another", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(rowsOf("Suggestions").length).toBe(4), LOADED);
    const rows = rowsOf("Suggestions");
    fireEvent.click(rows[2]);
    fireEvent.click(rows[0], { ctrlKey: true });
    fireEvent.click(within(panel()).getByRole("button", { name: "Insert 2 here" }));
    await waitFor(() => expect(bridge.insertTrackInCollection).toHaveBeenCalledTimes(2));
    const ids = SUGGESTIONS.both.suggestions.map((s) => s.track_id);
    expect(bridge.insertTrackInCollection.mock.calls.map(([call]) => [call.track_id, call.position])).toEqual([
      [ids[0], 1],
      [ids[2], 2],
    ]);
    expect(await screen.findByText("Inserted 2 tracks into “Build”.", {}, LOADED)).toBeInTheDocument();
  });

  it("selects the entry an insert made, so the next gap is after it", async () => {
    const grown = structuredClone(BUILD);
    const made = { ...grown.entries.entries[0], entry_id: 99, position: 1, track_id: 5 };
    grown.entries.entries.splice(1, 0, made);
    grown.entries.entries.forEach((entry, position) => (entry.position = position));
    grown.plan.entries.splice(1, 0, { ...grown.plan.entries[0], entry_id: 99, track_id: 5 });
    grown.plan.entries.forEach((entry, position) => (entry.position = position));
    grown.plan.chapters[0].entry_ids.splice(1, 0, 99);
    bridge.insertTrackInCollection.mockImplementation(async () => {
      WHOLE[SOURCE_IDS.build] = grown;
      return { entry: { ...INSERTED.entry, id: 99 } };
    });
    try {
      renderAt(preparePath(SOURCE_IDS.build));
      await opened();
      fireEvent.click(setRow(OPEN_ONE));
      await waitFor(() => expect(rowsOf("Suggestions").length).toBe(4), LOADED);
      fireEvent.click(rowsOf("Suggestions")[1]);
      fireEvent.click(within(panel()).getByRole("button", { name: "Insert here" }));
      await waitFor(() =>
        expect(point()).toHaveAccessibleName(/^Insert: Between “Open One” and “Open Two”/),
      );
      // The new entry is the selection: its row is highlighted and the gap follows it.
      await waitFor(() => expect(lastRequest()).toMatchObject({ before_entry_id: 99, after_entry_id: OPEN_TWO }), LOADED);
    } finally {
      WHOLE[SOURCE_IDS.build] = BUILD;
    }
  });

  it("offers Insert here first in a row's menu", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    fireEvent.contextMenu(rows[0]);
    const menu = await screen.findByRole("menu", {}, LOADED);
    const items = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(items.slice(0, 4)).toEqual(["Insert here", "Play", "Play next", "Add to queue"]);
    expect(items).toContain("Similar tracks");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Insert here" }));
    await waitFor(() => expect(bridge.insertTrackInCollection).toHaveBeenCalledWith(
      expect.objectContaining({ position: 5, chapter_id: PEAK }),
    ));
  });

  it("refuses a gesture the Set has no room for, whole, before writing", async () => {
    const full = structuredClone(BUILD);
    full.entries.limit = 5;
    WHOLE[SOURCE_IDS.build] = full;
    try {
      renderAt(preparePath(SOURCE_IDS.build));
      await opened();
      const rows = await suggestionRows();
      fireEvent.click(rows[0]);
      fireEvent.click(within(panel()).getByRole("button", { name: "Insert here" }));
      expect(
        await screen.findByText("A Set holds at most 5 entries. This one has 5, so 1 more will not fit.", {}, LOADED),
      ).toBeInTheDocument();
      expect(bridge.insertTrackInCollection).not.toHaveBeenCalled();
    } finally {
      WHOLE[SOURCE_IDS.build] = BUILD;
    }
  });

  it("carries the dragged rows as track ids, a copy", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    const data = transfer();
    drag("dragstart", rows[0], data);
    expect(JSON.parse(data.getData(TRACK_IDS_MIME))).toEqual([SUGGESTIONS.end.suggestions[0].track_id]);
    expect(data.effectAllowed).toBe("copy");
  });

  it("drops tracks where they land: a heading's chapter start, or below an entry in its chapter", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const tracks = transfer({ [TRACK_IDS_MIME]: "[5]" });
    drag("dragover", setRow(-PEAK), tracks, 0);
    expect(setRow(-PEAK)).toHaveAttribute("data-drop", "before");
    drag("drop", setRow(-PEAK), tracks, 0);
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenLastCalledWith({
        collection_id: SOURCE_IDS.build,
        track_id: 5,
        position: 3,
        chapter_id: PEAK,
      }),
    );
    // jsdom rects are zero, so a pointer at 1 is a row's lower half: after it.
    const again = transfer({ [TRACK_IDS_MIME]: "[5, 6]" });
    drag("dragover", setRow(OPEN_ONE), again, 1);
    drag("drop", setRow(OPEN_ONE), again, 1);
    await waitFor(() => expect(bridge.insertTrackInCollection).toHaveBeenCalledTimes(3));
    expect(bridge.insertTrackInCollection.mock.calls.slice(1).map(([call]) => [call.track_id, call.position, call.chapter_id])).toEqual([
      [5, 1, OPEN],
      [6, 2, OPEN],
    ]);
    expect(await screen.findByText("Inserted 2 tracks into “Build”.", {}, LOADED)).toBeInTheDocument();
  });

  it("takes the first track into an empty Set by a drop on its note", async () => {
    renderAt(preparePath(SOURCE_IDS.blank));
    await opened("Blank");
    const note = screen.getByText(/This Set is empty/).closest(".prepare-set__drop") as HTMLElement;
    const tracks = transfer({ [TRACK_IDS_MIME]: "[7]" });
    drag("dragover", note, tracks);
    drag("drop", note, tracks);
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: SOURCE_IDS.blank,
        track_id: 7,
        position: 0,
        chapter_id: BLANK.plan.chapters[0].id,
      }),
    );
  });
});

describe("the pool", () => {
  function pool() {
    return within(panel()).getByRole("combobox", { name: "From" }) as HTMLSelectElement;
  }

  it("offers the library, the Rekordbox playlists, and CuePoint's tree", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await waitFor(() => expect(within(pool()).getByRole("option", { name: /Warmers/ })).toBeInTheDocument());
    const options = within(pool()).getAllByRole("option").map((option) => option.textContent?.trim());
    expect(options).toEqual(
      expect.arrayContaining(["The whole library", "CRATES", "Warmers", "Crate", "House", "Build (Set)", "Scratch (Set)"]),
    );
    expect(within(pool()).getByRole("option", { name: /Gigs/ })).toBeDisabled();
  });

  it("sends a Collection, a Smart Collection or a playlist as the Library's own parameters, and remembers it", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(within(pool()).getByRole("option", { name: /Warmers/ })).toBeInTheDocument());
    fireEvent.change(pool(), { target: { value: `collection:${SOURCE_IDS.crate}` } });
    await waitFor(() => expect(lastRequest()).toMatchObject({ scope: "collection", collection_id: SOURCE_IDS.crate }));
    await waitFor(() => expect(rowsOf("Suggestions").map(titleOf)).toEqual(["Deep Spare", "Half Time"]));
    expect(localStorage.getItem(SOURCE_POOL_STORAGE_KEY)).toBe(`collection:${SOURCE_IDS.crate}`);
    fireEvent.change(pool(), { target: { value: `smart:${SOURCE_IDS.smart}` } });
    await waitFor(() => expect(lastRequest()).toMatchObject({ scope: "smart", collection_id: SOURCE_IDS.smart }));
    fireEvent.change(pool(), { target: { value: `playlist:${SOURCE_IDS.warmers}` } });
    await waitFor(() => expect(lastRequest()).toMatchObject({ playlist_id: SOURCE_IDS.warmers, scope: null }));
    await waitFor(() => expect(rowsOf("Suggestions").map(titleOf)).toEqual(["Deep Relative"]));
  });

  it("reads a remembered pool that has gone as the library", async () => {
    localStorage.setItem(SOURCE_POOL_STORAGE_KEY, "collection:777");
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await suggestionRows();
    expect(pool().value).toBe("library");
    expect(lastRequest()).toMatchObject({ scope: null, collection_id: null });
  });
});

describe("the Library tab", () => {
  it("is remembered, and searches the pool through the Library's browse", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    expect(localStorage.getItem(SOURCE_TAB_STORAGE_KEY)).toBe("library");
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBeGreaterThan(0), LOADED);
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search" }), { target: { value: "Deep" } });
    await waitFor(() =>
      expect(bridge.browseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Deep", sort: "artist", dir: "asc" })),
    );
    await waitFor(() =>
      expect(rowsOf("Library tracks to add").map(titleOf).sort()).toEqual(["Bridge Deep", "Deep Relative", "Deep Spare"]),
    );
  });

  it("opens on the tab last used, and inserts a library row at the point", async () => {
    localStorage.setItem(SOURCE_TAB_STORAGE_KEY, "library");
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(within(panel()).getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
    expect(sets.suggestions).not.toHaveBeenCalled();
    fireEvent.click(setRow(OPEN_TWO));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBeGreaterThan(0), LOADED);
    const row = rowsOf("Library tracks to add")[0];
    const title = titleOf(row);
    fireEvent.click(row);
    fireEvent.click(within(panel()).getByRole("button", { name: "Insert here" }));
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith(expect.objectContaining({ position: 2, chapter_id: OPEN })),
    );
    expect(await screen.findByText(`Inserted “${title}” into “Build”.`, {}, LOADED)).toBeInTheDocument();
  });

  it("scopes to the pool, sorts by a header, and plays the view from a row (DEC-012)", async () => {
    localStorage.setItem(SOURCE_TAB_STORAGE_KEY, "library");
    localStorage.setItem(SOURCE_POOL_STORAGE_KEY, `collection:${SOURCE_IDS.crate}`);
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await waitFor(() =>
      expect(bridge.browseLibrary).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: "collection", collectionId: SOURCE_IDS.crate }),
      ),
    );
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBe(3), LOADED);
    fireEvent.click(within(screen.getByRole("table", { name: "Library tracks to add" })).getByRole("button", { name: "BPM" }));
    await waitFor(() => expect(bridge.browseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "bpm" })));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBe(3), LOADED);
    fireEvent.doubleClick(rowsOf("Library tracks to add")[2]);
    await waitFor(() => expect(player.playView).toHaveBeenCalledWith(expect.objectContaining({ scope: "collection" }), 2));
  });
});

describe("the lanes", () => {
  function openLanes() {
    fireEvent.click(screen.getByRole("button", { name: "View ▾" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Show tempo and key lanes" }));
  }

  it("start hidden, open from the View menu, and are remembered", async () => {
    renderAt(preparePath(SOURCE_IDS.shape));
    await opened("Shape");
    expect(screen.queryByRole("group", { name: "Tempo and key lanes" })).toBeNull();
    openLanes();
    const lanes = screen.getByRole("group", { name: "Tempo and key lanes" });
    expect(within(lanes).getByText("63–145")).toBeInTheDocument();
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "View ▾" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Hide tempo and key lanes" }));
    expect(screen.queryByRole("group", { name: "Tempo and key lanes" })).toBeNull();
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBe("0");
  });

  it("draw the engine's shape: every relation in its style, a gap for the unknown", async () => {
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    const { container } = renderAt(preparePath(SOURCE_IDS.shape));
    await opened("Shape");
    const relations = [...container.querySelectorAll("[data-relation]")].map((g) => g.getAttribute("data-relation"));
    expect(relations).toEqual(["same", "adjacent", "relative", "clash"]);
    const codes = [...container.querySelectorAll("[data-code]")].map((mark) => mark.getAttribute("data-code"));
    expect(codes).toEqual(["8A", "8A", "9A", "8A", "8B", "3B"]);
    expect(container.querySelectorAll('[data-lane="tempo"] rect').length).toBeGreaterThan(6);
    expect(container.querySelectorAll("[data-chapter]")).toHaveLength(1);
  });

  it("select an entry when its column is clicked, which moves the point", async () => {
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    const { container } = renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const column = container.querySelector(`[data-entry="${OPEN_TWO}"]`) as SVGElement;
    expect(column.querySelector("title")?.textContent).toBe("2 · Open Two · 126 BPM · 9A");
    fireEvent.click(column);
    await waitFor(() => expect(point()).toHaveAccessibleName("Insert: Between “Open Two” and “Bridge Deep”, in Open"));
    expect(setRow(OPEN_TWO)).toHaveAttribute("aria-selected", "true");
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(await within(inspector).findByText(/Entry 2/, {}, LOADED)).toBeInTheDocument();
    expect(container.querySelector(".prepare-lanes__selected")).not.toBeNull();
  });
});

describe("the transition strip (WAVE-07)", () => {
  function toggleStrip(label: "Show transition strip" | "Hide transition strip") {
    fireEvent.click(screen.getByRole("button", { name: "View ▾" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: label }));
  }

  const strip = () => screen.queryByRole("region", { name: "Transition" });

  beforeEach(() => {
    bridge.waveforms = {
      get: vi.fn(async ({ track_ids, width }: { track_ids: number[]; width: number }) => ({
        value: {
          width,
          paused: false,
          waveforms: track_ids.map((track_id) => ({
            track_id,
            state: "waiting",
            reason: null,
            duration_ms: null,
            data: null,
            marks: null,
          })),
          unknown: [],
        },
        refusal: null,
      })),
      request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
      analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
    };
  });

  it("starts hidden, opens from the View menu, and is remembered", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(strip()).toBeNull();

    toggleStrip("Show transition strip");
    expect(strip()).toHaveTextContent(NO_SELECTION_WORDS);
    expect(localStorage.getItem(TRANSITION_STORAGE_KEY)).toBe("1");
    // The lanes keep their own memory.
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBeNull();

    toggleStrip("Hide transition strip");
    expect(strip()).toBeNull();
    expect(localStorage.getItem(TRANSITION_STORAGE_KEY)).toBe("0");
  });

  it("opens as it was left, under the lanes and above the Set's rows", async () => {
    localStorage.setItem(TRANSITION_STORAGE_KEY, "1");
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();

    const shown = strip()!;
    const lanes = screen.getByRole("group", { name: "Tempo and key lanes" });
    const table = screen.getByRole("table", { name: "Set entries" });
    expect(lanes.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(shown.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the entry selected in the table beside the next, and a click on the next selects it", async () => {
    localStorage.setItem(TRANSITION_STORAGE_KEY, "1");
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();

    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(screen.getByTestId("transition-from")).toHaveAttribute("data-entry", String(OPEN_ONE)));
    expect(screen.getByTestId("transition-to")).toHaveAttribute("data-entry", String(OPEN_TWO));
    expect(within(strip()!).getByText("Open One")).toBeInTheDocument();
    expect(within(strip()!).getByText("Open Two")).toBeInTheDocument();
    expect(screen.getByTestId("transition-words")).toHaveTextContent("Untimed → untimed");

    fireEvent.click(screen.getByTestId("transition-to"));
    await waitFor(() => expect(setRow(OPEN_TWO)).toHaveAttribute("aria-selected", "true"));
    expect(setRow(OPEN_ONE)).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("transition-from")).toHaveAttribute("data-entry", String(OPEN_TWO));
    expect(screen.getByTestId("transition-to")).toHaveAttribute("data-entry", String(BRIDGE));
    // The insertion point follows the selection, as a lane's column moves it.
    await waitFor(() => expect(point()).toHaveAccessibleName("Insert: Between “Open Two” and “Bridge Deep”, in Open"));
  });

  it("reads End of Set for the last entry, across a chapter", async () => {
    localStorage.setItem(TRANSITION_STORAGE_KEY, "1");
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();

    fireEvent.click(setRow(BRIDGE));
    // The next entry is the first of the next chapter.
    await waitFor(() => expect(screen.getByTestId("transition-to")).toHaveAttribute("data-entry", String(PEAK_LOUD)));
    fireEvent.click(setRow(PEAK_TWO));
    await waitFor(() => expect(screen.getByTestId("transition-to")).toHaveTextContent(END_OF_SET));
  });

  it("is not drawn for an empty Set", async () => {
    localStorage.setItem(TRANSITION_STORAGE_KEY, "1");
    renderAt(preparePath(SOURCE_IDS.blank));
    await opened("Blank");
    expect(strip()).toBeNull();
  });
});

describe("a shell without the source panel's reads", () => {
  it("still draws the Set, the panel saying what it cannot do", async () => {
    delete (bridge as Record<string, unknown>).getLibraryPlaylists;
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await act(async () => {});
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Set entries" })).toBeInTheDocument();
  });
});
