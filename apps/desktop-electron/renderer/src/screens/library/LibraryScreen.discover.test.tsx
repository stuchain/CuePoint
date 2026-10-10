/**
 * Discover's hooks in the Library (DISCOVER-11).
 *
 * The Library is where a person already is, so it is where the pages are
 * reached from:
 * - **the operations list** offers Similar tracks, Artist page and Label page
 *   for one track, in the row menu and behind the Actions button alike, since
 *   they are one list (ORG-11), and nothing for several;
 * - **a filter chip** that names one artist or label offers Open page;
 * - **the Inspector's credits** are links;
 * - **a page's rules** open with the page's name on their chip.
 *
 * Without the hooks (a build without Discover) none of it is offered, and the
 * menu opens as it always did — which the Library's own tests hold unchanged.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  FilterRuleSet,
  LibrarySearchResponse,
  LibrarySummary,
  LibraryTrackDetail,
  LibraryTrackRow,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { LibraryScreen, type LibraryScreenProps } from "./LibraryScreen";
import { menuItem } from "./menuPick.test.util";

const SUMMARY: LibrarySummary = {
  track_count: 2,
  playlist_count: 0,
  playlist_entry_count: 0,
  library_empty: false,
  source: {
    xml_path: "C:\\x\\collection.xml",
    imported_at: "2026-09-03T10:00:00Z",
    xml_modified_at: null,
    xml_size_bytes: null,
    track_count: 2,
    playlist_count: 0,
    exists: true,
    changed: false,
  },
};

function track(id: number, artist: string, label: string | null): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist,
    remixer: null,
    album: null,
    label,
    genre: "House",
    key: "8A",
    bpm: 124,
    year: 2025,
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

const TRACKS = [track(1, "Mara Veil, Kiko", "Nightfall Audio"), track(2, "DJEFF", null)];

const CREDITS: Record<number, TrackCreditLinks> = {
  1: {
    artists: [
      { kind: "artist", name: "Mara Veil", role: "artist", ref: "bp:301001", identity: "beatport" },
      { kind: "artist", name: "Kiko", role: "artist", ref: "name:kiko", identity: "name" },
    ],
    remixers: [],
    label: { kind: "label", name: "Nightfall Audio", role: null, ref: "bp:40211", identity: "beatport" },
  },
  2: {
    artists: [{ kind: "artist", name: "DJEFF", role: "artist", ref: "name:djeff", identity: "name" }],
    remixers: [],
    label: null,
  },
};

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
    credits: CREDITS[id],
  };
}

const VOCABULARY = {
  fields: [
    { name: "artist_name", label: "Credited artist", type: "name", operators: ["is", "is_not"] },
    { name: "label_name", label: "Label, any spelling", type: "name", operators: ["is"] },
    { name: "beatport_artist", label: "Beatport artist", type: "beatport", operators: ["is"] },
    { name: "genre", label: "Genre", type: "text", operators: ["is"] },
  ],
  operators: { is: { arity: "single" }, is_not: { arity: "single" } },
  facetable: [],
  sortable: ["artist", "title"],
};

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock | Record<string, Mock>>;

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
    getCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    getLibraryFilterFields: vi.fn().mockResolvedValue(VOCABULARY),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detail(trackId)),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
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

function renderScreen(props: LibraryScreenProps = {}) {
  const hooks = { onOpenEntity: vi.fn(), onOpenSimilar: vi.fn() };
  render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <LibraryScreen {...hooks} {...props} />
          <aside aria-label="Inspector">
            <InspectorSlotOutlet />
          </aside>
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>,
  );
  return hooks;
}

async function tableReady() {
  await screen.findByRole("table", { name: "Library tracks" });
  await screen.findByText("Track 1");
}

async function openMenuOn(text: string) {
  const row = screen.getByText(text).closest("[role=row]")!;
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
  return screen.findByRole("menu");
}

function labels(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole("menuitem")
    .map((node) => node.textContent ?? "");
}

describe("the operations list's Discover entries", () => {
  it("offers Similar tracks and both pages for one track, in the Explore group after Organize", async () => {
    renderScreen();
    await tableReady();
    const menu = await openMenuOn("Track 1");
    const top = labels(menu);
    // Explore is a parent after Organize, with Play's three entries first.
    expect(top.slice(0, 3)).toEqual(["Play", "Play next", "Add to queue"]);
    expect(top.indexOf("Organize▸")).toBeLessThan(top.indexOf("Explore▸"));
    await userEvent.click(within(menu).getByRole("menuitem", { name: /^Explore/ }));
    expect(labels(screen.getByRole("menu", { name: "Explore" }))).toEqual([
      "Similar tracks",
      "Artist page▸",
      "Label page",
    ]);
  });

  it("opens each: Similar tracks by track, an artist from the submenu, the label", async () => {
    const hooks = renderScreen();
    await tableReady();
    await userEvent.click((await menuItem("Similar tracks", await openMenuOn("Track 1"))));
    expect(hooks.onOpenSimilar).toHaveBeenCalledWith(1);

    await userEvent.click((await menuItem(/Artist page/, await openMenuOn("Track 1"))));
    await userEvent.click(
      within(screen.getByRole("menu", { name: "Artist page" })).getByRole("menuitem", { name: "Kiko" }),
    );
    expect(hooks.onOpenEntity).toHaveBeenLastCalledWith("artist", "name:kiko");

    await userEvent.click((await menuItem("Label page", await openMenuOn("Track 1"))));
    expect(hooks.onOpenEntity).toHaveBeenLastCalledWith("label", "bp:40211");
  });

  it("opens a single artist's page directly, and disables a label the track lacks", async () => {
    const hooks = renderScreen();
    await tableReady();
    await openMenuOn("Track 2");
    expect((await menuItem("Label page"))).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.click((await menuItem("Artist page")));
    expect(hooks.onOpenEntity).toHaveBeenCalledWith("artist", "name:djeff");
  });

  it("is the same list behind the bar's Explore ▸", async () => {
    const hooks = renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    await userEvent.click(screen.getByRole("button", { name: "Explore" }));
    const menu = await screen.findByRole("menu");
    expect(labels(menu)).toEqual(["Similar tracks", "Artist page▸", "Label page"]);
    await userEvent.click((await menuItem("Similar tracks")));
    expect(hooks.onOpenSimilar).toHaveBeenCalledWith(1);
  });

  it("opens the first track's page when several are selected (FLW-8)", async () => {
    const hooks = renderScreen();
    await tableReady();
    const table = screen.getByRole("table", { name: "Library tracks" });
    fireEvent.click(within(table).getByText("Track 2"));
    fireEvent.click(within(table).getByText("Track 1"), { ctrlKey: true });
    expect(await screen.findByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Explore" }));
    const menu = await screen.findByRole("menu");
    expect(labels(menu)).toContain("Similar tracks");
    await userEvent.click((await menuItem("Similar tracks")));
    // In the table's order, not the order of the clicks.
    expect(hooks.onOpenSimilar).toHaveBeenCalledWith(1);
  });

  it("offers none of it in a build without Discover, and opens the menu at once", async () => {
    renderScreen({ onOpenEntity: undefined, onOpenSimilar: undefined });
    await tableReady();
    const row = screen.getByText("Track 1").closest("[role=row]")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    // Synchronously: nothing had to be read first.
    const menu = screen.getByRole("menu");
    expect(labels(menu)).not.toContain("Similar tracks");
  });
});

describe("filter chips and the Inspector", () => {
  const RULES: FilterRuleSet = {
    match: "all",
    rules: [
      { field: "artist_name", operator: "is", value: "Kiko" },
      { field: "artist_name", operator: "is_not", value: "DJEFF" },
      { field: "genre", operator: "is", value: "House" },
    ],
  };

  it("offers Open page on a chip naming one artist, and on no other", async () => {
    const hooks = renderScreen({ openWith: { rules: RULES, token: "nav-1" } });
    await tableReady();
    const chips = await screen.findByRole("list", { name: "Active filters" });
    const open = within(chips).getAllByRole("button", { name: /^Open page/ });
    expect(open).toHaveLength(1);
    expect(open[0]).toHaveAccessibleName("Open page: Credited artist is Kiko");
    fireEvent.click(open[0]);
    expect(hooks.onOpenEntity).toHaveBeenCalledWith("artist", "name:Kiko");
  });

  it("reads a page's id rule as the page's name, and opens that page", async () => {
    const hooks = renderScreen({
      openWith: {
        rules: { match: "all", rules: [{ field: "beatport_artist", operator: "is", value: 301001 }] },
        token: "nav-2",
        names: { "beatport_artist:301001": "Mara Veil" },
      },
    });
    await tableReady();
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(await within(chips).findByText("Beatport artist is Mara Veil")).toBeInTheDocument();
    fireEvent.click(within(chips).getByRole("button", { name: /^Open page/ }));
    expect(hooks.onOpenEntity).toHaveBeenCalledWith("artist", "bp:301001");
  });

  it("reads a list of tracks as the page's label, and removing it restores the library", async () => {
    const label = "Similar to “Build” (3 tracks)";
    renderScreen({
      openWith: {
        rules: { match: "all", rules: [{ field: "track", operator: "any_of", value: [1, 2, 3] }] },
        token: "nav-3",
        names: { "track:[1,2,3]": label },
      },
    });
    await tableReady();
    const chips = await screen.findByRole("list", { name: "Active filters" });
    expect(await within(chips).findByText(label)).toBeInTheDocument();
    const browse = bridge.browseLibrary as Mock;
    await waitFor(() =>
      expect(
        browse.mock.calls.some((call) => JSON.stringify(call[0]).includes('"field":"track"')),
      ).toBe(true),
    );
    fireEvent.click(within(chips).getByRole("button", { name: `Remove filter: ${label}` }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Active filters" })).toBeNull());
  });

  it("links the Inspector's credits to their pages", async () => {
    const hooks = renderScreen();
    await tableReady();
    await userEvent.click(screen.getByText("Track 1"));
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    await userEvent.click(await within(inspector).findByRole("button", { name: "Mara Veil" }));
    expect(hooks.onOpenEntity).toHaveBeenCalledWith("artist", "bp:301001");
    await waitFor(() =>
      expect(within(inspector).getByRole("button", { name: "Nightfall Audio" })).toBeInTheDocument(),
    );
  });
});
