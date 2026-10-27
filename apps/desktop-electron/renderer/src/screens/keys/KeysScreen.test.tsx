/**
 * The Keys page (PAGES-16, FLW-21, DEC-200).
 *
 * The specification's component tests, against the real page over a faked
 * bridge: the source picker, the counts list in Camelot order, choosing one or
 * several keys, the compatible-keys light, and the Smart Collection the choice
 * saves. The counts are the engine's own answer (`getKeysPopulation`); the page
 * writes every one of them as text.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { menuItem } from "../library/menuPick.test.util";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  CollectionNode,
  KeySource,
  KeysPopulation,
  LibraryPlaylistNode,
  LibrarySearchResponse,
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { reportUnexpected } from "../../reporting/reporting";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { cleanMatchOpening } from "../clean/cleanLink";
import { libraryOpening } from "../library/libraryLink";
import { DEFAULT_LIBRARY_QUERY } from "../library/libraryQuery";
import { KeysScreen } from "./KeysScreen";
import type { KeysOpening } from "./keysLink";

vi.mock("../../reporting/reporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../reporting/reporting")>()),
  reportUnexpected: vi.fn(() => null),
}));

const LOADED = { timeout: 3000 };

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
const mock = (name: string) => bridge[name] as Fn;

const playlist = (
  id: number,
  name: string,
  parent: number | null,
  kind: "folder" | "playlist" = "playlist",
): LibraryPlaylistNode => ({
  id,
  parent_id: parent,
  name,
  kind,
  depth: parent === null ? 0 : 1,
  position: id,
  path: parent === null ? name : `Rekordbox/${name}`,
  track_count: 10,
});

const PLAYLISTS = [
  playlist(1, "Rekordbox", null, "folder"),
  playlist(2, "Warm-up", 1),
  playlist(3, "Peak time", 1),
];

const collection = (
  id: number,
  name: string,
  kind: CollectionNode["kind"],
  parent: number | null = null,
): CollectionNode => ({
  id,
  parent_id: parent,
  kind,
  name,
  position: id,
  depth: parent === null ? 0 : 1,
  rules: null,
  sort: null,
  dir: null,
  frozen_from_id: null,
  frozen_at: null,
  entry_count: 4,
  track_count: 4,
  broken: false,
  problem: null,
  created_at: "x",
  updated_at: "x",
});

const COLLECTIONS = [
  collection(10, "Box", "collection"),
  collection(11, "Friday", "set"),
  collection(12, "Sorted", "smart"),
];

const ALL: KeysPopulation = {
  total: 1500,
  keys: [
    { code: "8A", count: 12 },
    { code: "9A", count: 3 },
    { code: "10A", count: 5 },
    { code: "11B", count: 1234 },
  ],
  no_key: 246,
};

const PICKED: KeysPopulation = {
  total: 20,
  keys: [
    { code: "1B", count: 2 },
    { code: "8A", count: 9 },
    { code: "8B", count: 4 },
  ],
  no_key: 5,
};

function track(id: number, key: string | null): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: "A Label",
    genre: "Techno",
    key: "12B",
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
    effective_key: key,
    effective_bpm: 128,
    effective_genre: "Techno",
    effective_label: "A Label",
    effective_year: 2024,
    overridden: [],
    override_sources: {},
    match_state: "accepted",
    match_disputed: false,
    match_score: 96,
    file_status: "present",
    artwork: "none",
  };
}

const TRACKS = [track(1, "8A"), track(2, "8A"), track(3, "9A")];

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
    scope: null,
    collection_scope: null,
    collection_id: null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

function detail(id: number): LibraryTrackDetail {
  return {
    track: TRACKS[id - 1]!,
    playlists: [],
    playlist_count: 0,
    metadata: {
      track_id: id,
      rating: null,
      rekordbox_rating: null,
      effective_rating: null,
      rating_source: null,
      favorite: false,
      notes: null,
      created_at: null,
      updated_at: null,
    },
    tags: [],
    collections: [],
  } as unknown as LibraryTrackDetail;
}

function wheelFor(code: string) {
  const number = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  return {
    key: code,
    wheel: [
      { code, relation: "same" },
      { code: `${(number % 12) + 1}${letter}`, relation: "adjacent" },
      { code: `${((number + 10) % 12) + 1}${letter}`, relation: "adjacent" },
      { code: `${number}${letter === "A" ? "B" : "A"}`, relation: "relative" },
    ],
  };
}

function install(overrides: Record<string, unknown> = {}) {
  bridge = {
    getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: false, track_count: 1500 }),
    getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: PLAYLISTS, total: 3 }),
    getCollections: vi.fn().mockResolvedValue({ collections: COLLECTIONS, total: 3 }),
    getKeysPopulation: vi.fn(async ({ sources }: { sources: KeySource[] }) =>
      sources.some((source) => source.kind === "all") ? ALL : PICKED,
    ),
    getCompatibleKeys: vi.fn(async ({ key }: { key: string }) => wheelFor(key)),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => answer(params)),
    getLibraryFilterFields: vi.fn().mockResolvedValue({
      fields: [],
      operators: {},
      facetable: [],
      sortable: [],
    }),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detail(trackId)),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
    saveSmartCollection: vi.fn(async ({ name, rules }: { name: string; rules: unknown }) => ({
      collection: { ...collection(40, name, "smart"), rules },
    })),
    player: {
      playView: vi.fn().mockResolvedValue({ ok: true }),
      playQueue: vi.fn().mockResolvedValue({ ok: true }),
      playNext: vi.fn().mockResolvedValue(undefined),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function renderKeys(props: { openWith?: KeysOpening | null } = {}) {
  const tree = (extra: { openWith?: KeysOpening | null }) => (
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <MemoryRouter initialEntries={["/keys"]}>
            <KeysScreen {...extra} />
            <Where />
          </MemoryRouter>
          <aside aria-label="Inspector">
            <InspectorSlotOutlet />
          </aside>
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>
  );
  const view = render(tree(props));
  return { ...view, again: (extra: { openWith?: KeysOpening | null }) => view.rerender(tree(extra)) };
}

const sourcesPanel = () => screen.getByRole("group", { name: "Sources" });
const countsList = () => screen.getByRole("group", { name: "Keys in these sources" });
const wheel = () => screen.getByRole("group", { name: "Keys" });
const rowButton = (code: string) =>
  within(countsList()).getByRole("button", { name: new RegExp(`^${code},`) });
const showWheel = () => fireEvent.click(screen.getByRole("tab", { name: "Wheel" }));
const showList = () => fireEvent.click(screen.getByRole("tab", { name: "List" }));
const caption = () => document.querySelector(".keys-page__caption") as HTMLElement;
const trackToolbar = () => screen.getByRole("toolbar", { name: "Track list" });
const whichTracks = () => within(sourcesPanel()).getByRole("combobox", { name: "Which tracks" });
const findList = () => screen.findByRole("group", { name: "Keys in these sources" }, LOADED);
const where = () => screen.getByTestId("where");
const state = () => JSON.parse(where().getAttribute("data-state") ?? "null");

async function opened() {
  const list = await screen.findByRole("group", { name: "Keys in these sources" }, LOADED);
  await within(list).findByRole("button", { name: /^8A,/ }, LOADED);
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
  vi.mocked(reportUnexpected).mockClear();
  localStorage.clear();
  // The tests below read the list unless they ask for the wheel; the first visit shows the wheel.
  localStorage.setItem("cuepoint-keys-view", "list");
  install();
});

afterEach(() => {
  setSelectedTrack(null);
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the source picker", () => {
  it("writes the library's track count in the Which tracks choice", async () => {
    renderKeys();
    await opened();
    await waitFor(() =>
      expect(within(whichTracks()).getByRole("option", { name: "All tracks · 1,500" })).toBeInTheDocument(),
    );
  });

  it("chooses which tracks with the shared Select, its label inside the box, as Statistics does (C222)", async () => {
    renderKeys();
    await opened();
    expect(whichTracks().closest(".cp-select")).toHaveClass("cp-select--inline");
  });

  it("starts on the whole library and asks for its keys", async () => {
    renderKeys();
    await opened();
    expect(screen.getByRole("heading", { level: 1, name: "Keys" })).toBeInTheDocument();
    expect(whichTracks()).toHaveValue("whole");
    expect(mock("getKeysPopulation")).toHaveBeenCalledWith({ sources: [{ kind: "all" }] });
    expect(screen.getByText("1,500 tracks · All tracks")).toBeInTheDocument();
  });

  it("offers Rekordbox's playlists, the Collections and the Sets to tick", async () => {
    renderKeys();
    await opened();
    const panel = sourcesPanel();
    await within(panel).findByRole("checkbox", { name: "Warm-up" }, LOADED);
    expect(within(panel).getByRole("checkbox", { name: "Peak time" })).not.toBeChecked();
    expect(within(panel).getByRole("checkbox", { name: "Box" })).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: "Friday" })).toBeInTheDocument();
    // A Smart Collection holds a question, not tracks to count by kind.
    expect(within(panel).queryByRole("checkbox", { name: "Sorted" })).toBeNull();
    expect(within(panel).getByText("Collections")).toBeInTheDocument();
    expect(within(panel).getByText("Sets")).toBeInTheDocument();
  });

  it("ticks a Collections folder to tick everything under it, and dashes it while only some is (C40)", async () => {
    install({
      getCollections: vi.fn().mockResolvedValue({
        collections: [
          collection(50, "Crates", "folder"),
          collection(51, "Warm", "collection", 50),
          collection(52, "Late", "collection", 50),
        ],
        total: 3,
      }),
    });
    renderKeys();
    await opened();
    const panel = sourcesPanel();
    fireEvent.click(await within(panel).findByRole("checkbox", { name: "Warm" }, LOADED));
    await waitFor(() =>
      expect((within(panel).getByRole("checkbox", { name: "Crates" }) as HTMLInputElement).indeterminate).toBe(true),
    );
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Crates" }));
    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({
        sources: [
          { kind: "collection", id: 51 },
          { kind: "collection", id: 52 },
        ],
      }),
    );
    expect(within(panel).getByRole("checkbox", { name: "Crates" })).toBeChecked();
  });

  it("counts the ticked sources, and the Which tracks choice lets go of them", async () => {
    renderKeys();
    await opened();
    const panel = sourcesPanel();
    fireEvent.click(await within(panel).findByRole("checkbox", { name: "Warm-up" }, LOADED));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Friday" }));

    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({
        sources: [
          { kind: "playlist", id: 2 },
          { kind: "set", id: 11 },
        ],
      }),
    );
    expect(whichTracks()).toHaveValue("ticked");
    expect(await screen.findByText("20 tracks · 1 playlist and 1 Set")).toBeInTheDocument();
    expect(await within(countsList()).findByRole("button", { name: /^1B,/ })).toBeInTheDocument();

    fireEvent.change(whichTracks(), { target: { value: "whole" } });
    // The whole library's counts were read on opening and are still in the shared cache (C19d),
    // so going back to them shows them without asking again.
    expect(await screen.findByText("1,500 tracks · All tracks")).toBeInTheDocument();
    expect(within(panel).getByRole("checkbox", { name: "Warm-up" })).not.toBeChecked();
  });

  it("remembers the ticked sources under cuepoint-keys-sources", async () => {
    renderKeys();
    await opened();
    fireEvent.click(await within(sourcesPanel()).findByRole("checkbox", { name: "Peak time" }, LOADED));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("cuepoint-keys-sources")!)).toEqual([
        { kind: "playlist", id: 3 },
      ]),
    );
  });

  it("opens on what it remembered, and drops a source that has gone", async () => {
    localStorage.setItem(
      "cuepoint-keys-sources",
      JSON.stringify([
        { kind: "playlist", id: 2 },
        { kind: "playlist", id: 99 },
      ]),
    );
    renderKeys();
    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({
        sources: [{ kind: "playlist", id: 2 }],
      }),
    );
    expect(await within(sourcesPanel()).findByRole("checkbox", { name: "Warm-up" }, LOADED)).toBeChecked();
  });

  it("does not ask for a remembered source before the trees say it still exists", async () => {
    localStorage.setItem(
      "cuepoint-keys-sources",
      JSON.stringify([
        { kind: "playlist", id: 2 },
        { kind: "playlist", id: 99 },
      ]),
    );
    let release: (value: unknown) => void = () => undefined;
    install({
      getLibraryPlaylists: vi.fn(
        () => new Promise((resolve) => (release = resolve)),
      ),
    });
    renderKeys();
    await screen.findByText("Loading keys…");
    expect(mock("getKeysPopulation")).not.toHaveBeenCalled();
    release({ playlists: PLAYLISTS, total: 3 });
    await opened().catch(() => undefined);
    await waitFor(() => expect(mock("getKeysPopulation")).toHaveBeenCalled());
    for (const call of mock("getKeysPopulation").mock.calls) {
      expect(call[0]).toEqual({ sources: [{ kind: "playlist", id: 2 }] });
    }
  });

  it("prunes a source the engine says is gone and counts the rest, without a report", async () => {
    localStorage.setItem(
      "cuepoint-keys-sources",
      JSON.stringify([
        { kind: "playlist", id: 2 },
        { kind: "playlist", id: 3 },
      ]),
    );
    const gone = Object.assign(new Error("No playlist with id 3"), {
      status: 404,
      code: "SOURCE_NOT_FOUND",
    });
    install({
      getKeysPopulation: vi.fn(async ({ sources }: { sources: KeySource[] }) => {
        if (sources.some((source) => source.kind === "playlist" && source.id === 3)) throw gone;
        return PICKED;
      }),
    });
    renderKeys();
    await opened().catch(() => undefined);
    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({
        sources: [{ kind: "playlist", id: 2 }],
      }),
    );
    expect(await within(sourcesPanel()).findByRole("checkbox", { name: "Warm-up" }, LOADED)).toBeChecked();
    expect(within(sourcesPanel()).getByRole("checkbox", { name: "Peak time" })).not.toBeChecked();
    expect(screen.queryByText("The keys could not be counted")).toBeNull();
    expect(reportUnexpected).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("cuepoint-keys-sources")!)).toEqual([
      { kind: "playlist", id: 2 },
    ]);
  });

  it("opens on the sources it was sent, instead of what it remembered", async () => {
    localStorage.setItem("cuepoint-keys-sources", JSON.stringify([{ kind: "playlist", id: 2 }]));
    renderKeys({ openWith: { sources: [{ kind: "collection", id: 10 }], token: "nav-1" } });
    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({
        sources: [{ kind: "collection", id: 10 }],
      }),
    );
    expect(await within(sourcesPanel()).findByRole("checkbox", { name: "Box" }, LOADED)).toBeChecked();
    expect(within(sourcesPanel()).getByRole("checkbox", { name: "Warm-up" })).not.toBeChecked();
  });
});

describe("the counts", () => {
  it("lists the keys in Camelot order, each with its count written beside a bar", async () => {
    renderKeys();
    await opened();
    const rows = within(countsList()).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^8A.*12$/),
      expect.stringMatching(/^9A.*3$/),
      expect.stringMatching(/^10A.*5$/),
      expect.stringMatching(/^11B.*1,234$/),
      // One more row, drawn like the others (C258).
      expect.stringMatching(/^—no key.*246$/),
    ]);
    expect(rowButton("8A").querySelector("[data-bar]")).not.toBeNull();
    expect(rowButton("11B").querySelector("[data-bar]")).toHaveAttribute("data-percent", "100");
  });

  it("ends the list with '— no key  N' as one more row, not a lone line under a rule (C258)", async () => {
    renderKeys();
    await opened();
    const none = within(countsList()).getByRole("button", { name: "No Beatport key: 246" });
    expect(none.parentElement).toHaveAttribute("data-line", "no-key");
    expect(none).toHaveClass("keys-counts__row");
    expect(none.closest("li")).toBe(countsList().querySelector("li:last-child"));
    expect(none).toHaveTextContent("—no key246");
  });

  it("writes the counts on the wheel's segments, in the same numbers", async () => {
    renderKeys();
    await opened();
    showWheel();
    expect(wheel().querySelector('[data-label-for="8A"]')).toHaveTextContent("8A12");
    expect(wheel().querySelector('[data-label-for="1A"]')).toHaveTextContent("1A0");
    expect(wheel().querySelector('[data-shape="11B"]')).toHaveAttribute("data-level");
  });

  it("writes every count as text, so none depends on hovering", async () => {
    renderKeys();
    await opened();
    for (const entry of ALL.keys) {
      expect(rowButton(entry.code)).toHaveTextContent(entry.count.toLocaleString());
    }
  });
});

describe("the Wheel | List switch (K15)", () => {
  const tab = (name: "Wheel" | "List") => screen.getByRole("tab", { name });

  it("sits in the track list's toolbar, so nothing moves when it is used (D12, C249)", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    const bar = trackToolbar();
    expect(bar).toHaveClass("cp-toolbar");
    expect(within(bar).getByRole("tab", { name: "Wheel" })).toBeInTheDocument();
    expect(within(bar).getByRole("tab", { name: "List" })).toBeInTheDocument();
    // The view's own box is not a second place for the switch: the one tablist is the toolbar's (P33).
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(within(bar).getByRole("tablist")).toHaveClass("cp-tabs--sub");
  });

  it("is visible above the counts, one view at a time, on the wheel at first", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    expect(tab("Wheel")).toHaveAttribute("aria-selected", "true");
    expect(tab("List")).toHaveAttribute("aria-selected", "false");
    expect(wheel()).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Keys in these sources" })).not.toBeInTheDocument();
  });

  it("switches to the list, which takes the wheel's place, and back", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);

    showList();
    expect(tab("List")).toHaveAttribute("aria-selected", "true");
    expect(countsList()).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Keys" })).not.toBeInTheDocument();
    expect(rowButton("8A")).toHaveTextContent("12");

    showWheel();
    expect(wheel()).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Keys in these sources" })).not.toBeInTheDocument();
  });

  it("names each wheel segment with its count, so the wheel reads without the list", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    expect(within(wheel()).getByRole("button", { name: /^8A, .*12 tracks/ })).toBeInTheDocument();
    expect(within(wheel()).getByRole("button", { name: /^1A, .*no tracks/ })).toBeInTheDocument();
  });

  it("remembers the choice under cuepoint-keys-view and opens on it next time", async () => {
    localStorage.clear();
    const first = renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    showList();
    expect(localStorage.getItem("cuepoint-keys-view")).toBe("list");
    first.unmount();

    renderKeys();
    await findList();
    expect(tab("List")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("group", { name: "Keys" })).not.toBeInTheDocument();
    showWheel();
    expect(localStorage.getItem("cuepoint-keys-view")).toBe("wheel");
  });

  it("keeps 'No Beatport key: N' as a button in the wheel view too", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    const none = screen.getByRole("button", { name: "No Beatport key: 246" });
    expect(none).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(none);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "No Beatport key: 246" })).toHaveAttribute("aria-pressed", "true"),
    );
    // Drawn once: the list does not add a second one.
    showList();
    expect(screen.getAllByRole("button", { name: "No Beatport key: 246" })).toHaveLength(1);
  });

  it("writes each key in the list as the Library's key chip", async () => {
    renderKeys();
    await opened();
    const chip = rowButton("8A").querySelector(".key-chip");
    expect(chip).toHaveClass("key-chip--8A");
    expect(chip).toHaveTextContent("8A");
  });

  it("keeps the key chosen when the view changes", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("9A"));
    showWheel();
    expect(within(wheel()).getByRole("button", { name: /^9A,/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("still works when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    showList();
    expect(countsList()).toBeInTheDocument();
    fireEvent.click(rowButton("8A"));
    expect(rowButton("8A")).toHaveAttribute("aria-pressed", "true");
    showWheel();
    expect(wheel()).toBeInTheDocument();
  });

  it("keeps the list one click away, with every count written, whichever view is open", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    showList();
    for (const entry of ALL.keys) {
      expect(rowButton(entry.code)).toHaveTextContent(entry.count.toLocaleString());
    }
    expect(within(countsList()).getByRole("button", { name: "No Beatport key: 246" })).toBeInTheDocument();
  });
});

describe("choosing keys", () => {
  it("lists the tracks in a key when it is clicked, in an ordinary track table", async () => {
    renderKeys();
    await opened();
    // With no key picked the list already shows every track in the sources, and the caption asks.
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    expect(await within(table).findByText("Track 1")).toBeInTheDocument();
    expect(screen.getByText("Pick a key")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tracks" })).toBeInTheDocument();
    expect((mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any }).filters?.rules ?? []).toEqual([]);

    fireEvent.click(rowButton("8A"));

    await waitFor(() => expect(caption()).toHaveTextContent("8A A minor · 12 tracks"));
    expect(caption().querySelector(".key-chip--8A")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Tracks in 8A" })).toBeInTheDocument();
    expect(rowButton("8A")).toHaveAttribute("aria-pressed", "true");
    const last = mock("browseLibrary").mock.calls.at(-1)![0] as {
      filters: unknown;
      sort: string;
      dir: string;
    };
    expect(last.filters).toEqual({
      match: "all",
      rules: [{ field: "key", operator: "is", value: "8A" }],
    });
    // The order Open in Library opens on.
    expect({ sort: last.sort, dir: last.dir }).toEqual({
      sort: DEFAULT_LIBRARY_QUERY.sort,
      dir: DEFAULT_LIBRARY_QUERY.dir,
    });
  });

  it("filters the list at once and never scrolls the page: the tracks are already beside the wheel", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderKeys();
      await opened();
      fireEvent.click(rowButton("8A"));
      await waitFor(() => {
        const last = mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any };
        expect(last.filters.rules).toEqual([{ field: "key", operator: "is", value: "8A" }]);
      });
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("puts Sources, the wheel and the tracks side by side in that order, the tracks after the wheel (D12)", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    const sources = sourcesPanel();
    const tracks = trackToolbar();
    const follows = (a: Element, b: Element) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(sources, wheel())).toBeTruthy();
    expect(follows(wheel(), tracks)).toBeTruthy();
    expect(sources.closest(".keys-page__top")).toBe(tracks.closest(".keys-page__top"));
  });

  it("counts the tracks in the toolbar and links to the Library from it, as a go-to link (C80, C11)", async () => {
    renderKeys();
    await opened();
    await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    const bar = trackToolbar();
    await waitFor(() => expect(within(bar).getByText("3 tracks")).toBeInTheDocument());
    const link = within(bar).getByRole("button", { name: "Open in Library" });
    expect(link).toHaveClass("cp-link", "cp-link--go");
  });

  it("folds Select all and Open in Library into one ••• menu when the count would be cut (item 3)", async () => {
    // A pane too narrow for the toolbar: the count's text is wider than the room it is given.
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("keys-tracks__count") ? 80 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("keys-tracks__count") ? 30 : 300;
    });
    try {
      renderKeys();
      await opened();
      fireEvent.click(await within(await findList()).findByRole("button", { name: /^8A,/ }, LOADED));
      await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
      const bar = trackToolbar();
      const more = await within(bar).findByRole("button", { name: "More actions for these tracks" });
      expect(within(bar).queryByRole("button", { name: "Open in Library" })).toBeNull();
      expect(within(bar).queryByRole("button", { name: "Select all" })).toBeNull();
      fireEvent.click(more);
      const menu = await screen.findByRole("menu", { name: "Track list" });
      expect(within(menu).getByRole("menuitem", { name: "Select all" })).toBeInTheDocument();
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Open in Library" }));
      expect(where()).toHaveTextContent("/library");
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it("selects the row that is right-clicked first, so the menu acts on what is marked (C183)", async () => {
    renderKeys();
    await opened();
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    const row = async (title: string) => (await within(table).findByText(title)).closest("[role=row]")!;
    fireEvent.click(await row("Track 1"));
    fireEvent.click(await row("Track 2"), { ctrlKey: true });
    fireEvent.contextMenu(await row("Track 3"), { clientX: 100, clientY: 100 });
    expect(await screen.findByRole("menu", { name: "Track actions" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: /Actions for 2 tracks/ })).toBeNull();
  });

  it("chooses with a click on the wheel as well", async () => {
    renderKeys();
    await opened();
    showWheel();
    fireEvent.click(within(wheel()).getByRole("button", { name: /^9A,/ }));
    await waitFor(() =>
      expect(within(wheel()).getByRole("button", { name: /^9A,/ })).toHaveAttribute("aria-pressed", "true"),
    );
    showList();
    expect(rowButton("9A")).toHaveAttribute("aria-pressed", "true");
  });

  it("adds a key with Ctrl and a run of keys with Shift, and lists them together", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    fireEvent.click(rowButton("11B"), { ctrlKey: true });
    await waitFor(() => {
      const last = mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any };
      expect(last.filters.rules[0]).toEqual({ field: "key", operator: "any_of", value: ["8A", "11B"] });
    });

    fireEvent.click(rowButton("9A"));
    fireEvent.click(rowButton("11B"), { shiftKey: true });
    await waitFor(() => {
      const last = mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any };
      expect(last.filters.rules[0].value).toEqual(["9A", "10A", "11B"]);
    });
    expect(caption()).toHaveTextContent(/^9A, 10A and 11B · /);
    expect(screen.getByRole("heading", { level: 2, name: "Tracks in 9A, 10A and 11B" })).toBeInTheDocument();
  });

  it("narrows the tracks to the ticked sources, playlists included", async () => {
    renderKeys();
    await opened();
    fireEvent.click(await within(sourcesPanel()).findByRole("checkbox", { name: "Warm-up" }, LOADED));
    fireEvent.click(within(sourcesPanel()).getByRole("checkbox", { name: "Friday" }));
    fireEvent.click(await within(await findList()).findByRole("button", { name: /^8A,/ }, LOADED));
    await waitFor(() => {
      const last = mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any };
      expect(last.filters.rules).toEqual([
        { field: "key", operator: "is", value: "8A" },
        {
          field: "in_playlist",
          operator: "any_of",
          value: [
            { kind: "playlist", id: 2 },
            { kind: "set", id: 11 },
          ],
        },
      ]);
    });
  });

  it("turns 'No Beatport key' off when no track is without a key, with the reason", async () => {
    install({
      getKeysPopulation: vi.fn().mockResolvedValue({ ...ALL, no_key: 0 }),
    });
    renderKeys();
    await opened();
    const none = screen.getByRole("button", { name: /^No Beatport key: 0/ });
    expect(none).toHaveAttribute("aria-disabled", "true");
    expect(none).toHaveAttribute("title", "Every track here has a key");
    fireEvent.click(none);
    expect(none).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Pick a key")).toBeInTheDocument();
  });

  it("lists the tracks with no key when 'No Beatport key' is chosen", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    fireEvent.click(within(countsList()).getByRole("button", { name: "No Beatport key: 246" }));
    await waitFor(() => {
      const last = mock("browseLibrary").mock.calls.at(-1)![0] as { filters: any };
      expect(last.filters.rules).toEqual([{ field: "key", operator: "is_empty" }]);
    });
    expect(rowButton("8A")).toHaveAttribute("aria-pressed", "false");
  });

  it("does not choose a key nothing is in", async () => {
    renderKeys();
    await opened();
    showWheel();
    fireEvent.click(within(wheel()).getByRole("button", { name: /^1A,/ }));
    expect(screen.getByText("Pick a key")).toBeInTheDocument();
  });

  it("hands the selected track's key to the header's wheel", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    const row = (await within(table).findByText("Track 3")).closest("[role=row]")!;
    fireEvent.click(row);
    await waitFor(() => expect(getSelectedTrack()).toMatchObject({ id: 3, key: "9A" }));
  });

  it("shows the shared selection bar over the table, with Play only (C215)", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    // The bar shows once a track is selected; before that there is no empty band.
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    expect(screen.queryByRole("toolbar", { name: "Selection" })).toBeNull();
    fireEvent.click((await within(table).findByText("Track 3")).closest("[role=row]")!);
    const bar = await screen.findByRole("toolbar", { name: "Selection" }, LOADED);
    // Over the table's bottom rows (option 1A): outside its scroll area, so it moves no row.
    expect(bar).toHaveClass("cp-selection-bar--overlay");
    expect(bar.closest(".track-table__bottom-bar")).not.toBeNull();
    expect(table.contains(bar)).toBe(false);
    expect(table.querySelector(".track-table__bottom-room")).not.toBeNull();
    // K15: only Play, the page's job, is on the bar; the rest stays in the right-click menu.
    expect(within(bar).getByRole("button", { name: /^Play/ })).toBeInTheDocument();
    for (const name of ["Organize", "Beatport", "More"]) {
      expect(within(bar).queryByRole("button", { name: new RegExp(`^${name}`) })).toBeNull();
    }
    expect(within(bar).getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
  });
});

describe("the Beatport and More entries (K4)", () => {
  it.each([
    ["Copy Beatport values…", "Copy Beatport values"],
    ["Edit values…", "Edit values"],
  ])("open %s in place, not on Clean", async (entry, title) => {
    install({
      applyBatch: vi.fn(),
      applyMatch: vi.fn(),
      setTrackOverrides: vi.fn().mockResolvedValue({}),
    });
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    const row = (await within(table).findByText("Track 3")).closest("[role=row]")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    await userEvent.click(await menuItem(entry, await screen.findByRole("menu")));
    expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
    expect(where()).toHaveTextContent("/keys");
  });

  it("applies an edit to the tracks picked, and reads the counts again", async () => {
    install({
      applyBatch: vi.fn().mockResolvedValue({
        applied: {
          batch_id: "b1",
          operation: "set_override",
          target: "BPM",
          total: 1,
          changed: 1,
          unchanged: 0,
          failed: 0,
          cancelled: false,
        },
      }),
      applyMatch: vi.fn(),
      setTrackOverrides: vi.fn().mockResolvedValue({}),
    });
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    const row = (await within(table).findByText("Track 3")).closest("[role=row]")!;
    const populations = mock("getKeysPopulation").mock.calls.length;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    await userEvent.click(await menuItem("Edit values…", await screen.findByRole("menu")));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "BPM value" }), { target: { value: "126" } });
    await userEvent.click(within(dialog).getByRole("button", { name: /^Change \d+ tracks?$/ }));
    // One row was right-clicked, so exactly that track is edited (one track: a direct edit).
    await waitFor(() =>
      expect(mock("setTrackOverrides")).toHaveBeenCalledWith(expect.objectContaining({ trackId: 3 })),
    );
    // The key counts are read again, not only the table.
    await waitFor(() => expect(mock("getKeysPopulation").mock.calls.length).toBeGreaterThan(populations));
  });
});

describe("revisiting the page (C19d)", () => {
  it("revisit shows the old value immediately and refetches after an announce", async () => {
    const first = renderKeys();
    await opened();
    first.unmount();

    const reads = () => ({
      summary: mock("getLibrarySummary").mock.calls.length,
      playlists: mock("getLibraryPlaylists").mock.calls.length,
      collections: mock("getCollections").mock.calls.length,
      population: mock("getKeysPopulation").mock.calls.length,
    });
    const before = reads();

    renderKeys();
    // The first render: the counts are already there, no "Loading keys…".
    expect(screen.queryByText("Loading keys…")).toBeNull();
    expect(within(countsList()).getByRole("button", { name: /^8A,/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads()).toEqual(before);

    mock("getKeysPopulation").mockResolvedValue({ ...ALL, keys: [{ code: "4A", count: 7 }] });
    act(() => announceLibraryChange());
    expect(await within(countsList()).findByRole("button", { name: /^4A,/ }, LOADED)).toBeInTheDocument();
    expect(reads()).toEqual({
      summary: before.summary + 1,
      playlists: before.playlists + 1,
      collections: before.collections + 1,
      population: before.population + 1,
    });
  });
});

describe("a failed read kept beside the old counts (C19d)", () => {
  it("is reported once, however many times the page is shown again", async () => {
    const broke = Object.assign(new Error("boom"), { status: 500, code: "INTERNAL" });
    install({
      getKeysPopulation: vi
        .fn()
        .mockResolvedValueOnce(ALL)
        .mockRejectedValueOnce(broke)
        // Shown again: the read on its way is slow, so the failure is still the cache's error.
        .mockImplementation(() => new Promise(() => {})),
    });
    const first = renderKeys();
    await opened();
    act(() => announceLibraryChange());
    await waitFor(() => expect(reportUnexpected).toHaveBeenCalledTimes(1));
    first.unmount();

    const again = renderKeys();
    expect(within(countsList()).getByRole("button", { name: /^8A,/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    again.unmount();
    renderKeys();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(reportUnexpected).toHaveBeenCalledTimes(1);
  });
});

describe("the keys that mix", () => {
  it("is disabled until a key is chosen, and says why", async () => {
    renderKeys();
    await opened();
    const button = screen.getByRole("button", { name: "Show keys that mix" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Select a key first");
  });

  it("lights the engine's compatible keys on the wheel and in the list, in words", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    fireEvent.click(screen.getByRole("button", { name: "Show keys that mix with 8A" }));

    await waitFor(() => expect(mock("getCompatibleKeys")).toHaveBeenCalledWith({ key: "8A" }));
    // Not by color alone: the list says it in words.
    await waitFor(() => expect(rowButton("9A")).toHaveTextContent("mixes with 8A"));
    expect(rowButton("11B")).not.toHaveTextContent("mixes");
    showWheel();
    expect(wheel().querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit", "adjacent");
    expect(wheel().querySelector('[data-shape="8B"]')).toHaveAttribute("data-lit", "relative");
    expect(screen.getByRole("button", { name: "Show keys that mix with 8A" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("puts the light out when pressed again", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    const button = screen.getByRole("button", { name: "Show keys that mix with 8A" });
    fireEvent.click(button);
    showWheel();
    await waitFor(() =>
      expect(wheel().querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit"),
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(wheel().querySelector('[data-shape="9A"]')).not.toHaveAttribute("data-lit"),
    );
    showList();
    expect(rowButton("9A")).not.toHaveTextContent("mixes");
  });

  it("follows the last key clicked when several are chosen", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    fireEvent.click(rowButton("11B"), { ctrlKey: true });
    expect(screen.getByRole("button", { name: "Show keys that mix with 11B" })).toBeInTheDocument();
  });
});

describe("carrying the choice on", () => {
  it("opens the Library on the same rules with Open in Library", async () => {
    renderKeys();
    await opened();
    fireEvent.click(await within(sourcesPanel()).findByRole("checkbox", { name: "Peak time" }, LOADED));
    fireEvent.click(await within(await findList()).findByRole("button", { name: /^8A,/ }, LOADED));
    fireEvent.click(screen.getByRole("button", { name: "Open in Library" }));

    expect(where()).toHaveTextContent("/library");
    expect(libraryOpening({ state: state(), key: "k" })?.rules).toEqual({
      match: "all",
      rules: [
        { field: "key", operator: "is", value: "8A" },
        { field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 3 }] },
      ],
    });
  });

  it("saves the same rules as a Smart Collection, playlists included", async () => {
    renderKeys();
    await opened();
    fireEvent.click(await within(sourcesPanel()).findByRole("checkbox", { name: "Peak time" }, LOADED));
    fireEvent.click(await within(await findList()).findByRole("button", { name: /^8A,/ }, LOADED));
    fireEvent.click(rowButton("8A"), { ctrlKey: true });
    fireEvent.click(within(countsList()).getByRole("button", { name: /^8B,/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save as Smart Collection…" }));

    const dialog = await screen.findByRole("dialog", {}, LOADED);
    expect(within(dialog).getByText(/key is 8B/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Peak 8B" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mock("saveSmartCollection")).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Peak 8B",
          rules: {
            match: "all",
            rules: [
              { field: "key", operator: "is", value: "8B" },
              { field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 3 }] },
            ],
          },
        }),
      ),
    );
    expect(await screen.findByText(/Saved “Peak 8B”/, {}, LOADED)).toBeInTheDocument();
  });

  it("keeps both buttons off until a key is chosen, with the reason", async () => {
    renderKeys();
    await opened();
    for (const name of ["Open in Library", "Save as Smart Collection…"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Select a key first");
    }
  });

  it("announces the facts line as a live status, and draws no empty bar on the no-key row in the wheel view", async () => {
    localStorage.clear();
    renderKeys();
    await screen.findByRole("group", { name: "Keys" }, LOADED);
    const facts = screen.getByText("1,500 tracks · All tracks");
    expect(facts).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "No Beatport key: 246" }).querySelector("[data-bar]")).toBeNull();
  });

  it("keeps the page's actions in the header and the selection's in the bar (C216, D7)", async () => {
    renderKeys();
    await opened();
    const header = screen.getByRole("heading", { level: 1, name: "Keys" }).closest(".cp-screen-header") as HTMLElement;
    expect(within(header).getByRole("button", { name: "Save as Smart Collection…" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Show keys that mix" })).toBeInTheDocument();
    // The header takes the page's one margin, with no local offset (C219).
    expect(header).not.toHaveClass("cp-screen-header--inset");
  });
});

describe("when there is nothing to count", () => {
  it("asks for the first import when the library is empty", async () => {
    install({
      getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: true, track_count: 0 }),
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 0, keys: [], no_key: 0 }),
    });
    renderKeys();
    expect(await screen.findByText("No library yet")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Keys in these sources" })).toBeNull();
  });

  it("sends a library with no Beatport keys to Match on Beatport", async () => {
    install({
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 40, keys: [], no_key: 40 }),
    });
    renderKeys();
    expect(
      await screen.findByText("Keys come from Beatport"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Match on Beatport" }));
    expect(where()).toHaveTextContent("/clean");
    expect(cleanMatchOpening({ state: state(), key: "k" })).not.toBeNull();
  });

  it("says when the chosen sources hold no tracks", async () => {
    install({
      getKeysPopulation: vi.fn(async ({ sources }: { sources: KeySource[] }) =>
        sources.some((source) => source.kind === "all")
          ? ALL
          : { total: 0, keys: [], no_key: 0 },
      ),
    });
    renderKeys();
    await opened();
    fireEvent.click(await within(sourcesPanel()).findByRole("checkbox", { name: "Warm-up" }, LOADED));
    expect(await screen.findByText("This playlist is empty")).toBeInTheDocument();
    fireEvent.click(within(sourcesPanel()).getByRole("checkbox", { name: "Friday" }));
    expect(await screen.findByText("These playlists are empty")).toBeInTheDocument();
  });

  it("does not call the whole library 'these playlists' when it holds no tracks", async () => {
    install({
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 0, keys: [], no_key: 0 }),
      getLibrarySummary: vi.fn(() => new Promise(() => undefined)),
    });
    renderKeys();
    await waitFor(() => expect(mock("getKeysPopulation")).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/playlists are empty/)).toBeNull();
    expect(screen.queryByText(/is empty/)).toBeNull();
    expect(screen.queryByText("No tracks here")).toBeNull();
  });

  it("uses the no-library words once the summary says the library is empty", async () => {
    let answer: (value: unknown) => void = () => undefined;
    install({
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 0, keys: [], no_key: 0 }),
      getLibrarySummary: vi.fn(() => new Promise((resolve) => (answer = resolve))),
    });
    renderKeys();
    await waitFor(() => expect(mock("getKeysPopulation")).toHaveBeenCalled());
    answer({ library_empty: true, track_count: 0 });
    expect(await screen.findByText("No library yet")).toBeInTheDocument();
    expect(screen.queryByText(/playlists are empty/)).toBeNull();
  });

  it("says so, with Try again, when the counts could not be read", async () => {
    const fail = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(ALL);
    install({ getKeysPopulation: fail });
    renderKeys();
    expect(await screen.findByText("The keys could not be counted")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await opened();
  });
});
