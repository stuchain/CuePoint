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
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { TRACK_IDS_MIME } from "../library/collectionDrag";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { TRACK_DETAIL } from "../library/librarySets.testFixture";
import { toQueueItem } from "../library/useLibraryPlayback";
import { PrepareScreen } from "./PrepareScreen";
import { SOURCE_LIBRARY_COLUMNS, SUGGESTION_COLUMNS, SUGGESTION_TABLE_LAYOUT_KEY, SUGGESTIONS_RANKING_TITLE, suggestionRow } from "./sourceColumns";
import { fitText } from "./prepareSource";
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
import { EMPTY_SET_SUGGESTIONS, EMPTY_SET_SUGGESTIONS_HEADLINE } from "./SourcePanel";
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
  // The Set's name is the page title (D21, M201).
  await screen.findByRole("heading", { level: 1, name }, LOADED);
}

function panel() {
  return screen.getByRole("region", { name: "Add to the Set" });
}

/** Choose a ticked item of the View menu, opening the menu only if it is not open (C126). */
function toggleView(name: string) {
  if (!screen.queryByRole("menu")) fireEvent.click(screen.getByRole("button", { name: "View" }));
  fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name }));
}

function point() {
  return within(panel()).getByRole("status", { name: /^Insert / });
}

async function suggestionRows(): Promise<HTMLElement[]> {
  await waitFor(() => expect(rowsOf("Suggestions").length).toBeGreaterThan(0), LOADED);
  return rowsOf("Suggestions");
}

function titleOf(row: HTMLElement): string {
  // The title's words, apart from the "In Set" mark that ends a source row's cell (M196).
  const cell = row.querySelector('[data-column="title"]');
  return (cell?.querySelector(".prepare-source__title-text") ?? cell)?.textContent?.trim() ?? "";
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
  it("sits under the tabs, which are the panel's head, as one line (PRP-9, M193, M198)", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const line = point();
    const tabs = within(panel()).getByRole("tablist");
    // The head is the Set table's header row high, so its line meets the table's.
    expect(tabs.closest(".prepare-source__head")).not.toBeNull();
    expect(tabs.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line).toHaveTextContent("Insert after “Peak Two” · Peak");
    // One line, whichever tab is open.
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    expect(within(panel()).getAllByRole("status", { name: /^Insert / })).toHaveLength(1);
  });

  it("holds its whole sentence as a title on both tabs", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const sentence = "After “Peak Two” · Peak";
    expect(point().getAttribute("data-hint")).toContain(sentence);
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    expect(point()).toHaveAttribute("data-hint", sentence);
  });

  it("is the end of the Set with nothing selected, and Suggestions asks for exactly that", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(point()).toHaveAccessibleName("Insert after “Peak Two” · Peak");
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
    expect(point()).toHaveAccessibleName("Insert between “Open One” and “Open Two” · Open");
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

describe("the ranking, said in the BPM change header (C203)", () => {
  it("draws no note above the table, on the first visit or any other", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await suggestionRows();
    expect(within(panel()).queryByText(/Ranked by/)).toBeNull();
    expect(panel().querySelector(".prepare-source__note--line")).toBeNull();
    expect(localStorage.getItem("cuepoint-prepare-suggestions-note")).toBeNull();
  });

  it("is the BPM change header's hint instead", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await suggestionRows();
    const table = screen.getByRole("table", { name: "Suggestions" });
    const header = within(table).getByText("BPM change").closest<HTMLElement>(".track-table__header-cell")!;
    expect(header.getAttribute("title") ?? header.getAttribute("data-hint")).toContain(SUGGESTIONS_RANKING_TITLE);
  });
});

describe("the source columns put BPM before Key, as on every page (C70, D12)", () => {
  it("lists Title, Artist, BPM, Key in the Library tab and Title, Key, BPM change in Suggestions", () => {
    expect(SOURCE_LIBRARY_COLUMNS.map((column) => column.id).slice(0, 4)).toEqual(["title", "artist", "bpm", "key"]);
    // The panel is narrow: it opens on Title and Key alone, so nothing scrolls sideways at 270 px (M85, round 3).
    expect(SOURCE_LIBRARY_COLUMNS.filter((column) => !column.hiddenByDefault).map((column) => column.id)).toEqual(["title", "key"]);
    // Key keeps the Library's min width, so the corner never cuts its heading (M88).
    expect(SOURCE_LIBRARY_COLUMNS.find((column) => column.id === "key")!.minWidthPx).toBe(LIBRARY_COLUMNS.find((column) => column.id === "key")!.minWidthPx);
    expect(SUGGESTION_COLUMNS.map((column) => column.id)).toEqual(["title", "key", "bpm_delta"]);
    expect(SUGGESTION_COLUMNS.find((column) => column.id === "bpm_delta")!.align).toBe("right");
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

  it("draws a suggestion's Key as a Camelot chip (R4-2)", async () => {
    const rows = await between();
    expect(rows[0].querySelector('[data-column="key"] .key-chip')).toHaveTextContent(/^\d{1,2}[AB]$/);
  });

  it("sorts on screen by Key and by BPM change, and remembers the last sort (C193)", async () => {
    const first = await between();
    expect(first.map(titleOf)).toEqual(["Bridge Deep", "Deep Spare", "Deep Relative", "Half Time"]);
    const table = screen.getByRole("table", { name: "Suggestions" });
    fireEvent.click(within(table).getByRole("button", { name: "Key" }));
    await waitFor(() => expect(rowsOf("Suggestions").map(titleOf)).toEqual(["Bridge Deep", "Deep Relative", "Deep Spare", "Half Time"]));
    // The engine was not asked for a key it does not know.
    expect(lastRequest()).not.toHaveProperty("sort");
    fireEvent.click(within(table).getByRole("button", { name: "BPM change" }));
    fireEvent.click(within(table).getByRole("button", { name: "BPM change" }));
    await waitFor(() => expect(rowsOf("Suggestions").map(titleOf)[0]).toBe("Deep Spare"));
    expect(localStorage.getItem(SUGGESTION_TABLE_LAYOUT_KEY)).toContain("bpm_delta");
  });

  it("lists what fits both sides, best first, with each side's reasons and the score", async () => {
    const rows = await between();
    expect(rows.map(titleOf)).toEqual(SUGGESTIONS.both.suggestions.map((s) => s.track.title));
    const first = rows[0];
    const [best] = SUGGESTIONS.both.suggestions;
    // Title, the normal Key column and a right-aligned BPM change: no fit text, no dot (C78).
    const table = screen.getByRole("table", { name: "Suggestions" });
    const headers = Array.from(table.querySelectorAll(".track-table__header-cell")).map((cell) => cell.textContent?.trim());
    expect(headers).toEqual(["Title", "Key", "BPM change"]);
    const header = (name: string) => within(table).getByText(name).closest<HTMLElement>(".track-table__header-cell")!;
    expect(header("BPM change")).toHaveAttribute("title", expect.stringContaining("out of 100"));
    expect(header("BPM change")).toHaveAttribute("title", expect.stringContaining("in playing order"));
    for (const gone of ["fit", "before", "after", "score", "bpm", "artist"]) {
      expect(table.querySelector(`[data-column="${gone}"]`)).toBeNull();
    }
    expect(first.querySelector('[data-column="key"]')!.textContent).toMatch(/^\d{1,2}[AB]$/);
    const fit = first.querySelector('[data-column="bpm_delta"]')!;
    expect(fit.textContent).toBe("+1");
    expect(fit.className).toContain("track-table__cell--right");
    expect(fit.textContent).not.toMatch(/BPM|·/);
    // The full reason stays in the hover hint: each side in playing order, with the score.
    expect(fit.querySelector("[data-hint]")).toHaveAttribute(
      "data-hint",
      [
        `Fit ${fitText(best.score)}`,
        `Fits after the one before: Close tempo: 124 → 125 · Same key: 8A · Same genre: House (${best.before!.score}/100)`,
        `Fits before the one after: Close tempo: 125 → 126 · Mixes well (next key): 8A → 9A · Same genre: House (${best.after!.score}/100)`,
      ].join(" · "),
    );
    // The title says it all again, with the track's other facts.
    expect(first.querySelector('[data-column="title"] [data-hint]')).toHaveAttribute(
      "data-hint",
      [
        "Bridge Deep · fit 70/100",
        "Fits after the one before: Close tempo: 124 → 125 · Same key: 8A · Same genre: House",
        "Fits before the one after: Close tempo: 125 → 126 · Mixes well (next key): 8A → 9A · Same genre: House",
        "Already in this Set once: inserting it plays it again",
      ].join(" · "),
    );
  });

  it("takes the BPM change from the side a list is fitted to, and says nothing in common", () => {
    const fitColumn = SUGGESTION_COLUMNS.find((column) => column.id === "bpm_delta")!;
    const base = SUGGESTIONS.both.suggestions[0];
    const oneSide = suggestionRow({ ...base, before: null })!;
    expect(fitColumn.text!(oneSide)).toBe("+1");
    const none = suggestionRow({ ...base, before: { score: 12, reasons: [] }, after: null })!;
    expect(fitColumn.text!(none)).toBe("");
    const { container } = render(<>{fitColumn.render(none)}</>);
    expect(container.querySelector("[data-hint]")).toHaveAttribute(
      "data-hint",
      expect.stringContaining("Nothing in common (12/100)"),
    );
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
    await suggestionRows();
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
    expect(EMPTY_SET_SUGGESTIONS).toBe(
      "Suggestions need a track to fit against. Add the first one from the Library tab.",
    );
    expect(within(panel()).getByText(EMPTY_SET_SUGGESTIONS_HEADLINE)).toBeInTheDocument();
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

describe("the selected track (PAGES-03)", () => {
  afterEach(() => setSelectedTrack(null));

  it("is the row picked in the panel, then the entry picked in the Set, whichever was touched last", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(titleOf(rowsOf("Suggestions")[0])).toBe("Bridge Deep"), LOADED);
    const entry = BUILD.entries.entries.find((candidate) => candidate.entry_id === OPEN_ONE)!;
    await waitFor(() =>
      expect(getSelectedTrack()).toEqual({ id: entry.track_id, key: entry.track.effective_key ?? null }),
    );

    const picked = SUGGESTIONS.both.suggestions[0].track;
    fireEvent.click(rowsOf("Suggestions")[0]);
    await waitFor(() => expect(getSelectedTrack()).toEqual({ id: picked.id, key: picked.effective_key ?? null }));

    fireEvent.click(setRow(OPEN_TWO));
    const second = BUILD.entries.entries.find((candidate) => candidate.entry_id === OPEN_TWO)!;
    await waitFor(() =>
      expect(getSelectedTrack()).toEqual({ id: second.track_id, key: second.track.effective_key ?? null }),
    );
  });
});

describe("Track details follow the row last clicked, in either list", () => {
  afterEach(() => setSelectedTrack(null));

  it("shows a track picked in Suggestions, then an entry of the Set, then the track again", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    const entry = BUILD.entries.entries.find((candidate) => candidate.entry_id === OPEN_ONE)!;
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    await within(inspector).findByRole("region", { name: "In this Set" }, LOADED);
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenLastCalledWith({ trackId: entry.track_id }));

    const picked = SUGGESTIONS.both.suggestions[0].track;
    await suggestionRows();
    fireEvent.click(rowsOf("Suggestions")[0]);
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenLastCalledWith({ trackId: picked.id }));
    // A track outside the Set has no entry to plan.
    await waitFor(() => expect(within(inspector).queryByRole("region", { name: "In this Set" })).toBeNull());

    fireEvent.click(setRow(OPEN_TWO));
    const second = BUILD.entries.entries.find((candidate) => candidate.entry_id === OPEN_TWO)!;
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenLastCalledWith({ trackId: second.track_id }));
    await within(inspector).findByRole("region", { name: "In this Set" }, LOADED);
  });

  it("shows a track picked in the Library tab", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBeGreaterThan(0), LOADED);
    const row = rowsOf("Library tracks to add")[0];
    fireEvent.click(row);
    const id = ALL_TRACKS.find((track) => track.title === titleOf(row))!.id;
    await waitFor(() => expect(bridge.getLibraryTrack).toHaveBeenLastCalledWith({ trackId: id }));
  });
});

describe("the source tabs keep their state", () => {
  it("comes back to the Library tab with its search and rows as they were", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBeGreaterThan(0), LOADED);
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search tracks" }), { target: { value: "Deep" } });
    await waitFor(() =>
      expect(rowsOf("Library tracks to add").map(titleOf).sort()).toEqual(["Bridge Deep", "Deep Relative", "Deep Spare"]),
    );
    fireEvent.click(rowsOf("Library tracks to add")[0]);
    fireEvent.click(within(panel()).getByRole("tab", { name: "Suggestions" }));
    expect(screen.queryByRole("table", { name: "Library tracks to add" })).toBeNull();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    expect(within(panel()).getByRole("searchbox", { name: "Search tracks" })).toHaveValue("Deep");
    expect(rowsOf("Library tracks to add").map(titleOf).sort()).toEqual(["Bridge Deep", "Deep Relative", "Deep Spare"]);
    expect(rowsOf("Library tracks to add").filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("marks a Library track the Set already holds with In Set, and no other (M203)", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBeGreaterThan(0), LOADED);
    const held = new Set(BUILD.entries.entries.map((entry) => entry.track_id));
    const rows = rowsOf("Library tracks to add");
    const marked = rows.filter((row) => row.querySelector(".prepare-source__in-set"));
    const expected = rows.filter((row) => held.has(ALL_TRACKS.find((track) => track.title === titleOf(row))!.id!));
    expect(expected.length).toBeGreaterThan(0);
    expect(marked).toEqual(expected);
    expect(marked[0].querySelector(".prepare-source__in-set")).toHaveTextContent("In Set");
  });

  it("says what the search takes, a title, a key or a BPM (M204)", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(within(panel()).getByRole("tab", { name: "Library" }));
    const search = await within(panel()).findByRole("searchbox", { name: "Search tracks" });
    expect(search).toHaveAttribute("placeholder", "Search tracks, a key (8A) or a BPM (124)…");
  });

  it("goes to the Library tab and its search on Ctrl+F, from either tab (M480)", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    expect(within(panel()).getByRole("tab", { name: "Suggestions" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
    const search = await within(panel()).findByRole("searchbox", { name: "Search tracks" });
    expect(within(panel()).getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(search).toHaveFocus());
    // Again, from the Suggestions tab it left: back to the same box.
    fireEvent.click(within(panel()).getByRole("tab", { name: "Suggestions" }));
    fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
    await waitFor(() => expect(within(panel()).getByRole("searchbox", { name: "Search tracks" })).toHaveFocus());
  });

  it("draws no grip on a row that is only copied, and Escape lets go of the picked rows", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    expect(rows.some((row) => row.classList.contains("track-table__row--grip"))).toBe(false);
    fireEvent.click(rows[0]);
    expect(rowsOf("Suggestions")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("table", { name: "Suggestions" }), { key: "Escape" });
    await waitFor(() => expect(rowsOf("Suggestions")[0]).not.toHaveAttribute("aria-selected", "true"));
  });
});

describe("inserting", () => {
  it("puts the selected suggestion at the point, selects it, and says so", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    fireEvent.click(setRow(OPEN_ONE));
    await waitFor(() => expect(titleOf(rowsOf("Suggestions")[1])).toBe("Deep Spare"), LOADED);
    // With nothing picked the button is always "Insert here", off, and its hint says why (M428).
    const insert = within(panel()).getByRole("button", { name: "Insert here" });
    expect(insert).toBeDisabled();
    expect(insert).toHaveAttribute("title", "Select tracks below first");
    expect(bridge.insertTrackInCollection).not.toHaveBeenCalled();
    fireEvent.click(rowsOf("Suggestions")[1]);
    expect(insert).toBeEnabled();
    expect(insert).toHaveAccessibleName("Insert here");
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
    expect(await screen.findByText("Inserted “Deep Spare” into “Build”", {}, LOADED)).toBeInTheDocument();
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
    expect(await screen.findByText("Inserted 2 tracks into “Build”", {}, LOADED)).toBeInTheDocument();
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
        expect(point()).toHaveAccessibleName(/^Insert between “Open One” and “Open Two”/),
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
    // The base track menu (Play, then More), with Insert here between, set off by a line (M410: no "This page").
    expect(items).toEqual(["Play", "Play next", "Add to queue", "Insert here", "More"]);
    expect(within(menu).queryByText("This page")).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Similar tracks" })).toBeInTheDocument();
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
        await screen.findByText("A Set holds at most 5 tracks. This one has 5, so 1 more will not fit.", {}, LOADED),
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

  it("sets a drag image chip only when more than one track is dragged", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    const withImage = () => {
      const data = transfer();
      const setDragImage = vi.fn();
      Object.assign(data, { setDragImage });
      return { data, setDragImage };
    };

    const single = withImage();
    drag("dragstart", rows[0], single.data);
    expect(single.setDragImage).not.toHaveBeenCalled();

    fireEvent.click(rows[0]);
    fireEvent.click(rows[1], { ctrlKey: true });
    const several = withImage();
    drag("dragstart", rows[0], several.data);
    expect(several.setDragImage).toHaveBeenCalledTimes(1);
    const chip = several.setDragImage.mock.calls[0][0] as HTMLElement;
    expect(chip).toHaveClass("drag-chip");
    expect(chip.textContent).toBe("2 tracks");
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
    expect(await screen.findByText("Inserted 2 tracks into “Build”", {}, LOADED)).toBeInTheDocument();
  });

  it("an empty Set takes a drop anywhere in its table", async () => {
    renderAt(preparePath(SOURCE_IDS.blank));
    await opened("Blank");
    const table = screen.getByRole("table", { name: "Set entries" });
    const tracks = transfer({ [TRACK_IDS_MIME]: "[7]" });
    const over = new MouseEvent("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: tracks });
    fireEvent(table, over);
    expect(over.defaultPrevented).toBe(true);
    drag("drop", table, tracks);
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: SOURCE_IDS.blank,
        track_id: 7,
        position: 0,
        chapter_id: BLANK.plan.chapters[0].id,
      }),
    );
  });

  it("a drop below the last row appends to the last chapter", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const table = screen.getByRole("table", { name: "Set entries" });
    const body = table.querySelector(".track-table__body") as HTMLElement;
    body.getBoundingClientRect = () => ({ top: 0, bottom: 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    const tracks = transfer({ [TRACK_IDS_MIME]: "[5]" });
    drag("dragover", table, tracks, 5000);
    drag("drop", table, tracks, 5000);
    await waitFor(() =>
      expect(bridge.insertTrackInCollection).toHaveBeenCalledWith({
        collection_id: SOURCE_IDS.build,
        track_id: 5,
        position: BUILD.entries.entries.length,
        chapter_id: PEAK,
      }),
    );
  });

  it("outlines the Set, labelled, while a track is being dragged", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    // The source row sets the MIME itself, as the browser's drag would carry it.
    drag("dragstart", rows[0], transfer());
    expect(screen.getByText("Drop here to add to “Build”")).toBeInTheDocument();
    fireEvent(document, new Event("dragend", { bubbles: true }));
    await waitFor(() => expect(screen.queryByText("Drop here to add to “Build”")).not.toBeInTheDocument());
  });

  it("clears the outline on a document drop, and on the next pointer move when no dragend came", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const rows = await suggestionRows();
    drag("dragstart", rows[0], transfer());
    expect(screen.getByText("Drop here to add to “Build”")).toBeInTheDocument();
    fireEvent(document, new Event("drop", { bubbles: true }));
    await waitFor(() => expect(screen.queryByText("Drop here to add to “Build”")).not.toBeInTheDocument());

    drag("dragstart", rows[0], transfer());
    expect(screen.getByText("Drop here to add to “Build”")).toBeInTheDocument();
    fireEvent.pointerMove(document.body);
    await waitFor(() => expect(screen.queryByText("Drop here to add to “Build”")).not.toBeInTheDocument());
  });

  it("does not outline the Set for a Set entry's own drag", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    drag("dragstart", setRow(OPEN_ONE), transfer());
    expect(screen.queryByText("Drop here to add to “Build”")).not.toBeInTheDocument();
  });

  it("tags the line on a heading with its chapter's name", async () => {
    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    drag("dragover", setRow(-PEAK), transfer({ [TRACK_IDS_MIME]: "[5]" }), 0);
    expect(setRow(-PEAK)).toHaveAttribute("data-drop-chapter", "Peak");
    expect(setRow(OPEN_ONE)).not.toHaveAttribute("data-drop-chapter");
  });

  it("takes the first track into an empty Set by a drop on its note", async () => {
    renderAt(preparePath(SOURCE_IDS.blank));
    await opened("Blank");
    const note = screen.getByText(/This Set is empty/);
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
      expect.arrayContaining(["All tracks", "CRATES", "Warmers", "Crate", "House", "Build (Set)", "Scratch (Set)"]),
    );
    expect(within(pool()).getByRole("option", { name: /Gigs/ })).toBeDisabled();
  });

  it("revisit shows the old value immediately and refetches after an announce", async () => {
    const playlists = bridge.getLibraryPlaylists as ReturnType<typeof vi.fn>;
    const first = renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    await waitFor(() => expect(within(pool()).getByRole("option", { name: /Warmers/ })).toBeInTheDocument());
    first.unmount();
    const before = playlists.mock.calls.length;

    renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    // The first showing of the panel already offers the playlists.
    expect(within(pool()).getByRole("option", { name: /Warmers/ })).toBeInTheDocument();
    await act(async () => {});
    expect(playlists.mock.calls.length).toBe(before);

    const added = { ...SOURCE_PLAYLISTS[1], id: 9001, name: "Fresh crate", path: "CRATES/Fresh crate" };
    playlists.mockResolvedValue({
      playlists: [...SOURCE_PLAYLISTS, added],
      total: SOURCE_PLAYLISTS.length + 1,
    });
    act(() => announceLibraryChange());
    await waitFor(() => expect(within(pool()).getByRole("option", { name: /Fresh crate/ })).toBeInTheDocument());
    expect(playlists.mock.calls.length).toBe(before + 1);
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
    fireEvent.change(within(panel()).getByRole("searchbox", { name: "Search tracks" }), { target: { value: "Deep" } });
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
    expect(await screen.findByText(`Inserted “${title}” into “Build”`, {}, LOADED)).toBeInTheDocument();
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
    // BPM waits in the Columns list in this narrow panel (M85), so the sort is shown on Key.
    fireEvent.click(within(screen.getByRole("table", { name: "Library tracks to add" })).getByRole("button", { name: "Key" }));
    await waitFor(() => expect(bridge.browseLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "key" })));
    await waitFor(() => expect(rowsOf("Library tracks to add").length).toBe(3), LOADED);
    fireEvent.doubleClick(rowsOf("Library tracks to add")[2]);
    await waitFor(() => expect(player.playView).toHaveBeenCalledWith(expect.objectContaining({ scope: "collection" }), 2));
  });
});

describe("the lanes", () => {
  /** The View menu's ticked items (C126): it stays open when one is chosen. */
  function openLanes() {
    toggleView("Tempo and key lane");
  }

  it("start hidden, open from the View menu, and are remembered", async () => {
    renderAt(preparePath(SOURCE_IDS.shape));
    await opened("Shape");
    expect(screen.queryByRole("group", { name: "Tempo and key lanes" })).toBeNull();
    openLanes();
    const lanes = screen.getByRole("group", { name: "Tempo and key lanes" });
    expect(within(lanes).getByText("63–145")).toBeInTheDocument();
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBe("1");
    expect(within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: "Tempo and key lane" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    toggleView("Tempo and key lane");
    expect(screen.queryByRole("group", { name: "Tempo and key lanes" })).toBeNull();
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBe("0");
  });

  it("name the key lane for what it draws, and say what the wheel's neighbors are (PRP-8)", async () => {
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    const { container } = renderAt(preparePath(SOURCE_IDS.shape));
    await opened("Shape");
    const lanes = screen.getByRole("group", { name: "Tempo and key lanes" });
    expect(within(lanes).getByText("Key")).toHaveAttribute(
      "data-hint",
      "Keys on the Camelot wheel: neighbors mix well",
    );
    expect(lanes).not.toHaveTextContent("1A–12B");
    // A link's own title uses the key words the other pages use.
    const titles = [...container.querySelectorAll("[data-relation]")].map((link) => link.getAttribute("data-hint"));
    expect(titles).toEqual(["Same key", "Next key", "Relative key", "Keys clash"]);
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

  it("colour each key mark with its Camelot token, and leave the links to their own colours (R4-2)", async () => {
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    const { container } = renderAt(preparePath(SOURCE_IDS.shape));
    await opened("Shape");
    const mark = container.querySelector('rect[data-code="8A"]') as SVGElement;
    expect(mark.style.getPropertyValue("--lane-key")).toBe("var(--key-8A)");
    expect((container.querySelector('rect[data-code="3B"]') as SVGElement).style.getPropertyValue("--lane-key")).toBe(
      "var(--key-3B)",
    );
    expect((container.querySelector("[data-relation] rect") as SVGElement).style.getPropertyValue("--lane-key")).toBe("");
  });

  it("select an entry when its column is clicked, which moves the point", async () => {
    localStorage.setItem(LANES_STORAGE_KEY, "1");
    const { container } = renderAt(preparePath(SOURCE_IDS.build));
    await opened();
    const column = container.querySelector(`[data-entry="${OPEN_TWO}"]`) as SVGElement;
    expect(column.getAttribute("data-hint")).toBe("2 · Open Two · 126 BPM · 9A");
    fireEvent.click(column);
    await waitFor(() => expect(point()).toHaveAccessibleName("Insert between “Open Two” and “Bridge Deep” · Open"));
    expect(setRow(OPEN_TWO)).toHaveAttribute("aria-selected", "true");
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(await within(inspector).findByText(/Entry 2/, {}, LOADED)).toBeInTheDocument();
    expect(container.querySelector(".prepare-lanes__selected")).not.toBeNull();
  });
});

describe("the transition strip (WAVE-07)", () => {
  function toggleStrip() {
    toggleView("Transition strip");
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

    toggleStrip();
    expect(strip()).toHaveTextContent(NO_SELECTION_WORDS);
    expect(localStorage.getItem(TRANSITION_STORAGE_KEY)).toBe("1");
    // The lanes keep their own memory.
    expect(localStorage.getItem(LANES_STORAGE_KEY)).toBeNull();

    toggleStrip();
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
    // The caption reads the keys and tempo; the times (none here) are the halves' titles'.
    expect(screen.getByTestId("transition-words")).not.toHaveTextContent(/Out|In |no times/);

    fireEvent.click(screen.getByTestId("transition-to"));
    await waitFor(() => expect(setRow(OPEN_TWO)).toHaveAttribute("aria-selected", "true"));
    expect(setRow(OPEN_ONE)).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("transition-from")).toHaveAttribute("data-entry", String(OPEN_TWO));
    expect(screen.getByTestId("transition-to")).toHaveAttribute("data-entry", String(BRIDGE));
    // The insertion point follows the selection, as a lane's column moves it.
    await waitFor(() => expect(point()).toHaveAccessibleName("Insert between “Open Two” and “Bridge Deep” · Open"));
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
