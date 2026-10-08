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
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  install();
});

afterEach(() => {
  setSelectedTrack(null);
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the source picker", () => {
  it("starts on the whole library and asks for its keys", async () => {
    renderKeys();
    await opened();
    expect(screen.getByRole("heading", { level: 1, name: "Keys" })).toBeInTheDocument();
    expect(within(sourcesPanel()).getByRole("checkbox", { name: "Whole library" })).toBeChecked();
    expect(mock("getKeysPopulation")).toHaveBeenCalledWith({ sources: [{ kind: "all" }] });
    expect(screen.getByText("1,500 tracks in the whole library")).toBeInTheDocument();
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

  it("counts the ticked sources, and the whole library box lets go of them", async () => {
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
    expect(within(panel).getByRole("checkbox", { name: "Whole library" })).not.toBeChecked();
    expect(await screen.findByText("20 tracks in 1 playlist and 1 Set")).toBeInTheDocument();
    expect(await within(countsList()).findByRole("button", { name: /^1B,/ })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("checkbox", { name: "Whole library" }));
    await waitFor(() =>
      expect(mock("getKeysPopulation")).toHaveBeenLastCalledWith({ sources: [{ kind: "all" }] }),
    );
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
    await screen.findByText("Counting the keys…");
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
    expect(screen.queryByText("The keys could not be counted.")).toBeNull();
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
      "No Beatport key: 246",
    ]);
    expect(rowButton("8A").querySelector("[data-bar]")).not.toBeNull();
    expect(rowButton("11B").querySelector("[data-bar]")).toHaveAttribute("data-percent", "100");
  });

  it("writes 'No Beatport key: N' on its own line", async () => {
    renderKeys();
    await opened();
    const none = within(countsList()).getByRole("button", { name: "No Beatport key: 246" });
    expect(none.parentElement).toHaveAttribute("data-line", "no-key");
  });

  it("writes the counts on the wheel's segments, in the same numbers", async () => {
    renderKeys();
    await opened();
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

describe("choosing keys", () => {
  it("lists the tracks in a key when it is clicked, in an ordinary track table", async () => {
    renderKeys();
    await opened();
    expect(screen.getByText("Click a key to list its tracks.")).toBeInTheDocument();

    fireEvent.click(rowButton("8A"));

    const table = await screen.findByRole("table", { name: "Tracks in these keys" }, LOADED);
    expect(await within(table).findByText("Track 1")).toBeInTheDocument();
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

  it("scrolls the Tracks into view on the first key picked, instantly unless scroll motion is on", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderKeys();
      await opened();
      expect(scrollIntoView).not.toHaveBeenCalled();
      fireEvent.click(rowButton("8A"));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
      expect(scrollIntoView.mock.contexts[0]).toBe(
        screen.getByRole("heading", { name: /^Tracks in/ }).closest("section"),
      );
      // A second key changes the list in place: no second jump.
      fireEvent.click(rowButton("9A"), { ctrlKey: true });
      await waitFor(() => expect(rowButton("9A")).toHaveAttribute("aria-pressed", "true"));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      // Let go of every key, then pick again with scroll motion on: it eases.
      fireEvent.click(rowButton("8A"), { ctrlKey: true });
      fireEvent.click(rowButton("9A"), { ctrlKey: true });
      await waitFor(() => expect(screen.getByText("Click a key to list its tracks.")).toBeInTheDocument());
      document.documentElement.setAttribute("data-motion-scroll", "on");
      fireEvent.click(rowButton("8A"));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "smooth" });
    } finally {
      document.documentElement.removeAttribute("data-motion-scroll");
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("chooses with a click on the wheel as well", async () => {
    renderKeys();
    await opened();
    fireEvent.click(within(wheel()).getByRole("button", { name: /^9A,/ }));
    await waitFor(() => expect(rowButton("9A")).toHaveAttribute("aria-pressed", "true"));
    expect(within(wheel()).getByRole("button", { name: /^9A,/ })).toHaveAttribute("aria-pressed", "true");
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
    expect(screen.getByText("Click a key to list its tracks.")).toBeInTheDocument();
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
    fireEvent.click(within(wheel()).getByRole("button", { name: /^1A,/ }));
    expect(screen.getByText("Click a key to list its tracks.")).toBeInTheDocument();
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

  it("shows the Library's selection bar over the table", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    const bar = await screen.findByRole("toolbar", { name: "Selected tracks" }, LOADED);
    for (const name of ["Play", "Organize", "Explore", "Beatport", "Fix", "More"]) {
      expect(within(bar).getByRole("button", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(within(bar).getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
  });
});

describe("the keys that mix", () => {
  it("is disabled until a key is chosen, and says why", async () => {
    renderKeys();
    await opened();
    const button = screen.getByRole("button", { name: "Show keys that mix with…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Click a key first");
  });

  it("lights the engine's compatible keys on the wheel and in the list, in words", async () => {
    renderKeys();
    await opened();
    fireEvent.click(rowButton("8A"));
    fireEvent.click(screen.getByRole("button", { name: "Show keys that mix with 8A" }));

    await waitFor(() => expect(mock("getCompatibleKeys")).toHaveBeenCalledWith({ key: "8A" }));
    await waitFor(() =>
      expect(wheel().querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit", "adjacent"),
    );
    expect(wheel().querySelector('[data-shape="8B"]')).toHaveAttribute("data-lit", "relative");
    // Not by color alone: the list says it in words.
    expect(rowButton("9A")).toHaveTextContent("mixes with 8A");
    expect(rowButton("11B")).not.toHaveTextContent("mixes");
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
    await waitFor(() =>
      expect(wheel().querySelector('[data-shape="9A"]')).toHaveAttribute("data-lit"),
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(wheel().querySelector('[data-shape="9A"]')).not.toHaveAttribute("data-lit"),
    );
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
      expect(button).toHaveAttribute("title", "Click a key first");
    }
  });
});

describe("when there is nothing to count", () => {
  it("asks for the first import when the library is empty", async () => {
    install({
      getLibrarySummary: vi.fn().mockResolvedValue({ library_empty: true, track_count: 0 }),
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 0, keys: [], no_key: 0 }),
    });
    renderKeys();
    expect(await screen.findByText("Import your Rekordbox collection first")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Keys in these sources" })).toBeNull();
  });

  it("sends a library with no Beatport keys to Match tracks…", async () => {
    install({
      getKeysPopulation: vi.fn().mockResolvedValue({ total: 40, keys: [], no_key: 40 }),
    });
    renderKeys();
    expect(
      await screen.findByText("Keys come from Beatport. Match your tracks in Clean."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
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
    expect(await screen.findByText("Import your Rekordbox collection first")).toBeInTheDocument();
    expect(screen.queryByText(/playlists are empty/)).toBeNull();
  });

  it("says so, with Try again, when the counts could not be read", async () => {
    const fail = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(ALL);
    install({ getKeysPopulation: fail });
    renderKeys();
    expect(await screen.findByText("The keys could not be counted.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await opened();
  });
});
