/**
 * Artist and Label pages (DISCOVER-11).
 *
 * The specification's component tests, against the real page over a faked
 * bridge whose every answer is the engine's own (`discoverPages.fixture.json`,
 * produced by `test_discover_pages_fixture.py`):
 * - both pages in each identity, a name redirected to its id at the id's
 *   address, and a name several artists share;
 * - the Beatport half in every state, each with its action;
 * - the library half is the Library's rows, and a double-click plays them
 *   with the page's table as the queue; its menu queues and leads on;
 * - Open in Library and Save as Smart Collection carry the same rules;
 * - the Inspector describes a library row, and never a Beatport one.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type {
  DiscoverAnswer,
  EntityBeatportHalf,
  EntityPage,
  LibrarySearchResponse,
  LibraryTrackDetail,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { libraryOpening } from "../library/libraryLink";
import { toQueueItem } from "../library/useLibraryPlayback";
import { settingsFocus } from "../settingsLink";
import { EntityScreen } from "./EntityScreen";
import { ARTIST_PAGE_ROUTE, LABEL_PAGE_ROUTE, entityPath } from "./discoverLinks";
import discover from "./discoverPage.fixture.json";
import pages from "./discoverPages.fixture.json";

const LOADED = { timeout: 3000 };

type Fixture = keyof typeof pages;
type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, unknown>;
let player: Record<string, Fn>;

const value = <T,>(of: T): DiscoverAnswer<T> => ({ value: of, refusal: null });
const answerOf = <T,>(name: Fixture) => pages[name] as unknown as DiscoverAnswer<T>;
const pageOf = (name: Fixture) => answerOf<EntityPage>(name).value as EntityPage;
const halfOf = (name: Fixture) => answerOf<EntityBeatportHalf>(name).value as EntityBeatportHalf;

/** Which recorded page each address the tests use answers. */
const PAGES: Record<string, Fixture> = {
  "artist|name:Kiko": "page_artist_name",
  "artist|name:kiko": "page_artist_name",
  "artist|name:Mara Veil": "page_artist_redirected",
  "artist|bp:301001": "page_artist_id",
  "artist|name:Someone": "page_artist_shared",
  "artist|name:someone": "page_artist_shared",
  "label|bp:40211": "page_label_id",
  "label|name:Cold Room": "page_label_name",
  "label|name:cold room": "page_label_name",
  "artist|Mara Veil": "page_refused",
};

/** Which recorded half each page's reference answers, unless a test says otherwise. */
const HALVES: Record<string, Fixture> = {
  "artist|bp:301001": "half_artist_ok",
  "artist|name:kiko": "half_not_resolved",
  "artist|name:someone": "half_shared",
  "label|bp:40211": "half_label_ok",
  "label|name:cold room": "half_not_on_beatport",
};

/** The Library's rows for each page's rules, as the engine browsed them. */
function libraryFor(filters: unknown): LibrarySearchResponse | null {
  const key = JSON.stringify(filters);
  for (const [page, rows] of [
    ["page_artist_id", "library_artist_id"],
    ["page_artist_name", "library_artist_name"],
    ["page_label_id", "library_label_id"],
  ] as const) {
    if (JSON.stringify(pageOf(page).rules) === key) {
      return pages[rows] as unknown as LibrarySearchResponse;
    }
  }
  return null;
}

function browse(params: Record<string, unknown>): LibrarySearchResponse {
  const found = libraryFor(params.filters);
  const rows = found?.tracks ?? [];
  return {
    ...(found ?? (pages.library_artist_id as unknown as LibrarySearchResponse)),
    total: rows.length,
    tracks: params.fields === "id" ? [] : rows,
    track_ids: params.fields === "id" ? rows.map((row) => row.id!) : undefined,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    offset: Number(params.offset ?? 0),
    limit: Number(params.limit ?? 100),
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

/** A track's detail: the recorded ones, or one made from its recorded row. */
function detail(trackId: number): LibraryTrackDetail {
  if (trackId === 1) return pages.detail_resolved as unknown as LibraryTrackDetail;
  if (trackId === 3) return pages.detail_unresolved as unknown as LibraryTrackDetail;
  const row = [
    ...(pages.library_artist_id.tracks as unknown as LibraryTrackRow[]),
    ...(pages.library_label_id.tracks as unknown as LibraryTrackRow[]),
    ...(pages.library_artist_name.tracks as unknown as LibraryTrackRow[]),
  ].find((track) => track.id === trackId)!;
  return { ...(pages.detail_resolved as unknown as LibraryTrackDetail), track: row };
}

const VOCABULARY = {
  fields: [
    { name: "beatport_artist", label: "Beatport artist", type: "beatport", operators: ["is"] },
    { name: "beatport_label", label: "Beatport label", type: "beatport", operators: ["is"] },
    { name: "artist_name", label: "Credited artist", type: "name", operators: ["is"] },
    { name: "label_name", label: "Label, any spelling", type: "name", operators: ["is"] },
  ],
  operators: { is: { arity: "single" } },
  facetable: [],
  sortable: ["year", "title", "artist"],
};

function install(overrides: Record<string, unknown> = {}) {
  player = {
    playView: vi.fn().mockResolvedValue({ ok: true }),
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue(undefined),
  };
  bridge = {
    getEntityPage: vi.fn(async ({ kind, ref }: { kind: string; ref: string }) => {
      const name = PAGES[`${kind}|${ref}`];
      if (!name) throw new Error(`no page for ${kind} ${ref}`);
      return pages[name];
    }),
    getEntityBeatport: vi.fn(async (params: Record<string, unknown>) => {
      const key = `${String(params.kind)}|${String(params.ref)}`;
      if (key === "label|bp:40211" && params.owned === "hide") {
        return pages.half_label_owned_hidden;
      }
      const name = HALVES[key];
      if (!name) throw new Error(`no half for ${key}`);
      return pages[name];
    }),
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => browse(params)),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => detail(trackId)),
    getLibraryFilterFields: vi.fn().mockResolvedValue(VOCABULARY),
    getCollections: vi.fn().mockResolvedValue({ collections: [], total: 0 }),
    saveSmartCollection: vi.fn(async ({ name, rules }: { name: string; rules: unknown }) => ({
      collection: {
        id: 41,
        parent_id: null,
        kind: "smart",
        name,
        rules,
        entry_count: 0,
        track_count: 2,
        position: 0,
        sort: null,
        dir: null,
        created_at: "x",
        updated_at: "x",
      },
    })),
    addToWantlist: vi.fn(async () => discover.wantlist_added),
    getDiscoverOptions: vi.fn(async () => discover.options_ok),
    startBeatportPlaylistPush: vi.fn(async () =>
      value({ id: "job-push", type: "beatport_playlist", state: "queued" }),
    ),
    startBeatportResolve: vi.fn(async () =>
      value({ id: "job-resolve", type: "beatport_resolve", state: "queued" }),
    ),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({
      id,
      state: "succeeded",
      result: id === "job-push" ? discover.playlist_result : discover.resolve_result,
    })),
    openBeatportPage: vi.fn(async () => true),
    player,
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function mock(name: string): Fn {
  return bridge[name] as Fn;
}

/** Where the page navigated, and with what state. */
function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function where(): string {
  return screen.getByTestId("where").textContent ?? "";
}

function renderAt(path: string) {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={ARTIST_PAGE_ROUTE} element={<EntityScreen kind="artist" />} />
              <Route path={LABEL_PAGE_ROUTE} element={<EntityScreen kind="label" />} />
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

async function opened(title: string) {
  return screen.findByRole("heading", { level: 1, name: title }, LOADED);
}

function yourTracks() {
  return screen.getByRole("table", { name: "Your tracks" });
}

async function beatportRows(name: RegExp | string) {
  return screen.findByRole("table", { name }, LOADED);
}

function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest("[role=row]") as HTMLElement;
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

describe("a page's identity (DEC-095)", () => {
  it("is a name group, at its own address, over the Library's rows for its rules", async () => {
    renderAt(entityPath("artist", "name:Kiko"));
    await opened("Kiko");
    // The name as typed is replaced with the page's own reference.
    await waitFor(() => expect(where()).toBe(entityPath("artist", "name:kiko")));
    expect(screen.getByText("Your tracks by this name")).toBeInTheDocument();
    expect(screen.getByText(/has not linked this artist to Beatport yet/)).toBeInTheDocument();
    expect(screen.getByText("3 tracks in your library")).toBeInTheDocument();
    for (const title of ["Harbour Lights", "Night Bus", "Untimed"]) {
      expect(await within(yourTracks()).findByText(title, {}, LOADED)).toBeInTheDocument();
    }
    // The rules went to the Library's browse unchanged (fact 5).
    const asked = mock("browseLibrary").mock.calls.map((call) => call[0].filters);
    expect(asked).toContainEqual(pageOf("page_artist_name").rules);
    expect(mock("getEntityPage")).toHaveBeenCalledTimes(1);
  });

  it("is a name linked to one id at the id's address, and says it was opened by name", async () => {
    renderAt(entityPath("artist", "name:Mara Veil"));
    await opened("Mara Veil");
    await waitFor(() => expect(where()).toBe(entityPath("artist", "bp:301001")));
    expect(screen.getByText("Linked to Beatport")).toBeInTheDocument();
    expect(screen.getByText(/Opened by name/)).toBeInTheDocument();
    expect(screen.getByText(/credited as Mara Veil/)).toBeInTheDocument();
    // The page answered for the id is not asked for again at the id's address.
    expect(mock("getEntityPage")).toHaveBeenCalledTimes(1);
    expect(await within(yourTracks()).findByText("Low Tide", {}, LOADED)).toBeInTheDocument();
  });

  it("draws a label page in both identities", async () => {
    const view = renderAt(entityPath("label", "bp:40211"));
    await opened("Nightfall Audio");
    expect(screen.getByText("Linked to Beatport")).toBeInTheDocument();
    expect(screen.getByText(/Artists:/)).toBeInTheDocument();
    view.unmount();
    renderAt(entityPath("label", "name:Cold Room"));
    await opened("Cold Room");
    expect(screen.getByText("Your tracks by this name")).toBeInTheDocument();
    expect(screen.getByText(/whose label spells this name/)).toBeInTheDocument();
  });

  it("is never titled by an id: an artist with no name anywhere is Unknown artist (DSC-9)", async () => {
    const page = pageOf("page_artist_id");
    mock("getEntityPage").mockResolvedValue(
      value({ ...page, name: null, names: [], display_name: "Unknown artist" }),
    );
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Unknown artist");
    expect(screen.queryByRole("heading", { level: 1, name: /301001/ })).toBeNull();
  });

  it("takes its title from the engine's display name", async () => {
    const page = pageOf("page_artist_id");
    mock("getEntityPage").mockResolvedValue(
      value({ ...page, name: null, display_name: "MARA VEIL" }),
    );
    renderAt(entityPath("artist", "bp:301001"));
    await opened("MARA VEIL");
  });

  it("links the header's related names to their pages", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    const facts = screen.getByRole("list", { name: "In your library" });
    expect(within(facts).getByText("Genres: House (2)")).toBeInTheDocument();
    expect(within(facts).getByText("2024–2025")).toBeInTheDocument();
    fireEvent.click(within(facts).getByRole("button", { name: "Nightfall Audio" }));
    expect(where()).toBe(entityPath("label", "name:Nightfall Audio"));
  });

  it("says when the name index is still being built", async () => {
    const page = pageOf("page_artist_id");
    mock("getEntityPage").mockResolvedValue(
      value({ ...page, library: { ...page.library, index_current: false } }),
    );
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    expect(screen.getByText(/still indexing artist and label names/)).toBeInTheDocument();
  });

  it("says why a page could not open, and offers to ask again", async () => {
    renderAt(entityPath("artist", "Mara Veil"));
    expect(await screen.findByText("This page could not open", {}, LOADED)).toBeInTheDocument();
    expect(screen.getByText(/bp:<id> or name:<key>/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mock("getEntityPage")).toHaveBeenCalledTimes(2));
  });

  it("says Discover needs the engine when the bridge has no pages", async () => {
    install({ getEntityPage: undefined });
    renderAt(entityPath("artist", "bp:301001"));
    expect(await screen.findByText(/needs the desktop app/, {}, LOADED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("the Beatport half, in every state", () => {
  const STANDING_IN: Array<[Fixture, string, string | null]> = [
    ["half_no_token", "Connect your Beatport account", "Open Settings"],
    ["half_rejected", "Beatport rejected the token", "Open Settings"],
    ["half_forbidden", "Beatport refused this token", "Open Settings"],
    ["half_rate_limited", "Beatport is limiting requests", "Try again"],
    ["half_unavailable", "Beatport cannot be reached", "Try again"],
    ["half_not_resolved_resolvable", "Not linked to Beatport yet", "Look them up now"],
    ["half_not_resolved", "Not linked to Beatport yet", null],
    ["half_not_on_beatport", "No match", null],
  ];

  it.each(STANDING_IN)("draws %s with its reason and its action", async (name, headline, action) => {
    const half = halfOf(name);
    mock("getEntityBeatport").mockResolvedValue(pages[name]);
    // Each state on a page of its own kind: an artist's half is an artist page's.
    renderAt(half.kind === "artist" ? entityPath("artist", "bp:301001") : entityPath("label", "bp:40211"));
    const state = await screen.findByRole("status", { name: "Beatport" }, LOADED);
    expect(within(state).getByText(headline)).toBeInTheDocument();
    expect(within(state).getByText(`${half.message}.`)).toBeInTheDocument();
    const buttons = within(state).queryAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(action ? [action] : []);
  });

  it("sends a token problem to the token field in Settings", async () => {
    mock("getEntityBeatport").mockResolvedValue(pages.half_no_token);
    renderAt(entityPath("label", "bp:40211"));
    fireEvent.click(await screen.findByRole("button", { name: "Open Settings" }, LOADED));
    expect(where()).toBe("/settings");
    const state = JSON.parse(screen.getByTestId("where").dataset.state ?? "null");
    expect(settingsFocus({ state })?.focus).toBe("beatport-token");
  });

  it("asks Beatport again, however fresh the copy, when it was busy", async () => {
    mock("getEntityBeatport").mockResolvedValueOnce(pages.half_rate_limited);
    renderAt(entityPath("label", "bp:40211"));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }, LOADED));
    await waitFor(() =>
      expect(mock("getEntityBeatport")).toHaveBeenLastCalledWith(
        expect.objectContaining({ refresh: true }),
      ),
    );
    expect(await beatportRows(/Beatport's releases/)).toBeInTheDocument();
  });

  it("starts the lookup for a name it could link, and reads the page again after", async () => {
    mock("getEntityBeatport").mockResolvedValue(pages.half_not_resolved_resolvable);
    renderAt(entityPath("artist", "name:Kiko"));
    fireEvent.click(await screen.findByRole("button", { name: "Look them up now" }, LOADED));
    await waitFor(() => expect(mock("startBeatportResolve")).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mock("getEntityPage")).toHaveBeenCalledTimes(2), LOADED);
  });

  it("offers the artists who share a name as choices", async () => {
    renderAt(entityPath("artist", "name:Someone"));
    await opened("Someone");
    const choices = await screen.findByRole("list", { name: "Beatport artists with this name" }, LOADED);
    const items = within(choices).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1 of your tracks");
    fireEvent.click(within(items[0]).getByRole("button"));
    expect(where()).toBe(entityPath("artist", pageOf("page_artist_shared").links[0].ref));
  });

  it("hides the tracks already in your library until asked, with the one switch Results has (DSC-6)", async () => {
    renderAt(entityPath("label", "bp:40211"));
    const table = await beatportRows(/Beatport's releases/);
    const hide = screen.getByRole("checkbox", { name: "Hide tracks already in your library" });
    expect(hide).toBeChecked();
    expect(mock("getEntityBeatport")).toHaveBeenCalledWith(
      expect.objectContaining({ owned: "hide" }),
    );
    expect(await within(table).findByText("Track 9 (Original Mix)", {}, LOADED)).toBeInTheDocument();
    expect(within(table).queryByText("Track 7 (Original Mix)")).toBeNull();
    expect(
      screen.getByText(/3 tracks released since .* · 2 already in your library \(hidden\)/),
    ).toBeInTheDocument();

    fireEvent.click(hide);
    await waitFor(() =>
      expect(mock("getEntityBeatport")).toHaveBeenLastCalledWith(
        expect.objectContaining({ owned: "all" }),
      ),
    );
    for (const title of ["Track 7 (Original Mix)", "Track 8 (Original Mix)", "Track 9 (Original Mix)"]) {
      expect(await within(table).findByText(title, {}, LOADED)).toBeInTheDocument();
    }
    expect(rowOf("Track 7 (Original Mix)")).toHaveTextContent("In your library");
    expect(rowOf("Track 8 (Original Mix)")).toHaveTextContent("In your library");
    expect(rowOf("Track 9 (Original Mix)")).not.toHaveTextContent("In your library");
    expect(screen.getByText(/3 tracks released since .* · 2 already in your library$/)).toBeInTheDocument();
  });

  it("explains what 'in your library' means, once", async () => {
    renderAt(entityPath("label", "bp:40211"));
    await beatportRows(/Beatport's releases/);
    const hide = screen.getByRole("checkbox", { name: "Hide tracks already in your library" });
    expect(hide.closest("label")).toHaveAttribute(
      "title",
      "Tracks you've matched on the Clean page. Match more tracks there to hide more of what you already have.",
    );
  });

  it("offers Check Beatport again, and says a saved listing is saved", async () => {
    mock("getEntityBeatport").mockResolvedValue({
      value: { ...halfOf("half_label_ok"), from_cache: true },
      refusal: null,
    });
    renderAt(entityPath("label", "bp:40211"));
    await beatportRows(/Beatport's releases/);
    expect(
      screen.getByText("Saved earlier from Beatport. Check Beatport again for the latest."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check Beatport again" }));
    await waitFor(() =>
      expect(mock("getEntityBeatport")).toHaveBeenLastCalledWith(
        expect.objectContaining({ refresh: true }),
      ),
    );
  });

  it("sets the selected track from a Beatport row, with its key as Camelot, and lets go", async () => {
    const half = halfOf("half_label_ok");
    const keyed = {
      ...half,
      page: { ...half.page!, rows: half.page!.rows.map((row) => ({ ...row, key: "Am" })) },
    };
    mock("getEntityBeatport").mockResolvedValue({ value: keyed, refusal: null });
    renderAt(entityPath("label", "bp:40211"));
    const table = await beatportRows(/Beatport's releases/);
    const cell = await within(table).findByText("Track 9 (Original Mix)", {}, LOADED);
    fireEvent.mouseDown(cell);
    fireEvent.click(cell);
    expect(getSelectedTrack()).toMatchObject({ id: "bp-9", key: "8A" });
    const actions = screen.getByRole("toolbar", { name: /Beatport's releases by this label: actions/ });
    fireEvent.click(within(actions).getByRole("button", { name: "Clear" }));
    expect(getSelectedTrack()).toBeNull();
  });

  it("sets the selected track to a library row's key, and to nothing for a keyless one", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(await within(yourTracks()).findByText("Low Tide", {}, LOADED));
    const row = (pages.library_artist_id.tracks as unknown as LibraryTrackRow[]).find(
      (track) => track.title === "Low Tide",
    )!;
    await waitFor(() =>
      expect(getSelectedTrack()).toEqual({ id: row.id, key: row.effective_key ?? null }),
    );
  });

  it("links the artist and label names in its table to their pages (FLW-16)", async () => {
    renderAt(entityPath("label", "bp:40211"));
    const table = await beatportRows(/Beatport's releases/);
    await within(table).findByText("Track 9 (Original Mix)", {}, LOADED);
    const row = rowOf("Track 9 (Original Mix)");
    fireEvent.click(within(row).getByRole("button", { name: "Mara Veil" }));
    expect(where()).toBe(entityPath("artist", "name:Mara Veil"));
  });

  it("says a label was found by name on Beatport", async () => {
    mock("getEntityBeatport").mockResolvedValue(pages.half_found_by_name);
    renderAt(entityPath("label", "name:Cold Room"));
    expect(await screen.findByText(/Found by name on Beatport\./, {}, LOADED)).toBeInTheDocument();
  });

  it("adds a selection to the wantlist and opens it on Beatport", async () => {
    renderAt(entityPath("label", "bp:40211"));
    const table = await beatportRows(/Beatport's releases/);
    fireEvent.mouseDown(await within(table).findByText("Track 9 (Original Mix)", {}, LOADED));
    fireEvent.click(within(table).getByText("Track 9 (Original Mix)"));
    const actions = screen.getByRole("toolbar", { name: /Beatport's releases by this label: actions/ });
    fireEvent.click(within(actions).getByRole("button", { name: "Add to wantlist" }));
    await waitFor(() =>
      expect(mock("addToWantlist")).toHaveBeenCalledWith({ track_ids: [9] }),
    );
    fireEvent.click(within(actions).getByRole("button", { name: "Open on Beatport" }));
    await waitFor(() =>
      expect(mock("openBeatportPage")).toHaveBeenCalledWith(
        halfOf("half_label_ok").page!.rows[2].url,
      ),
    );
  });

  it("makes a playlist of every track it shows, with the engine's default name, and says how it went", async () => {
    renderAt(entityPath("label", "bp:40211"));
    await beatportRows(/Beatport's releases/);
    const actions = screen.getByRole("toolbar", { name: /Beatport's releases by this label: actions/ });
    fireEvent.click(within(actions).getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog", {}, LOADED);
    expect(mock("getDiscoverOptions")).toHaveBeenCalledTimes(1);
    const name = within(dialog).getByRole("textbox") as HTMLInputElement;
    expect(name.value).toBe(discover.options_ok.value.defaults.playlist_name);
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    // The table hides what is in the library, so the playlist is what it shows.
    await waitFor(() =>
      expect(mock("startBeatportPlaylistPush")).toHaveBeenCalledWith({
        name: discover.options_ok.value.defaults.playlist_name,
        include_owned: false,
        track_ids: [9],
      }),
    );
    const banner = await screen.findByRole("status", { name: "Beatport playlist" }, LOADED);
    expect(within(banner).getByRole("button", { name: "Open the playlist" })).toBeInTheDocument();
  });
});

describe("the library half: library rows", () => {
  it("plays a row with the page's table behind it (DEC-012)", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.doubleClick(await within(yourTracks()).findByText("Low Tide", {}, LOADED));
    await waitFor(() => expect(player.playView).toHaveBeenCalledTimes(1));
    const [params, index] = player.playView.mock.calls[0];
    expect(index).toBe(1);
    expect(params).toMatchObject({
      filters: pageOf("page_artist_id").rules,
      sort: "year",
      dir: "desc",
    });
  });

  it("queues from its menu without interrupting, and leads to Similar tracks and the pages", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    await within(yourTracks()).findByText("Harbour Lights", {}, LOADED);
    const row = pages.detail_resolved.track as unknown as LibraryTrackRow;

    fireEvent.contextMenu(rowOf("Harbour Lights"), { clientX: 10, clientY: 10 });
    let menu = await screen.findByRole("menu", {}, LOADED);
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Play",
      "Play next",
      "Add to queue",
      "Explore▸",
      "More▸",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Add to queue" }));
    await waitFor(() => expect(player.addToQueue).toHaveBeenCalledWith([toQueueItem(row)]));
    expect(player.playView).not.toHaveBeenCalled();

    fireEvent.contextMenu(rowOf("Harbour Lights"), { clientX: 10, clientY: 10 });
    menu = await screen.findByRole("menu", {}, LOADED);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Explore/ }));
    await userEvent.click(within(screen.getByRole("menu", { name: "Explore" })).getByRole("menuitem", { name: /Artist page/ }));
    await userEvent.click(
      within(screen.getByRole("menu", { name: "Artist page" })).getByRole("menuitem", {
        name: "Kiko",
      }),
    );
    expect(where()).toBe(entityPath("artist", "name:kiko"));
  });

  it("opens Similar tracks for a row", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    await within(yourTracks()).findByText("Harbour Lights", {}, LOADED);
    fireEvent.contextMenu(rowOf("Harbour Lights"), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole("menu", {}, LOADED);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Explore/ }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Explore" })).getByRole("menuitem", { name: "Similar tracks" }));
    expect(where()).toBe("/discover/similar/1");
  });

  it("plays the one track selected from the bar's Play, with the table behind it", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(await within(yourTracks()).findByText("Low Tide", {}, LOADED));
    const library = screen.getByRole("region", { name: "Your tracks" });
    const bar = within(library).getByRole("toolbar", { name: "Selected tracks" });
    expect(within(bar).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Play ▸",
      "Explore ▸",
      "More ▸",
      "Clear selection",
    ]);
    fireEvent.click(within(bar).getByRole("button", { name: "Play" }));
    const menu = await screen.findByRole("menu", {}, LOADED);
    // Taken from the table, not gathered by reading it all again.
    expect(mock("browseLibrary").mock.calls.every((call) => call[0].limit !== 500)).toBe(true);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Play" }));
    await waitFor(() => expect(player.playView).toHaveBeenCalledTimes(1));
    expect(player.playView.mock.calls[0][1]).toBe(1);
  });

  it("shows the same groups in the right-click menu as in the bar, for one row and for several (FLW-8)", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(await within(yourTracks()).findByText("Harbour Lights", {}, LOADED));
    const bar = within(screen.getByRole("region", { name: "Your tracks" })).getByRole("toolbar", {
      name: "Selected tracks",
    });
    const entriesOf = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent!);
    const closeMenus = () => {
      for (let guard = 0; guard < 5 && screen.queryAllByRole("menu").length > 0; guard += 1) {
        fireEvent.keyDown(screen.getAllByRole("menu").at(-1)!, { key: "Escape" });
      }
    };

    for (const several of [false, true]) {
      if (several) fireEvent.click(within(yourTracks()).getByText("Low Tide"), { ctrlKey: true });
      fireEvent.contextMenu(within(yourTracks()).getByText("Harbour Lights").closest("[role=row]")!, {
        clientX: 10,
        clientY: 10,
      });
      const menu = await screen.findByRole("menu", {}, LOADED);
      const top = entriesOf(menu);
      expect(top.slice(-2)).toEqual(["Explore▸", "More▸"]);
      const inMenu: Record<string, string[]> = { Play: top.slice(0, -2) };
      for (const group of ["Explore", "More"]) {
        await userEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${group}`) }));
        inMenu[group] = entriesOf(await screen.findByRole("menu", { name: group }));
      }
      closeMenus();

      for (const group of ["Play", "Explore", "More"]) {
        fireEvent.click(within(bar).getByRole("button", { name: group }));
        const opened_ = await screen.findByRole("menu", { name: group }, LOADED);
        expect(entriesOf(opened_)).toEqual(inMenu[group]);
        closeMenus();
      }
    }
  });

  it("plays a selection of rows as the queue", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(await within(yourTracks()).findByText("Harbour Lights", {}, LOADED));
    fireEvent.click(within(yourTracks()).getByText("Low Tide"), { ctrlKey: true });
    fireEvent.contextMenu(rowOf("Low Tide"), { clientX: 10, clientY: 10 });
    const menu = await screen.findByRole("menu", {}, LOADED);
    // Two tracks: the bar's groups too, Explore for the first of them.
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Play 2 tracks",
      "Play next",
      "Add to queue",
      "Explore▸",
      "More▸",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Play 2 tracks" }));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledTimes(1));
    expect(player.playQueue.mock.calls[0][0].map((item: { title: string }) => item.title)).toEqual([
      "Harbour Lights",
      "Low Tide",
    ]);
  });
});

describe("the page as a way into the Library (DEC-043)", () => {
  it("opens the Library on the same rules, with the id's name for its chip", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(screen.getByRole("button", { name: "Open in Library" }));
    expect(where()).toBe("/library");
    const state = JSON.parse(screen.getByTestId("where").dataset.state ?? "null");
    expect(libraryOpening({ state, key: "k" })).toEqual({
      rules: pageOf("page_artist_id").rules,
      token: "k",
      names: { "beatport_artist:301001": "Mara Veil" },
    });
  });

  it("saves the same rules as a Smart Collection", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(screen.getByRole("button", { name: "Save as Smart Collection…" }));
    const dialog = await screen.findByRole("dialog", {}, LOADED);
    expect(await within(dialog).findByText("Beatport artist is Mara Veil", {}, LOADED)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Mara" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mock("saveSmartCollection")).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Mara", rules: pageOf("page_artist_id").rules }),
      ),
    );
    expect(await screen.findByText(/Saved “Mara”/, {}, LOADED)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps a refused save in the dialog", async () => {
    mock("saveSmartCollection").mockRejectedValue(new Error("A Collection called Mara exists"));
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(screen.getByRole("button", { name: "Save as Smart Collection…" }));
    const dialog = await screen.findByRole("dialog", {}, LOADED);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Mara" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(/A Collection called Mara exists/, {}, LOADED),
    ).toBeInTheDocument();
  });
});

describe("the Inspector on a page", () => {
  it("describes the library row selected, with its credits as links", async () => {
    renderAt(entityPath("artist", "bp:301001"));
    await opened("Mara Veil");
    fireEvent.click(await within(yourTracks()).findByText("Harbour Lights", {}, LOADED));
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    expect(await within(inspector).findByRole("heading", { name: "Harbour Lights" }, LOADED)).toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: "Kiko" }));
    expect(where()).toBe(entityPath("artist", "name:kiko"));
  });

  it("never describes a Beatport row, and one selection is the page's", async () => {
    renderAt(entityPath("label", "bp:40211"));
    await opened("Nightfall Audio");
    fireEvent.click(await within(yourTracks()).findByText("Harbour Lights", {}, LOADED));
    const inspector = screen.getByRole("complementary", { name: "Inspector" });
    await within(inspector).findByRole("heading", { name: "Harbour Lights" }, LOADED);
    const library = screen.getByRole("region", { name: "Your tracks" });
    expect(within(library).getByText("1 selected")).toBeInTheDocument();

    const table = await beatportRows(/Beatport's releases/);
    const cell = await within(table).findByText("Track 9 (Original Mix)", {}, LOADED);
    await act(async () => {
      fireEvent.mouseDown(cell);
      fireEvent.click(cell);
    });
    expect(
      await within(inspector).findByText(/Tracks on Beatport are not in your library/, {}, LOADED),
    ).toBeInTheDocument();
    // The library half let go of its selection.
    await waitFor(() => expect(within(library).queryByText("1 selected")).toBeNull());
  });
});
