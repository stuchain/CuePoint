/**
 * The Discover page (DISCOVER-10).
 *
 * The specification's component tests, against the real page over a faked
 * bridge whose every answer is the engine's own (`discoverPage.fixture.json`,
 * produced by `test_discover_page_fixture.py`):
 * - the run list, and a run's tracks with owned hidden and shown;
 * - the wantlist's filters;
 * - every Beatport token state, and the resolve prompt;
 * - the actions offered by selection size, and what each does;
 * - rows from Beatport are not library rows: double-click does nothing and the
 *   Inspector shows its empty state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type {
  DiscoverAnswer,
  DiscoverOptions,
  DiscoverRunHeader,
  DiscoverRunList,
  DiscoverRunTracksPage,
  WantlistPage,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { InspectorSlotOutlet, InspectorSlotProvider } from "../../components/shell";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { DiscoverScreen } from "./DiscoverScreen";
import fixture from "./discoverPage.fixture.json";
import { DISCOVER_SECTION_STORAGE_KEY } from "./discoverSections";

const LOADED = { timeout: 3000 };

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const RUNS = fixture.runs.value as unknown as DiscoverRunList;
const HEADER = fixture.run_header.value as unknown as DiscoverRunHeader;
const HIDDEN = fixture.run_tracks_hidden.value as unknown as DiscoverRunTracksPage;
const ALL = fixture.run_tracks_all.value as unknown as DiscoverRunTracksPage;
const ALL_OWNED = fixture.run_tracks_all_owned.value as unknown as DiscoverRunTracksPage;

function value<T>(of: T): DiscoverAnswer<T> {
  return { value: of, refusal: null };
}

function asAnswer<T>(state: { value: unknown; refusal: unknown }): DiscoverAnswer<T> {
  return state as unknown as DiscoverAnswer<T>;
}

/** A page of the run's tracks, echoing the window asked, as the engine does. */
function runPage(params: Record<string, unknown>): DiscoverAnswer<DiscoverRunTracksPage> {
  const runId = Number(params.run_id);
  const owned = (params.owned as string) ?? "hide";
  const base = runId === 1 ? (owned === "all" ? ALL : HIDDEN) : { ...HIDDEN, rows: [], total: 0, tracks: 0, owned: 0, hidden: 0 };
  return value({
    ...base,
    run_id: runId,
    window: {
      owned: owned as "hide" | "all" | "only",
      sort: (params.sort as "position") ?? "position",
      dir: (params.dir as "asc") ?? "asc",
      offset: Number(params.offset ?? 0),
      limit: Number(params.limit ?? 100),
    },
  });
}

/** A wantlist page for the filters asked, from the engine's answers. */
function wantlistPage(params: Record<string, unknown>): DiscoverAnswer<WantlistPage> {
  const owned = (params.owned as string) ?? "all";
  const bought = (params.bought as string) ?? "all";
  const base =
    bought === "only"
      ? fixture.wantlist_bought_only.value
      : owned === "hide"
        ? fixture.wantlist_not_owned.value
        : fixture.wantlist_all.value;
  const page = base as unknown as WantlistPage;
  return value({
    ...page,
    window: {
      owned: owned as "all",
      bought: bought as "all",
      sort: (params.sort as "added_at") ?? "added_at",
      dir: (params.dir as "desc") ?? "desc",
      offset: Number(params.offset ?? 0),
      limit: Number(params.limit ?? 100),
    },
  });
}

function header(runId: number): DiscoverAnswer<DiscoverRunHeader> {
  if (runId === 1) return value({ ...HEADER, run: RUNS.runs.find((run) => run.id === 1)! });
  return value({ run: RUNS.runs.find((run) => run.id === runId)!, artists: [], labels: [] });
}

function install(overrides: Record<string, Fn> = {}) {
  bridge = {
    getDiscoverOptions: vi.fn(async () => value(OPTIONS)),
    listDiscoveryRuns: vi.fn(async () => value(RUNS)),
    getDiscoveryRun: vi.fn(async ({ run_id }: { run_id: number }) => header(run_id)),
    getDiscoveryRunTracks: vi.fn(async (params: Record<string, unknown>) => runPage(params)),
    deleteDiscoveryRun: vi.fn(async () => asAnswer(fixture.run_deleted)),
    startDiscoveryRun: vi.fn(async () => asAnswer(fixture.run_started)),
    getWantlist: vi.fn(async (params: Record<string, unknown>) => wantlistPage(params ?? {})),
    addToWantlist: vi.fn(async () => asAnswer(fixture.wantlist_added)),
    removeFromWantlist: vi.fn(async () => asAnswer(fixture.wantlist_removed)),
    setWantlistNote: vi.fn(async () => asAnswer(fixture.wantlist_noted)),
    setWantlistBought: vi.fn(async () => asAnswer(fixture.wantlist_bought)),
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
      result:
        id === "job-push"
          ? fixture.playlist_result
          : id === "job-resolve"
            ? fixture.resolve_result
            : fixture.discovery_result,
    })),
    openBeatportPage: vi.fn(async () => true),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

/** Where the page navigated to, and with what state. */
function Settings() {
  const location = useLocation();
  return <p data-testid="settings">{JSON.stringify(location.state)}</p>;
}

function renderDiscover() {
  return render(
    <ScaleProvider>
      <ToastProvider>
        <InspectorSlotProvider>
          <MemoryRouter initialEntries={["/discover"]}>
            <Routes>
              <Route path="/discover" element={<DiscoverScreen />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </MemoryRouter>
          <aside data-testid="inspector">
            <InspectorSlotOutlet />
          </aside>
        </InspectorSlotProvider>
      </ToastProvider>
    </ScaleProvider>,
  );
}

async function openRun(id: number) {
  const list = await screen.findByRole("navigation", { name: "Runs" });
  const item = within(list)
    .getAllByRole("button")
    .find((button) => button.textContent?.includes(id === 1 ? "Finished" : "Failed"))!;
  fireEvent.click(item);
}

function table(name: string) {
  return screen.getByRole("table", { name });
}

function rowsOf(name: string) {
  return within(table(name))
    .getAllByRole("row")
    .filter((row) => row.getAttribute("aria-rowindex") !== "1");
}

function actionsBar(name: string) {
  return screen.getByRole("toolbar", { name: `${name}: actions` });
}

function buttonsOf(bar: HTMLElement): string[] {
  return within(bar)
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((label) => label !== "Columns…" && label !== "Clear");
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 600 });
  Element.prototype.scrollTo ??= function scrollTo() {};
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

describe("the page", () => {
  it("opens on Runs with the two tabs, and remembers the one last used", async () => {
    const first = renderDiscover();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Runs", "Wantlist"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs[1]!);
    expect(localStorage.getItem(DISCOVER_SECTION_STORAGE_KEY)).toBe("wantlist");
    first.unmount();

    renderDiscover();
    expect(await screen.findByRole("tab", { name: "Wantlist" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("says so when the engine cannot be reached, and asks again", async () => {
    install({ getDiscoverOptions: vi.fn().mockRejectedValueOnce(new Error("Engine offline")) });
    renderDiscover();
    expect(await screen.findByText("Engine offline")).toBeInTheDocument();
    bridge.getDiscoverOptions!.mockResolvedValue(value(OPTIONS));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("tab", { name: "Runs" })).toBeInTheDocument();
  });

  it("needs the desktop app, and says so rather than failing", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderDiscover();
    expect(
      await screen.findByText("Discover needs the desktop app with the engine connected."),
    ).toBeInTheDocument();
  });

  it("shows the Inspector's empty state, never a library track (DEC-097)", async () => {
    renderDiscover();
    await screen.findByRole("tab", { name: "Runs" });
    expect(screen.getByTestId("inspector")).toHaveTextContent(
      "Tracks found on Beatport are not in your library",
    );
  });
});

describe("Beatport's state", () => {
  it.each([
    ["options_no_token", "Beatport is not connected", "Open Settings"],
    ["options_rejected", "Beatport rejected the token", "Open Settings"],
    ["options_forbidden", "Beatport refused this token", "Open Settings"],
    ["options_rate_limited", "Beatport is limiting requests", "Try again"],
    ["options_unavailable", "Beatport cannot be reached", "Try again"],
  ] as const)("draws %s, and the page stays usable", async (state, headline, action) => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture[state])) });
    renderDiscover();
    const notice = (await screen.findByText(headline)).closest(".discover-banner") as HTMLElement;
    expect(within(notice).getByRole("button", { name: action })).toBeInTheDocument();
    // Past runs still open without Beatport.
    expect(await screen.findByRole("navigation", { name: "Runs" })).toBeInTheDocument();
  });

  it("says nothing when Beatport answered", async () => {
    renderDiscover();
    await screen.findByRole("navigation", { name: "Runs" });
    for (const headline of [
      "Beatport is not connected",
      "Beatport rejected the token",
      "Beatport refused this token",
      "Beatport is limiting requests",
      "Beatport cannot be reached",
    ]) {
      expect(screen.queryByText(headline)).toBeNull();
    }
  });

  it("links to the token field in Settings", async () => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_no_token)) });
    renderDiscover();
    fireEvent.click(await screen.findByRole("button", { name: "Open Settings" }));
    expect(await screen.findByTestId("settings")).toHaveTextContent('"settingsFocus":"beatport-token"');
  });

  it("asks again when told to try again", async () => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_unavailable)) });
    renderDiscover();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(bridge.getDiscoverOptions).toHaveBeenCalledTimes(2));
  });

  it("offers no run without a token", async () => {
    install({
      getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_no_token)),
      listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)),
    });
    renderDiscover();
    const start = await screen.findByRole("button", { name: "Start run" });
    expect(start).toBeDisabled();
    expect(screen.getByText("Needs a Beatport token, in Settings.")).toBeInTheDocument();
  });

  it("shows a token refused as a run starts, over what options said", async () => {
    install({
      listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)),
      startDiscoveryRun: vi.fn(async () => asAnswer(fixture.refusal_no_token)),
    });
    renderDiscover();
    fireEvent.click(await screen.findByRole("checkbox", { name: "House" }));
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByText("Beatport is not connected")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("no token");
  });
});

describe("the resolve prompt", () => {
  it("says how many matched tracks are unread, and starts the resolve", async () => {
    renderDiscover();
    const prompt = await screen.findByRole("status", { name: "Resolve Beatport identities" });
    expect(prompt).toHaveTextContent("2 matched tracks have not been read from Beatport yet.");
    install({ ...bridge, getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_resolved)) });
    fireEvent.click(within(prompt).getByRole("button", { name: "Resolve Beatport identities" }));
    await waitFor(() => expect(bridge.startBeatportResolve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Read 2 tracks from Beatport.")).toBeInTheDocument();
    // Options read again: nothing left to read, so no prompt.
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Resolve Beatport identities" })).toBeNull(),
    );
  });

  it("is not offered when nothing is left to read, or Beatport cannot be asked", async () => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_resolved)) });
    const first = renderDiscover();
    await screen.findByRole("navigation", { name: "Runs" });
    expect(screen.queryByRole("status", { name: "Resolve Beatport identities" })).toBeNull();
    first.unmount();

    const noToken = fixture.options_no_token.value as unknown as DiscoverOptions;
    install({
      getDiscoverOptions: vi.fn(async () =>
        value({ ...noToken, resolve: { owned: 2, to_read: 2 } }),
      ),
    });
    renderDiscover();
    await screen.findByRole("navigation", { name: "Runs" });
    expect(screen.queryByRole("status", { name: "Resolve Beatport identities" })).toBeNull();
  });
});

describe("runs", () => {
  it("lists the runs newest first, each with its date, state, scope and count", async () => {
    renderDiscover();
    const list = await screen.findByRole("navigation", { name: "Runs" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Failed");
    expect(items[0]).toHaveTextContent("0 tracks found");
    expect(items[1]).toHaveTextContent("Finished");
    expect(items[1]).toHaveTextContent("House, Techno (Peak Time / Driving) · 30 days of releases");
    expect(items[1]).toHaveTextContent("7 tracks found");
  });

  it("opens the newest run, and says why it stopped", async () => {
    renderDiscover();
    expect(
      await screen.findByText(
        "Stopped because Beatport rejected the token, after 0 tracks from 0 charts and 0 releases.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("This run found nothing.")).toBeInTheDocument();
  });

  it("opens on New run when there are no runs", async () => {
    install({ listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)) });
    renderDiscover();
    expect(await screen.findByRole("region", { name: "New run" })).toBeInTheDocument();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
  });

  it("says what a run looked for", async () => {
    renderDiscover();
    await openRun(1);
    const looked = await screen.findByRole("list", { name: "What this run looked for" });
    expect(looked).toHaveTextContent("in House, Techno (Peak Time / Driving)");
    expect(looked).toHaveTextContent("Artists: every artist in your library (3)");
    expect(looked).toHaveTextContent("Labels: every label in your library (2)");
    expect(screen.getByText("The 3 artists it looked for")).toBeInTheDocument();
  });

  it("hides owned tracks and counts them, and shows them when asked (DEC-092)", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found")).toHaveLength(HIDDEN.total), LOADED);
    expect(screen.getByText("2 owned tracks hidden")).toBeInTheDocument();
    expect(bridge.getDiscoveryRunTracks).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 1, owned: "hide", sort: "position", dir: "asc" }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Show tracks you own" }));
    await waitFor(() => expect(rowsOf("Tracks this run found")).toHaveLength(ALL.total), LOADED);
    expect(screen.queryByText("2 owned tracks hidden")).toBeNull();
    const owned = rowsOf("Tracks this run found").filter((row) =>
      within(row).queryByText("Owned"),
    );
    expect(owned).toHaveLength(2);
    expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({ owned: "all" }),
    );
  });

  it("says so when every track found is one the library owns", async () => {
    install({
      getDiscoveryRunTracks: vi.fn(async (params: Record<string, unknown>) => ({
        value: { ...ALL_OWNED, run_id: Number(params.run_id), window: { ...ALL_OWNED.window } },
        refusal: null,
      })),
    });
    renderDiscover();
    await openRun(1);
    expect(await screen.findByText("You own every track this run found.")).toBeInTheDocument();
  });

  it("sorts by what the engine sorts by", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(within(table("Tracks this run found")).getByRole("button", { name: "Released" }));
    await waitFor(() =>
      expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "release_date", dir: "asc" }),
      ),
    );
    // A column the engine cannot order by is not a button that pretends to.
    expect(within(table("Tracks this run found")).getByRole("button", { name: "Label" })).toBeDisabled();
  });

  it("offers actions by selection size", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(2), LOADED);
    const bar = actionsBar("Tracks this run found");
    expect(buttonsOf(bar)).toEqual(["Push to Beatport playlist…"]);
    expect(bar).toHaveTextContent(`${HIDDEN.total} tracks`);

    const [first, , third] = rowsOf("Tracks this run found");
    fireEvent.click(first!);
    expect(buttonsOf(bar)).toEqual([
      "Add to wantlist",
      "Push to Beatport playlist…",
      "Open on Beatport",
    ]);
    fireEvent.click(third!, { shiftKey: true });
    expect(bar).toHaveTextContent("3 tracks selected");
    fireEvent.click(first!, { ctrlKey: true });
    expect(bar).toHaveTextContent("2 tracks selected");
    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(buttonsOf(bar)).toEqual(["Push to Beatport playlist…"]);
  });

  it("adds the selection to the wantlist from the run, and reads the run again", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(1), LOADED);
    const [first, second] = rowsOf("Tracks this run found");
    fireEvent.click(first!);
    fireEvent.click(second!, { ctrlKey: true });
    const reads = bridge.getDiscoveryRunTracks!.mock.calls.length;
    fireEvent.click(within(actionsBar("Tracks this run found")).getByRole("button", { name: "Add to wantlist" }));
    expect(await screen.findByText("Added 2 tracks to the wantlist")).toBeInTheDocument();
    expect(bridge.addToWantlist).toHaveBeenCalledWith({
      track_ids: [HIDDEN.rows[0]!.beatport_track_id, HIDDEN.rows[1]!.beatport_track_id],
      run_id: 1,
    });
    await waitFor(() => expect(bridge.getDiscoveryRunTracks!.mock.calls.length).toBeGreaterThan(reads));
  });

  it("opens a track on Beatport", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this run found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open on Beatport" }));
    await waitFor(() => expect(bridge.openBeatportPage).toHaveBeenCalledWith(HIDDEN.rows[0]!.url));
  });

  it("says so when a page is not opened", async () => {
    install({ openBeatportPage: vi.fn(async () => false) });
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this run found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open on Beatport" }));
    expect(await screen.findByText(/CuePoint opens only pages on beatport\.com/)).toBeInTheDocument();
  });

  it("does nothing on a double-click: a Beatport row has no file to play", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    const calls = Object.values(bridge).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    fireEvent.doubleClick(rowsOf("Tracks this run found")[0]!);
    await act(async () => {});
    const after = Object.values(bridge).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    expect(after).toBe(calls);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers the same actions on a right-click, selecting the row", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.contextMenu(rowsOf("Tracks this run found")[1]!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Add to wantlist",
      "Push to Beatport playlist…",
      "Open on Beatport",
    ]);
    expect(actionsBar("Tracks this run found")).toHaveTextContent("1 track selected");
  });

  it("pushes the whole table by the run, in its order, with owned left out", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Push to Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Playlist name")).toHaveValue(OPTIONS.defaults.playlist_name);
    expect(dialog).toHaveTextContent(`the ${HIDDEN.total} tracks this table shows`);
    fireEvent.change(within(dialog).getByLabelText("Playlist name"), {
      target: { value: "Friday finds" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Push" }));
    await waitFor(() =>
      expect(bridge.startBeatportPlaylistPush).toHaveBeenCalledWith({
        name: "Friday finds",
        include_owned: false,
        run_id: 1,
        owned: "hide",
        sort: "position",
        dir: "asc",
      }),
    );
    const outcome = await screen.findByRole("status", { name: "Beatport playlist" });
    expect(outcome).toHaveTextContent(
      "Added 2 tracks to “Friday finds” on Beatport. 1 track you own was left out.",
    );
    fireEvent.click(within(outcome).getByRole("button", { name: "Open the playlist" }));
    await waitFor(() =>
      expect(bridge.openBeatportPage).toHaveBeenCalledWith(fixture.playlist_result.playlist_url),
    );
  });

  it("pushes the run in the order the table is sorted by", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    const released = within(table("Tracks this run found")).getByRole("button", { name: "Released" });
    fireEvent.click(released);
    fireEvent.click(released);
    await waitFor(() =>
      expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "release_date", dir: "desc" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Push to Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Push" }));
    await waitFor(() =>
      expect(bridge.startBeatportPlaylistPush).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: 1, sort: "release_date", dir: "desc" }),
      ),
    );
  });

  it("pushes a selection by its ids, and keeps a refusal in the dialog", async () => {
    install({
      startBeatportPlaylistPush: vi.fn(async () =>
        value({ id: "job-push", type: "beatport_playlist", state: "queued" }),
      ),
    });
    bridge.startBeatportPlaylistPush!.mockResolvedValueOnce({
      value: null,
      refusal: { ...fixture.refusal_busy.refusal, job_type: "beatport_playlist" },
    });
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this run found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Push to Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include tracks you already own" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Push" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A push to Beatport is already running.",
    );
    expect(bridge.startBeatportPlaylistPush).toHaveBeenLastCalledWith({
      name: OPTIONS.defaults.playlist_name,
      include_owned: true,
      track_ids: [HIDDEN.rows[0]!.beatport_track_id],
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Push" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses a playlist name the engine would refuse", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this run found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Push to Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Playlist name");
    fireEvent.change(name, { target: { value: "   " } });
    expect(within(dialog).getByRole("button", { name: "Push" })).toBeDisabled();
    fireEvent.change(name, { target: { value: "x".repeat(201) } });
    expect(within(dialog).getByText("A playlist name is at most 200 characters.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Push" })).toBeDisabled();
  });

  it("deletes an ended run after asking, and opens the next", async () => {
    renderDiscover();
    await openRun(1);
    fireEvent.click(await screen.findByRole("button", { name: "Delete run…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this run?" });
    install({
      ...bridge,
      listDiscoveryRuns: vi.fn(async () =>
        value({ ...RUNS, runs: RUNS.runs.filter((run) => run.id !== 1), total: 1 }),
      ),
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete run" }));
    await waitFor(() => expect(bridge.deleteDiscoveryRun).toHaveBeenCalledWith({ run_id: 1 }));
    expect(await screen.findByText(/Deleted the run/)).toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "Runs" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
  });

  it("goes back to the list when a run is gone", async () => {
    install({
      getDiscoveryRun: vi.fn(async ({ run_id }: { run_id: number }) =>
        run_id === 1 ? asAnswer(fixture.refusal_run_gone) : header(run_id),
      ),
    });
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(bridge.listDiscoveryRuns.mock.calls.length).toBeGreaterThan(1));
    expect(await screen.findByText(/Stopped because Beatport rejected the token/)).toBeInTheDocument();
  });
});

describe("a new run", () => {
  beforeEach(() => {
    install({ listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)) });
  });

  it("starts from the engine's defaults, and asks for what was chosen", async () => {
    renderDiscover();
    const panel = await screen.findByRole("region", { name: "New run" });
    expect(within(panel).getByLabelText("Releases from the last (days)")).toHaveValue(30);
    expect(within(panel).getByLabelText("Charts from")).toHaveValue(OPTIONS.defaults.charts_from);
    // No genre chosen: no chart dates to give.
    expect(within(panel).getByLabelText("Charts from")).toBeDisabled();
    expect(within(panel).getByText("Every artist in your library (3)")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.change(within(panel).getByLabelText("Releases from the last (days)"), {
      target: { value: "14" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(bridge.startDiscoveryRun).toHaveBeenCalledWith({
        genre_ids: [5],
        new_releases_days: 14,
        artists: null,
        labels: null,
        charts_from: OPTIONS.defaults.charts_from,
        charts_to: OPTIONS.defaults.charts_to,
      }),
    );
    expect(
      await screen.findByText("Discovery found 7 tracks from 3 charts and 2 releases."),
    ).toBeInTheDocument();
  });

  it("picks artists from the Library's facet, with counts", async () => {
    renderDiscover();
    const panel = await screen.findByRole("region", { name: "New run" });
    const artists = within(panel).getByRole("group", { name: "Artists" });
    fireEvent.click(within(artists).getByRole("radio", { name: "Only the artists I choose" }));
    expect(within(panel).getByText("Choose at least one artist, or look for every one.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start run" })).toBeDisabled();

    fireEvent.click(within(artists).getByRole("button", { name: "Choose artists…" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose artists" });
    fireEvent.change(within(dialog).getByLabelText("Find artists"), { target: { value: "ki" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Kiko/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(within(artists).getByText("1 artist: Kiko")).toBeInTheDocument();

    const labels = within(panel).getByRole("group", { name: "Labels" });
    fireEvent.click(within(labels).getByRole("radio", { name: "No labels" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(bridge.startDiscoveryRun).toHaveBeenCalledWith(
        expect.objectContaining({ artists: ["Kiko"], labels: [] }),
      ),
    );
  });

  it("shows the engine's refusal in its words", async () => {
    install({
      ...bridge,
      startDiscoveryRun: vi.fn(async () => ({
        value: null,
        refusal: { ...fixture.refusal_note_too_long.refusal, message: "The chart window ends before it starts" },
      })),
    });
    renderDiscover();
    const panel = await screen.findByRole("region", { name: "New run" });
    fireEvent.click(within(panel).getByRole("button", { name: "Start run" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "The chart window ends before it starts",
    );
  });

  it("opens the run a start began once the engine has made it", async () => {
    const running = { ...RUNS.runs[1]!, id: 3, job_id: "job-1", running: true, outcome: null };
    let listed: DiscoverRunList = fixture.runs_empty.value as unknown as DiscoverRunList;
    install({
      ...bridge,
      listDiscoveryRuns: vi.fn(async () => value(listed)),
      getDiscoveryRun: vi.fn(async () => value({ run: running, artists: [], labels: [] })),
      getJob: vi.fn(async (id: string) => ({ id, state: "running" })),
    });
    render(
      <ScaleProvider>
        <ToastProvider>
          <InspectorSlotProvider>
            <MemoryRouter>
              <DiscoverScreen />
            </MemoryRouter>
          </InspectorSlotProvider>
        </ToastProvider>
      </ScaleProvider>,
    );
    const panel = await screen.findByRole("region", { name: "New run" });
    listed = { ...listed, runs: [running], total: 1 };
    fireEvent.click(within(panel).getByRole("button", { name: "Start run" }));
    expect(await screen.findByText("Running: 7 tracks from 3 charts and 2 releases so far.", {}, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe("the wantlist", () => {
  beforeEach(() => {
    localStorage.setItem(DISCOVER_SECTION_STORAGE_KEY, "wantlist");
  });

  const WANTED = fixture.wantlist_all.value as unknown as WantlistPage;

  it("draws the wanted tracks with their note, marks and counts", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    expect(screen.getByText("For the Friday warm-up")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Wantlist filters" })).toHaveTextContent(
      `${WANTED.entries} wanted tracks, ${WANTED.bought} bought, ${WANTED.owned} owned`,
    );
  });

  it("filters by bought and by owned, independently", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    fireEvent.change(screen.getByLabelText("Bought"), { target: { value: "only" } });
    const bought = fixture.wantlist_bought_only.value as unknown as WantlistPage;
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(bought.total), LOADED);
    expect(bridge.getWantlist).toHaveBeenLastCalledWith(
      expect.objectContaining({ owned: "all", bought: "only" }),
    );
    fireEvent.change(screen.getByLabelText("Bought"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Owned"), { target: { value: "hide" } });
    const notOwned = fixture.wantlist_not_owned.value as unknown as WantlistPage;
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(notOwned.total), LOADED);
    expect(bridge.getWantlist).toHaveBeenLastCalledWith(
      expect.objectContaining({ owned: "hide", bought: "all" }),
    );
  });

  it("says the wantlist is empty, and how to fill it", async () => {
    install({ getWantlist: vi.fn(async () => asAnswer(fixture.wantlist_empty)) });
    renderDiscover();
    expect(await screen.findByText("Your wantlist is empty.")).toBeInTheDocument();
  });

  it("offers a wanted track its actions by selection size", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(1), LOADED);
    const bar = actionsBar("Wantlist");
    expect(buttonsOf(bar)).toEqual(["Push to Beatport playlist…"]);
    const notBought = WANTED.rows.findIndex((row) => row.bought_at === null);
    fireEvent.click(rowsOf("Wantlist")[notBought]!);
    expect(buttonsOf(bar)).toEqual([
      "Push to Beatport playlist…",
      "Open on Beatport",
      "Edit note…",
      "Mark bought",
      "Remove from wantlist",
    ]);
    const other = WANTED.rows.findIndex((row, index) => index !== notBought && row.bought_at === null);
    fireEvent.click(rowsOf("Wantlist")[other]!, { ctrlKey: true });
    expect(buttonsOf(bar)).toEqual([
      "Push to Beatport playlist…",
      "Open on Beatport",
      "Mark bought",
      "Remove from wantlist",
    ]);
  });

  it("marks a track bought, and un-marks one that was", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(1), LOADED);
    const notBought = WANTED.rows.findIndex((row) => row.bought_at === null);
    fireEvent.click(rowsOf("Wantlist")[notBought]!);
    fireEvent.click(screen.getByRole("button", { name: "Mark bought" }));
    await waitFor(() =>
      expect(bridge.setWantlistBought).toHaveBeenCalledWith({
        track_ids: [WANTED.rows[notBought]!.beatport_track_id],
        bought: true,
      }),
    );
    expect(await screen.findByText(fixture.wantlist_bought.value.message)).toBeInTheDocument();

    const bought = WANTED.rows.findIndex((row) => row.bought_at !== null);
    fireEvent.click(rowsOf("Wantlist")[bought]!);
    fireEvent.click(screen.getByRole("button", { name: "Mark not bought" }));
    await waitFor(() =>
      expect(bridge.setWantlistBought).toHaveBeenLastCalledWith({
        track_ids: [WANTED.rows[bought]!.beatport_track_id],
        bought: false,
      }),
    );
  });

  it("removes tracks and says so", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(1), LOADED);
    fireEvent.click(rowsOf("Wantlist")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Remove from wantlist" }));
    expect(await screen.findByText("Removed 2 tracks from the wantlist")).toBeInTheDocument();
    expect(actionsBar("Wantlist")).not.toHaveTextContent("selected");
  });

  it("edits a note, and keeps the text when the engine refuses it", async () => {
    install({ setWantlistNote: vi.fn(async () => asAnswer(fixture.refusal_note_too_long)) });
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Wantlist")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Edit note…" }));
    const dialog = await screen.findByRole("dialog", { name: "Wantlist note" });
    fireEvent.change(within(dialog).getByLabelText("Note"), { target: { value: "Ask the shop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A note is at most 1000 characters",
    );
    expect(within(dialog).getByLabelText("Note")).toHaveValue("Ask the shop");

    bridge.setWantlistNote!.mockResolvedValue(asAnswer(fixture.wantlist_noted));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bridge.setWantlistNote).toHaveBeenLastCalledWith({
      track_id: WANTED.rows[0]!.beatport_track_id,
      note: "Ask the shop",
    });
  });

  it("pushes every track the list shows, read from the engine, in its order", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Push to Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Push" }));
    await waitFor(() =>
      expect(bridge.startBeatportPlaylistPush).toHaveBeenCalledWith({
        name: OPTIONS.defaults.playlist_name,
        include_owned: false,
        track_ids: WANTED.rows.map((row) => row.beatport_track_id),
      }),
    );
  });
});
