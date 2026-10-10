/**
 * Similar tracks (DISCOVER-11, DEC-096).
 *
 * Over the engine's own answers (`discoverPages.fixture.json`): a seed with a
 * tempo, one without, one with nothing near it, and one gone.
 * - suggestions are drawn in the engine's order with their reasons in words;
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
import { SIMILAR_ROUTE, entityPath, similarPath } from "./discoverLinks";
import { consideredLine } from "./entityFormat";
import { reasonsText } from "./similarColumns";
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
  it("asks for the seed's suggestions and reads each row through the track-detail path", async () => {
    renderAt(similarPath(1));
    await listed();
    expect(mock("getSimilarTracks")).toHaveBeenCalledWith({ track_id: 1, limit: SIMILAR_LIMIT });
    for (const entry of SIMILAR.value!.suggestions) {
      expect(mock("getLibraryTrack")).toHaveBeenCalledWith({ trackId: entry.track_id });
    }
  });

  it("draws the suggestions best first, each with its match and its reasons in words", async () => {
    renderAt(similarPath(1));
    await listed();
    const rows = [...table().querySelectorAll('.track-table__row [data-column="title"]')].map(
      (cell) => cell.textContent,
    );
    expect(rows).toEqual(TITLES);
    const [best] = SIMILAR.value!.suggestions;
    const first = rowOf(TITLES[0]);
    expect(first).toHaveTextContent(reasonsText(best.reasons));
    expect(first).toHaveTextContent("Strong");
    expect(first).toHaveTextContent("Mixes well (next key): 8A → 9A");
    // The number is in the tooltip, not a bare column of figures (DSC-10).
    expect(within(first).getByText(matchBand(best.score))).toHaveAttribute(
      "title",
      `Score ${best.score} out of 100`,
    );
    expect(first).not.toHaveTextContent(String(best.score));
  });

  it("names the match column Match, and says what the list is", async () => {
    renderAt(similarPath(1));
    await listed();
    const headers = [...table().querySelectorAll('[role="columnheader"]')].map(
      (cell) => cell.textContent,
    );
    expect(headers).toContain("Match");
    expect(headers).not.toContain("Score");
    expect(
      screen.getByText("Tracks from your library that would mix well after this one."),
    ).toBeInTheDocument();
    const bands = SIMILAR.value!.suggestions.map((entry) => matchBand(entry.score));
    expect(bands).toEqual(["Strong", "Strong", "Good", "Some", "Some"]);
  });

  it("says what the seed is and what it was compared with", async () => {
    renderAt(similarPath(1));
    await listed();
    const header = screen.getByRole("heading", { level: 1 }).closest("header") as HTMLElement;
    expect(within(header).getByText("124.0 BPM · 8A · House")).toBeInTheDocument();
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
      await screen.findByText("Nothing in your library is close enough to suggest.", {}, LOADED),
    ).toBeInTheDocument();
    expect(screen.getByText("0 tracks")).toBeInTheDocument();
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
    expect(screen.getByText(`${TITLES.length - 1} tracks`)).toBeInTheDocument();
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

  it("queues from the menu without interrupting", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.contextMenu(rowOf(TITLES[1]), { clientX: 10, clientY: 10 });
    let menu = await screen.findByRole("menu", {}, LOADED);
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      expect.stringMatching(/^Explore/),
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

  it("shows the selection bar always, disabled until something is selected (DEC-209)", async () => {
    renderAt(similarPath(1));
    await listed();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    // Play and Explore only: Organize is the Library's, Beatport and Fix are Clean's.
    const names = within(bar).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["Play ▸", "Explore ▸", "Clear selection"]);
    for (const name of ["Play", "Explore"]) {
      expect(within(bar).getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
      expect(within(bar).getByRole("button", { name })).toHaveAttribute("title", "Select tracks first");
    }
    expect(screen.queryByRole("button", { name: "Actions…" })).toBeNull();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    expect(within(bar).getByRole("button", { name: "Play" })).not.toHaveAttribute("aria-disabled");
  });

  it("plays a selection as the queue, from the bar's Play too", async () => {
    renderAt(similarPath(1));
    await listed();
    fireEvent.click(within(table()).getByText(TITLES[0]));
    fireEvent.click(within(table()).getByText(TITLES[3]), { ctrlKey: true });
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Selected tracks" })).getByRole("button", { name: "Play" }));
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
    await userEvent.click(within(menu).getByRole("menuitem", { name: /^Explore/ }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "Explore" })).getByRole("menuitem", { name: "Similar tracks" }));
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
    await userEvent.click(within(menu).getByRole("menuitem", { name: /^Explore/ }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "Explore" })).getByRole("menuitem", { name: "Label page" }));
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
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    const barNames = within(bar).getAllByRole("button").map((button) => button.textContent!.replace(" ▸", ""));
    const entriesOf = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent!);

    for (const picked of [[0], [0, 3]]) {
      fireEvent.click(within(table()).getByText(TITLES[picked[0]]));
      if (picked.length > 1) fireEvent.click(within(table()).getByText(TITLES[picked[1]]), { ctrlKey: true });

      // The menu: Play's entries, then a submenu for each of the bar's other groups.
      fireEvent.contextMenu(rowOf(TITLES[picked[0]]), { clientX: 10, clientY: 10 });
      const menu = await screen.findByRole("menu", {}, LOADED);
      const top = entriesOf(menu).map((name) => name.replace(/\s*▸$/, "").trim());
      const groups = barNames.filter((name) => name !== "Play" && name !== "Clear selection");
      expect(top.slice(-groups.length)).toEqual(groups);
      const inMenu: Record<string, string[]> = { Play: top.slice(0, top.length - groups.length) };
      for (const group of groups) {
        await userEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${group}`) }));
        inMenu[group] = entriesOf(await screen.findByRole("menu", { name: group }));
      }
      closeMenus();

      // Each bar button opens the same entries.
      for (const group of ["Play", ...groups]) {
        fireEvent.click(within(bar).getByRole("button", { name: group }));
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
