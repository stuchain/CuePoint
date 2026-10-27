/**
 * Similar tracks (DISCOVER-11, DEC-096).
 *
 * Over the engine's own answers (`discoverPages.fixture.json`): a seed with a
 * tempo, one without, one with nothing near it, and one gone.
 * - suggestions are drawn in the engine's order with short reason columns and a fit bar;
 * - they are library rows: a double-click plays the list from that row, and
 *   the menu queues without interrupting (DEC-012, DEC-013);
 * - a suggestion leads on to its own Similar tracks and its pages;
 * - the Inspector describes the seed, then the suggestion clicked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type {
  DiscoverAnswer,
  LibraryTrackDetail,
  SimilarTracks,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { libraryOpening } from "../library/libraryLink";
import { toQueueItem } from "../library/useLibraryPlayback";
import { SimilarScreen, SIMILAR_LIMIT } from "./SimilarScreen";
import { SIMILAR_COLUMNS, SIMILAR_TABLE_LAYOUT_KEY } from "./similarColumns";
import { SIMILAR_ROUTE, entityPath, similarPath } from "./discoverLinks";
import { consideredLine } from "./entityFormat";
import { describeUnused, matchBand } from "./similarReasons";
import pages from "./discoverPages.fixture.json";

const LOADED = { timeout: 3000 };

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
let player: Record<string, Fn>;

const SIMILAR = pages.similar as unknown as DiscoverAnswer<SimilarTracks>;
const DETAILS = pages.similar_details as unknown as Record<string, LibraryTrackDetail>;
const SEED = pages.detail_resolved as unknown as LibraryTrackDetail;

/** Every track's detail: the seed's, its suggestions', and an untimed one. */
function detail(trackId: number): LibraryTrackDetail {
  if (trackId === SEED.track.id) return SEED;
  const known = DETAILS[String(trackId)];
  if (known) return known;
  if (trackId === 7) {
    return { ...SEED, track: { ...SEED.track, id: 7, title: "Untimed", bpm: null, key: null } };
  }
  throw new Error(`No track with id ${trackId}`);
}

function install(overrides: Record<string, unknown> = {}) {
  player = {
    playView: vi.fn().mockResolvedValue({ ok: true }),
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue(undefined),
  };
  bridge = {
    getSimilarTracks: vi.fn(async ({ track_id }: { track_id: number }) => {
      if (track_id === 999) return pages.similar_gone;
      if (track_id === 7) return pages.similar_no_bpm;
      return SIMILAR;
    }),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detail(trackId)),
    player,
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function mock(name: string): Fn {
  return bridge[name] as Fn;
}

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function renderAt(path: string) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={SIMILAR_ROUTE} element={<SimilarScreen />} />
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

/** Escape out of every open menu and submenu. */
function closeMenus() {
  for (let guard = 0; guard < 5 && screen.queryAllByRole("menu").length > 0; guard += 1) {
    fireEvent.keyDown(screen.getAllByRole("menu").at(-1)!, { key: "Escape" });
  }
}

function table() {
  return screen.getByRole("table", { name: "Similar tracks" });
}

function rowOf(text: string): HTMLElement {
  return within(table()).getByText(text).closest("[role=row]") as HTMLElement;
}

/** The suggestions' titles, in the answer's order. */
const TITLES = SIMILAR.value!.suggestions.map(
  (entry) => DETAILS[String(entry.track_id)].track.title,
);

async function listed() {
  await screen.findByRole("heading", { level: 1, name: SEED.track.title }, LOADED);
  await within(table()).findByText(TITLES[0], {}, LOADED);
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
  setSelectedTrack(null);
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the seed and its suggestions", () => {
  it("treats the seed's title as data that shrinks before the actions (M190)", async () => {
    renderAt(similarPath(1));
    await listed();
    const title = screen.getByRole("heading", { level: 1, name: SEED.track.title });
    const header = title.closest("header") as HTMLElement;
    expect(header.querySelector(".cp-screen-header__title--data, .cp-screen-header__display--data")).not.toBeNull();
  });

  it("asks for the seed's suggestions and reads each row through the track-detail path", async () => {
    renderAt(similarPath(1));
    await listed();
    expect(mock("getSimilarTracks")).toHaveBeenCalledWith({ track_id: 1, limit: SIMILAR_LIMIT });
    for (const entry of SIMILAR.value!.suggestions) {
      expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: entry.track_id });
    }
  });

  it("draws the suggestions best first, each with short reason columns and a fit bar (R4-8)", async () => {
    renderAt(similarPath(1));
    await listed();
    const rows = [...table().querySelectorAll('.track-table__row [data-column="title"]')].map(
      (cell) => cell.textContent,
    );
    expect(rows).toEqual(TITLES);
    const [best] = SIMILAR.value!.suggestions;
    const cell = (row: HTMLElement, id: string) =>
      row.querySelector(`[data-column="${id}"]`) as HTMLElement;

    const first = rowOf(TITLES[0]);
    expect(cell(first, "key")).toHaveTextContent(/^9A.*\+1$/);
    expect(cell(first, "key").querySelector("[title]")).toHaveAttribute(
      "title",
      "Mixes well (next key): 8A → 9A",
    );
    expect(cell(first, "bpm_delta")).toHaveTextContent("±0");
    // A drawn check mark, not a typed one (C138).
    expect(cell(first, "genre_shared").querySelector('[data-icon="check"]')).not.toBeNull();
    expect(cell(first, "genre_shared").textContent).not.toContain("✓");
    expect(within(cell(first, "genre_shared")).getByText("Same genre")).toHaveClass("track-table__sr-only");
    expect(within(cell(first, "label_shared")).getByText("Same label")).toHaveClass("track-table__sr-only");
    expect(within(cell(first, "artist_shared")).getByText("Same artist")).toHaveClass("track-table__sr-only");
    expect(within(first).getByRole("img", { name: `Fit ${best.score} out of 100` })).toHaveAttribute(
      "title",
      `Strong: Score ${best.score} out of 100`,
    );
    // The word and the sentence are gone from the cells; the sentence is in the hints.
    expect(first).not.toHaveTextContent("Strong");
    expect(first).not.toHaveTextContent("Mixes well");

    const second = rowOf(TITLES[1]);
    expect(cell(second, "key")).toHaveTextContent(/^8A.*same$/);
    expect(cell(second, "bpm_delta")).toHaveTextContent("0.5×");
    // Nothing shared is the dash every empty cell shows (C73).
    expect(cell(second, "genre_shared")).toHaveTextContent(/^—$/);
    expect(cell(second, "label_shared")).toHaveTextContent(/^—$/);
    expect(within(cell(second, "artist_shared")).getByText("Same artist")).toBeInTheDocument();

    expect(cell(rowOf(TITLES[2]), "key")).toHaveTextContent(/^8B.*rel\.$/);
    expect(cell(rowOf(TITLES[2]), "bpm_delta")).toHaveTextContent("+4");
    expect(cell(rowOf(TITLES[4]), "key")).toHaveTextContent("3A");
    expect(cell(rowOf(TITLES[4]), "key")).not.toHaveTextContent(/same|rel|next|[+−]1/);
  });

  it("names the fit column Fit, and says what the list is", async () => {
    renderAt(similarPath(1));
    await listed();
    const headers = [...table().querySelectorAll('[role="columnheader"]')].map(
      (cell) => cell.textContent,
    );
    // Spelled out, with check marks (C79, C138); Title and Artist lead, then Key, BPM and Genre (C70).
    expect(headers.slice(0, 5)).toEqual(["Title", "Artist", "Key", "BPM", "Genre"]);
    expect(headers).toEqual(
      expect.arrayContaining(["BPM change", "Same genre", "Same label", "Same artist", "Fit"]),
    );
    expect(headers).not.toContain("Reasons");
    expect(headers).not.toContain("Match");
    expect(headers).not.toContain("Score");
    expect(
      screen.queryByText("Tracks from your library that would mix well after this one."),
    ).toBeNull();
    const bands = SIMILAR.value!.suggestions.map((entry) => matchBand(entry.score));
    expect(bands).toEqual(["Strong", "Strong", "Good", "Some", "Some"]);
  });

  it("says what the seed is and what it was compared with", async () => {
    renderAt(similarPath(1));
    await listed();
    const header = document.querySelector(".discover-page__header") as HTMLElement;
    // The seed's facts are the page header's facts line.
    expect(screen.getByText(/ similar tracks? · 124 BPM · 8A · House$/)).toBeInTheDocument();
    expect(within(header).getByText(consideredLine(SIMILAR.value!))).toBeInTheDocument();
    fireEvent.click(within(header).getByRole("button", { name: "Mara Veil" }));
    expect(where()).toBe(entityPath("artist", "bp:301001"));
  });

  it("says what a seed with no tempo or key could not be compared by", async () => {
    renderAt(similarPath(7));
    await screen.findByRole("heading", { level: 1, name: "Untimed" }, LOADED);
    const unused = (pages.similar_no_bpm as unknown as DiscoverAnswer<SimilarTracks>).value!.unused;
    expect(screen.getByText(describeUnused(unused)!)).toBeInTheDocument();
  });

  it("says so when nothing is close enough", async () => {
    mock("getSimilarTracks").mockResolvedValue(pages.similar_none);
    renderAt(similarPath(1));
    expect(
      await screen.findByText("Nothing in your library is close enough to suggest", {}, LOADED),
    ).toBeInTheDocument();
    expect(screen.getByText(/^0 similar tracks/)).toBeInTheDocument();
  });

  it("says when the index is still being built", async () => {
    mock("getSimilarTracks").mockResolvedValue({
      value: { ...SIMILAR.value!, index_current: false },
      refusal: null,
    });
    renderAt(similarPath(1));
    expect(await screen.findByText(/shared artists may be missing/, {}, LOADED)).toBeInTheDocument();
  });

  it("says why when the seed is gone, or the address names no track", async () => {
    const view = renderAt(similarPath(999));
    expect(await screen.findByText("Similar tracks could not open", {}, LOADED)).toBeInTheDocument();
    expect(
      screen.getByText((pages.similar_gone as { refusal: { message: string } }).refusal.message),
    ).toBeInTheDocument();
    view.unmount();
    renderAt("/discover/similar/abc");
    expect(await screen.findByText("This address names no track.", {}, LOADED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("leaves out a suggestion whose track is gone by the time its row is read", async () => {
    const gone = SIMILAR.value!.suggestions[1].track_id;
    mock("getLibraryTrack").mockImplementation(async ({ trackId }: { trackId: number }) => {
      if (trackId === gone) throw new Error("No track");
      return detail(trackId);
    });
    renderAt(similarPath(1));
    await listed();
    expect(within(table()).queryByText(TITLES[1])).toBeNull();
    expect(screen.getByText(new RegExp(`^${TITLES.length - 1} similar tracks`))).toBeInTheDocument();
  });
});

describe("suggestions are library rows (DEC-012, DEC-013)", () => {
  const items = () =>
    SIMILAR.value!.suggestions.map((entry) => toQueueItem(DETAILS[String(entry.track_id)].track));

  it("plays the list from the row double-clicked", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.doubleClick(within(table()).getByText(TITLES[2]));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledWith(items(), 2));
  });

  it("sorts in the table, and plays from the row it shows, with the sorted list behind it (C193)", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByRole("button", { name: "Title" }));
    const byTitle = [...items()].sort((a, b) =>
      String(a.title).localeCompare(String(b.title), undefined, { numeric: true, sensitivity: "base" }),
    );
    const shown = [...table().querySelectorAll('[role="row"][data-index]')].map(
      (row) => row.querySelector('[data-column="title"]')?.textContent,
    );
    expect(shown.slice(0, 3)).toEqual(byTitle.slice(0, 3).map((item) => item.title));
    fireEvent.doubleClick(within(table()).getByText(String(byTitle[1]!.title)));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledWith(byTitle, 1));
    // The sort is remembered with the layout, and never an engine key.
    expect(JSON.parse(localStorage.getItem("cuepoint-discover-similar-layout-v2") ?? "{}").sort).toEqual({
      key: "title",
      direction: "asc",
    });
  });

  it("names Discover in the crumb by default, and opens the Library from the header (C221, C11)", async () => {
    renderAt(similarPath(1));
    await listed();
    const crumb = screen.getByRole("navigation", { name: "Where this page was opened from" });
    expect(crumb).toHaveTextContent("Discover");
    expect(crumb).toHaveTextContent("Similar tracks");
    const header = screen.getByRole("heading", { level: 1 }).closest("header") as HTMLElement;
    expect(within(header).getByRole("button", { name: "Open in Library" })).toBeInTheDocument();
    fireEvent.click(within(crumb).getByRole("button", { name: "Discover" }));
    expect(where()).toBe("/discover");
  });

  it("queues from the menu without interrupting", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.contextMenu(rowOf(TITLES[1]), { clientX: 10, clientY: 10 });
    let menu = await screen.findByRole("menu", {}, LOADED);
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      expect.stringMatching(/^More/),
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Play next" }));
    await waitFor(() => expect(player.playNext).toHaveBeenCalledWith([items()[1]]));
    expect(await screen.findByText("1 track queued to play next", {}, LOADED)).toBeInTheDocument();

    fireEvent.contextMenu(rowOf(TITLES[1]), { clientX: 10, clientY: 10 });
    menu = await screen.findByRole("menu", {}, LOADED);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Add to queue" }));
    await waitFor(() => expect(player.addToQueue).toHaveBeenCalledWith([items()[1]]));
    expect(player.playQueue).not.toHaveBeenCalled();
  });

  it("shows the selection bar only with a selection: Play, More and the selected-count button (DEC-209)", async () => {
    renderAt(similarPath(1));
    await listed();
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    // Play and More only: Organize is the Library's, Beatport is Clean's.
    const names = within(bar).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["", "Play", "More"]);
    expect(bar).toHaveTextContent("1 selected");
    expect(screen.queryByRole("button", { name: "Actions…" })).toBeNull();
    expect(within(bar).getByRole("button", { name: "Play" })).not.toHaveAttribute("aria-disabled");
  });

  it("has a visible Select all and a count in the heading row, as the Library half has (C215)", async () => {
    renderAt(similarPath(1));
    await listed();
    const head = screen.getByRole("heading", { name: "Similar tracks", level: 2 }).parentElement!;
    expect(within(head).getByRole("status")).toHaveTextContent(
      `${SIMILAR.value!.suggestions.length} tracks`,
    );
    fireEvent.click(within(head).getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent(
      `${SIMILAR.value!.suggestions.length} selected`,
    );
  });

  it("plays a selection as the queue, from the bar's Play too", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    fireEvent.click(within(table()).getByText(TITLES[3]), { ctrlKey: true });
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Selection" })).getByRole("button", { name: "Play" }));
    const menu = await screen.findByRole("menu", {}, LOADED);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Play 2 tracks" }));
    await waitFor(() =>
      expect(player.playQueue).toHaveBeenCalledWith([items()[0], items()[3]], 0),
    );
  });

  it("makes a suggestion the next seed", async () => {
    renderAt(similarPath(1));
    await listed();
    const next = SIMILAR.value!.suggestions[0].track_id;
    fireEvent.contextMenu(rowOf(TITLES[0]), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole("menu", {}, LOADED);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /^More/ }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "More" })).getByRole("menuitem", { name: "Similar tracks" }));
    expect(where()).toBe(similarPath(next));
    await waitFor(() =>
      expect(mock("getSimilarTracks")).toHaveBeenLastCalledWith({
        track_id: next,
        limit: SIMILAR_LIMIT,
      }),
    );
  });

  it("opens a suggestion's label page", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.contextMenu(rowOf(TITLES[0]), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole("menu", {}, LOADED);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /^More/ }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "More" })).getByRole("menuitem", { name: "Label page" }));
    const label = DETAILS[String(SIMILAR.value!.suggestions[0].track_id)].credits!.label!;
    expect(where()).toBe(entityPath("label", label.ref));
  });
});

describe("the selected track (DEC-157)", () => {
  it("is the suggestion clicked, with its key, and nothing once it is let go", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[1]));
    const track = DETAILS[String(SIMILAR.value!.suggestions[1].track_id)].track;
    expect(getSelectedTrack()).toEqual({ id: track.id, key: track.effective_key });
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(getSelectedTrack()).toBeNull();
  });

  it("is let go when the page is", async () => {
    const view = renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    expect(getSelectedTrack()).not.toBeNull();
    view.unmount();
    expect(getSelectedTrack()).toBeNull();
  });
});

describe("the Inspector on Similar tracks", () => {
  it("describes the seed, then the suggestion clicked", async () => {
    renderAt(similarPath(1));
    await listed();
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(
      await within(inspector).findByRole("heading", { name: SEED.track.title }, LOADED),
    ).toBeInTheDocument();
    fireEvent.click(within(table()).getByText(TITLES[1]));
    expect(
      await within(inspector).findByRole("heading", { name: TITLES[1] }, LOADED),
    ).toBeInTheDocument();
  });

  it("shows the same groups in the right-click menu as in the bar, for one row and for several (FLW-8)", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[1]));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    const barNames = within(bar)
      .getAllByRole("button")
      .filter((button) => button.textContent)
      .map((button) => button.textContent!.replace(" ▸", ""));
    const entriesOf = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent!);

    for (const picked of [[0], [0, 3]]) {
      fireEvent.click(within(table()).getByText(TITLES[picked[0]]));
      if (picked.length > 1) fireEvent.click(within(table()).getByText(TITLES[picked[1]]), { ctrlKey: true });

      // The menu: Play's entries, then a submenu for each of the bar's other groups.
      fireEvent.contextMenu(rowOf(TITLES[picked[0]]), { clientX: 10, clientY: 10 });
      const menu = await screen.findByRole("menu", {}, LOADED);
      const top = entriesOf(menu).map((name) => name.replace(/\s*▸$/, "").trim());
      const groups = barNames.filter((name) => name !== "Play" && !name.includes("selected"));
      expect(top.slice(-groups.length)).toEqual(groups);
      const inMenu: Record<string, string[]> = { Play: top.slice(0, top.length - groups.length) };
      for (const group of groups) {
        await userEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${group}`) }));
        inMenu[group] = entriesOf(await screen.findByRole("menu", { name: group }));
      }
      closeMenus();

      // Each bar button opens the same entries.
      for (const group of ["Play", ...groups]) {
        fireEvent.click(within(screen.getByRole("toolbar", { name: "Selection" })).getByRole("button", { name: group }));
        const opened = await screen.findByRole("menu", { name: group }, LOADED);
        expect(entriesOf(opened)).toEqual(inMenu[group]);
        closeMenus();
      }
    }
  });

  function openedWith() {
    const state = JSON.parse(screen.getByTestId("where").dataset.state ?? "null");
    return libraryOpening({ state, key: "k" });
  }

  it("opens the Library on the seed and every suggestion when none is selected", async () => {
    renderAt(similarPath(1));
    await listed();
    const button = screen.getByRole("button", { name: "Open in Library" });
    expect(button).toHaveAttribute("title", "Opens these 6 tracks in the Library");
    fireEvent.click(button);
    expect(where()).toBe("/library");
    const ids = SIMILAR.value!.suggestions.map((entry) => entry.track_id);
    expect(openedWith()?.rules.rules).toEqual([
      { field: "track", operator: "any_of", value: [SEED.track.id, ...ids] },
    ]);
    expect(Object.values(openedWith()?.names ?? {})).toEqual([
      `Similar to “${SEED.track.title}” (6 tracks)`,
    ]);
  });

  it("opens the Library on the seed and only the selected suggestions", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    fireEvent.click(within(table()).getByText(TITLES[2]), { ctrlKey: true });
    const button = screen.getByRole("button", { name: "Open in Library" });
    expect(button).toHaveAttribute(
      "title",
      `Opens the 2 selected tracks and “${SEED.track.title}” in the Library`,
    );
    fireEvent.click(button);
    const ids = SIMILAR.value!.suggestions.map((entry) => entry.track_id);
    expect(openedWith()?.rules.rules[0].value).toEqual([SEED.track.id, ids[0], ids[2]]);
  });
});

describe("the Key column keeps the Library's key cell (R4-8)", () => {
  const keyCell = (extra: Record<string, unknown>, relation = true) => {
    const column = SIMILAR_COLUMNS.find((c) => c.id === "key")!;
    const row = {
      id: 1,
      effective_key: "9A",
      suggestion: {
        track_id: 1,
        score: 80,
        reasons: relation
          ? [{ component: "key", detail: "same", points: 1, from: "9A", to: "9A" }]
          : [],
      },
      ...extra,
    };
    return render(<>{column.render(row as never)}</>);
  };

  it("shows a dash for a track with no key, and the hint says why", () => {
    const { container } = keyCell({ effective_key: "" }, false);
    expect(container).toHaveTextContent("—");
    expect(SIMILAR_COLUMNS.find((c) => c.id === "key")!.hint).toContain("Keys come from Beatport matches");
  });

  it("marks a key the user corrected, beside the relation", () => {
    const { container } = keyCell({ overridden: ["key"], override_sources: { key: "cuepoint" } });
    expect(container.querySelector(".library-cell__mark")).not.toBeNull();
    expect(container).toHaveTextContent("9A");
    expect(container).toHaveTextContent("same");
  });

  it("has a new layout key, so the old order is left behind once", () => {
    expect(SIMILAR_TABLE_LAYOUT_KEY).toBe("cuepoint-discover-similar-layout-v2");
  });
});
