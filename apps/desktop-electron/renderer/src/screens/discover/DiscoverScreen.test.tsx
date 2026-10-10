/**
 * The Discover page (DISCOVER-10).
 *
 * The specification's component tests, against the real page over a faked
 * bridge whose every answer is the engine's own (`discoverPage.fixture.json`,
 * produced by `test_discover_page_fixture.py`):
 * - the three tabs (FLW-15): New search, Results with its past searches, Wantlist;
 * - a search's tracks with the ones in the library hidden and shown;
 * - the wantlist's filters;
 * - every Beatport token state, and the lookup prompt;
 * - the actions, always shown, and what each does;
 * - artist and label names as links (FLW-16);
 * - rows from Beatport are not library rows: double-click does nothing and the
 *   Inspector shows its empty state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { jobExplainer } from "../../components/shell/useActiveJob";
import { getSelectedTrack, setSelectedTrack } from "../../components/shell/selectedTrack";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { DiscoverScreen } from "./DiscoverScreen";
import fixture from "./discoverPage.fixture.json";
import { DISCOVER_SECTION_STORAGE_KEY } from "./discoverSections";
import { HINT_CARD_STORAGE_KEY } from "./DiscoverHintCard";
import { IN_LIBRARY_EXPLAINER } from "./HideOwnedSwitch";
import { HIDE_OWNED_STORAGE_KEY } from "./useHideOwned";
import { foundLine } from "./discoverFormat";

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
  return (
    <>
      <p data-testid="settings">{JSON.stringify(location.state)}</p>
      <p data-testid="where">{location.pathname}</p>
    </>
  );
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
              <Route path="/discover/*" element={<Settings />} />
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
  const list = await screen.findByRole("navigation", { name: "Past searches" });
  const item = within(list)
    .getAllByRole("button")
    .find((button) => button.textContent?.includes(id === 1 ? "Finished" : "Failed"))!;
  fireEvent.click(item);
}

/** The New search tab, which holds the form. */
async function openNewSearch() {
  fireEvent.click(await screen.findByRole("tab", { name: "New search" }));
  return screen.findByRole("region", { name: "New search" });
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
  setSelectedTrack(null);
  install();
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the page", () => {
  it("opens on Results with the three tabs, and remembers the one last used", async () => {
    const first = renderDiscover();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["New search", "Results", "Wantlist"]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs[2]!);
    expect(localStorage.getItem(DISCOVER_SECTION_STORAGE_KEY)).toBe("wantlist");
    first.unmount();

    renderDiscover();
    expect(await screen.findByRole("tab", { name: "Wantlist" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("says what Discover is for under the title (DSC-1)", async () => {
    renderDiscover();
    await screen.findAllByRole("tab");
    expect(
      screen.getByText(
        "Find new music from the artists and labels already in your library, keep what you want on a wantlist, and send it to a Beatport playlist.",
      ),
    ).toBeInTheDocument();
  });

  it("never shows the word Run to the user", async () => {
    install({ listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)) });
    renderDiscover();
    await screen.findByText("No searches yet");
    await openNewSearch();
    expect(document.body.textContent ?? "").not.toMatch(/\bruns?\b/i);
  });

  it("never shows the word Run on an open search: title, toolbar, delete dialog, running note", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    expect(document.body.textContent ?? "").not.toMatch(/\bruns?\b/i);
    const list = screen.getByRole("navigation", { name: "Past searches" });
    const row = within(list)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Finished"))!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete this search…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this search?" });
    expect(dialog.textContent ?? "").not.toMatch(/\bruns?\b/i);
    expect(document.body.textContent ?? "").not.toMatch(/\bruns?\b/i);
  });

  it("never shows the word Run in a running search's explainer", async () => {
    const running = { ...RUNS.runs[1]!, running: true, outcome: null };
    install({
      listDiscoveryRuns: vi.fn(async () => value({ ...RUNS, runs: [running], total: 1 })),
      getDiscoveryRun: vi.fn(async () => value({ run: running, artists: [], labels: [] })),
    });
    renderDiscover();
    await screen.findByText(/Running: 7 tracks from 3 charts/);
    expect(document.body.textContent ?? "").not.toMatch(/\bruns?\b/i);
  });

  it("says so when the engine cannot be reached, and asks again", async () => {
    install({ getDiscoverOptions: vi.fn().mockRejectedValueOnce(new Error("Engine offline")) });
    renderDiscover();
    expect(await screen.findByText("Engine offline")).toBeInTheDocument();
    bridge.getDiscoverOptions!.mockResolvedValue(value(OPTIONS));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("tab", { name: "Results" })).toBeInTheDocument();
  });

  it("needs the desktop app, and says so rather than failing", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    renderDiscover();
    expect(
      await screen.findByText("Discover needs the desktop app with CuePoint's library service running."),
    ).toBeInTheDocument();
  });

  it("shows the Inspector's empty state, never a library track (DEC-097)", async () => {
    renderDiscover();
    await screen.findByRole("tab", { name: "Results" });
    expect(screen.getByTestId("inspector")).toHaveTextContent(
      "Tracks found on Beatport are not in your library",
    );
  });
});

describe("the card that points to the other pages (DSC-11)", () => {
  it("names the artist and label links and Similar tracks in Track details, not a right-click", async () => {
    renderDiscover();
    const card = await screen.findByRole("note", { name: "Also in Discover" });
    expect(card).toHaveTextContent("artist");
    expect(card).toHaveTextContent("label");
    expect(card).toHaveTextContent("Similar tracks");
    expect(card).toHaveTextContent("Track details");
    expect(card).not.toHaveTextContent(/right-click/i);
  });

  it("is shown once: dismissed, it stays away", async () => {
    const first = renderDiscover();
    fireEvent.click(
      within(await screen.findByRole("note", { name: "Also in Discover" })).getByRole("button", {
        name: "Got it",
      }),
    );
    expect(screen.queryByRole("note", { name: "Also in Discover" })).toBeNull();
    expect(localStorage.getItem(HINT_CARD_STORAGE_KEY)).toBe("1");
    first.unmount();
    renderDiscover();
    await screen.findAllByRole("tab");
    expect(screen.queryByRole("note", { name: "Also in Discover" })).toBeNull();
  });
});

describe("Beatport's state", () => {
  it.each([
    ["options_no_token", "Connect your Beatport account", "Open Settings"],
    ["options_rejected", "Beatport rejected the token", "Open Settings"],
    ["options_forbidden", "Beatport refused this token", "Open Settings"],
    ["options_rate_limited", "Beatport is limiting requests", "Try again"],
    ["options_unavailable", "Beatport cannot be reached", "Try again"],
  ] as const)("draws %s, and the page stays usable", async (state, headline, action) => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture[state])) });
    renderDiscover();
    const notice = (await screen.findByText(headline)).closest(".discover-banner") as HTMLElement;
    expect(within(notice).getByRole("button", { name: action })).toBeInTheDocument();
    // Past searches still open without Beatport.
    expect(await screen.findByRole("navigation", { name: "Past searches" })).toBeInTheDocument();
  });

  it("says nothing when Beatport answered", async () => {
    renderDiscover();
    await screen.findByRole("navigation", { name: "Past searches" });
    for (const headline of [
      "Connect your Beatport account",
      "Beatport rejected the token",
      "Beatport refused this token",
      "Beatport is limiting requests",
      "Beatport cannot be reached",
    ]) {
      expect(screen.queryByText(headline)).toBeNull();
    }
  });

  it("explains the token and where to get one, then goes to the token field", async () => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_no_token)) });
    renderDiscover();
    const banner = (await screen.findByText("Connect your Beatport account")).closest(
      ".discover-banner",
    ) as HTMLElement;
    expect(banner).toHaveTextContent("Beatport sign-in key (a “token”)");
    expect(banner).toHaveTextContent("“How do I get a token?”");
    expect(banner).toHaveTextContent("Your past searches and wantlist still open without it.");
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

  it("offers no search without a token", async () => {
    install({
      getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_no_token)),
      listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)),
    });
    renderDiscover();
    await openNewSearch();
    const start = await screen.findByRole("button", { name: "Start looking" });
    expect(start).toBeDisabled();
    expect(screen.getByText("Needs a Beatport token, in Settings.")).toBeInTheDocument();
  });

  it("shows a token refused as a search starts, over what options said", async () => {
    install({
      listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)),
      startDiscoveryRun: vi.fn(async () => asAnswer(fixture.refusal_no_token)),
    });
    renderDiscover();
    await openNewSearch();
    fireEvent.click(await screen.findByRole("checkbox", { name: "House" }));
    fireEvent.click(screen.getByRole("button", { name: "Start looking" }));
    expect(await screen.findByText("Connect your Beatport account")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("no token");
  });
});

describe("the lookup prompt (DSC-4)", () => {
  it("says how many matched tracks still need looking up, and starts the lookup", async () => {
    renderDiscover();
    const prompt = await screen.findByRole("status", { name: "Beatport lookup" });
    expect(prompt).toHaveTextContent(
      "2 of your matched tracks still need their Beatport artist and label looked up. This makes artist pages and searches more accurate.",
    );
    install({ ...bridge, getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_resolved)) });
    fireEvent.click(within(prompt).getByRole("button", { name: "Look them up now" }));
    await waitFor(() => expect(bridge.startBeatportResolve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Looked up 2 tracks on Beatport.")).toBeInTheDocument();
    // Options read again: nothing left to look up, so no prompt.
    await waitFor(() => expect(screen.queryByRole("status", { name: "Beatport lookup" })).toBeNull());
  });

  it("says what it is doing while it works, and that the page can be left", async () => {
    install({ getJob: vi.fn(async (id: string) => ({ id, state: "running" })) });
    renderDiscover();
    const prompt = await screen.findByRole("status", { name: "Beatport lookup" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Look them up now" }));
    await waitFor(() => expect(bridge.startBeatportResolve).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Beatport lookup" })).toHaveTextContent(
        "Looking up 2 tracks on Beatport…",
      ),
    );
    expect(screen.getByRole("status", { name: "Beatport lookup" })).toHaveTextContent(
      jobExplainer("beatport_resolve"),
    );
  });

  it("follows a lookup the engine started itself, and reads the options again when it ends", async () => {
    let active = true;
    install({
      getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_resolved)),
      listJobs: vi.fn(async () => ({
        jobs: active ? [{ id: "job-auto", type: "beatport_resolve", state: "running" }] : [],
        active_count: active ? 1 : 0,
      })),
      getJob: vi.fn(async (id: string) => ({ id, state: active ? "running" : "succeeded" })),
    });
    renderDiscover();
    const prompt = await screen.findByRole("status", { name: "Beatport lookup" });
    // Nothing left to count, yet it is working: never "Looking up 0 tracks".
    expect(prompt).toHaveTextContent("Looking up tracks on Beatport…");
    expect(prompt).not.toHaveTextContent("0 tracks");
    expect(bridge.startBeatportResolve).not.toHaveBeenCalled();
    const reads = bridge.getDiscoverOptions!.mock.calls.length;
    active = false;
    await waitFor(() => expect(bridge.getDiscoverOptions!.mock.calls.length).toBeGreaterThan(reads), {
      timeout: 4000,
    });
    await waitFor(() => expect(screen.queryByRole("status", { name: "Beatport lookup" })).toBeNull());
  });

  it("is not offered when nothing is left to look up, or Beatport cannot be asked", async () => {
    install({ getDiscoverOptions: vi.fn(async () => asAnswer(fixture.options_resolved)) });
    const first = renderDiscover();
    await screen.findByRole("navigation", { name: "Past searches" });
    expect(screen.queryByRole("status", { name: "Beatport lookup" })).toBeNull();
    first.unmount();

    const noToken = fixture.options_no_token.value as unknown as DiscoverOptions;
    install({
      getDiscoverOptions: vi.fn(async () =>
        value({ ...noToken, resolve: { owned: 2, to_read: 2 } }),
      ),
    });
    renderDiscover();
    await screen.findByRole("navigation", { name: "Past searches" });
    expect(screen.queryByRole("status", { name: "Beatport lookup" })).toBeNull();
  });
});

describe("Results", () => {
  it("lists the past searches newest first, each titled by its date, with its state, scope and count", async () => {
    renderDiscover();
    const list = await screen.findByRole("navigation", { name: "Past searches" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/^Search of /);
    expect(items[0]).toHaveTextContent("Failed");
    expect(items[0]).toHaveTextContent("0 tracks found");
    expect(items[1]).toHaveTextContent("Finished");
    expect(items[1]).toHaveTextContent("House, Techno (Peak Time / Driving) · 30 days of releases");
    expect(items[1]).toHaveTextContent("7 tracks found");
    for (const item of items) {
      expect(within(item).getByRole("button", { name: "Delete this search…" })).toBeInTheDocument();
    }
  });

  it("keeps each card's delete button beside its text, not inside it, with the long text titled", async () => {
    renderDiscover();
    const list = await screen.findByRole("navigation", { name: "Past searches" });
    for (const item of within(list).getAllByRole("listitem")) {
      const card = item.querySelector<HTMLElement>(".discover-runs__item")!;
      const remove = within(item).getByRole("button", { name: "Delete this search…" });
      // A sibling of the card, so layout can put it on its own line.
      expect(card.contains(remove)).toBe(false);
      expect(remove.parentElement?.closest("li")).toBe(item);
      const what = card.querySelector<HTMLElement>(".discover-runs__what")!;
      expect(what).toHaveAttribute("title", what.textContent ?? "");
    }
  });

  it("opens the newest search, and says why it stopped", async () => {
    renderDiscover();
    expect(
      await screen.findByText(
        "Stopped because Beatport rejected the token, after 0 tracks from 0 charts and 0 releases.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("This search found nothing.")).toBeInTheDocument();
  });

  it("says there are no searches yet, and opens New search from there", async () => {
    install({ listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)) });
    renderDiscover();
    expect(await screen.findByText("No searches yet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "New search" })).toBeNull();
    const tabpanel = screen.getByRole("tabpanel", { name: "Results" });
    fireEvent.click(within(tabpanel).getByRole("button", { name: "New search" }));
    expect(await screen.findByRole("region", { name: "New search" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "New search" })).toHaveAttribute("aria-selected", "true");
  });

  it("says what it looked for, under a line of that name", async () => {
    renderDiscover();
    await openRun(1);
    const looked = await screen.findByRole("list", { name: "What it looked for" });
    expect(screen.getByText("What it looked for")).toBeInTheDocument();
    expect(looked).toHaveTextContent("in House, Techno (Peak Time / Driving)");
    expect(looked).toHaveTextContent("Artists: every artist in your library (3)");
    expect(looked).toHaveTextContent("Labels: every label in your library (2)");
    expect(screen.getByText("The 3 artists it looked for")).toBeInTheDocument();
  });

  it("hides what is already in your library, with one switch and one count line (DSC-6, DEC-092)", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found")).toHaveLength(HIDDEN.total), LOADED);
    const hide = screen.getByRole("checkbox", { name: "Hide tracks already in your library" });
    expect(hide).toBeChecked();
    const hiddenLine = foundLine(HIDDEN.tracks, HIDDEN.owned, true);
    expect(hiddenLine).toMatch(/already in your library \(hidden\)$/);
    expect(screen.getByText(hiddenLine)).toBeInTheDocument();
    // The two lines it used to say are gone.
    expect(screen.queryByText(/owned tracks hidden/)).toBeNull();
    expect(screen.queryByText(/found, \d+ owned/)).toBeNull();
    expect(bridge.getDiscoveryRunTracks).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 1, owned: "hide", sort: "position", dir: "asc" }),
    );

    fireEvent.click(hide);
    await waitFor(() => expect(rowsOf("Tracks this search found")).toHaveLength(ALL.total), LOADED);
    expect(screen.queryByText(hiddenLine)).toBeNull();
    expect(screen.getByText(foundLine(HIDDEN.tracks, HIDDEN.owned, false))).toBeInTheDocument();
    const owned = rowsOf("Tracks this search found").filter((row) =>
      within(row).queryByText("In your library"),
    );
    expect(owned).toHaveLength(2);
    expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
      expect.objectContaining({ owned: "all" }),
    );
  });

  it("explains 'in your library' on the switch", async () => {
    renderDiscover();
    await openRun(1);
    const hide = await screen.findByRole("checkbox", { name: "Hide tracks already in your library" });
    expect(hide.closest("label")).toHaveAttribute(
      "title",
      "Tracks you've matched on the Clean page. Match more tracks there to hide more of what you already have.",
    );
  });

  it("says so when every track found is one the library has", async () => {
    install({
      getDiscoveryRunTracks: vi.fn(async (params: Record<string, unknown>) => ({
        value: { ...ALL_OWNED, run_id: Number(params.run_id), window: { ...ALL_OWNED.window } },
        refusal: null,
      })),
    });
    renderDiscover();
    await openRun(1);
    expect(
      await screen.findByText("Every track this search found is already in your library."),
    ).toBeInTheDocument();
  });

  it("sorts by what the engine sorts by", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(within(table("Tracks this search found")).getByRole("button", { name: "Released" }));
    await waitFor(() =>
      expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "release_date", dir: "asc" }),
      ),
    );
    // A column the engine cannot order by is not a button that pretends to.
    expect(within(table("Tracks this search found")).getByRole("button", { name: "Label" })).toBeDisabled();
  });

  it("shows the actions always, those that need rows disabled with their reason until rows are selected (DEC-209)", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(2), LOADED);
    const bar = actionsBar("Tracks this search found");
    const names = ["Add to wantlist", "Make a Beatport playlist…", "Open on Beatport"];
    expect(buttonsOf(bar)).toEqual(names);
    const button = (name: string) => within(bar).getByRole("button", { name });
    expect(button("Add to wantlist")).toBeDisabled();
    expect(button("Add to wantlist")).toHaveAttribute("title", "Select tracks in the table first.");
    expect(button("Open on Beatport")).toBeDisabled();
    expect(button("Make a Beatport playlist…")).toBeEnabled();
    expect(bar).toHaveTextContent(`${HIDDEN.total} tracks`);
    expect(bar).toHaveTextContent(`All ${HIDDEN.total} shown`);

    const [first, , third] = rowsOf("Tracks this search found");
    fireEvent.click(first!);
    expect(buttonsOf(bar)).toEqual(names);
    expect(button("Add to wantlist")).toBeEnabled();
    expect(button("Open on Beatport")).toBeEnabled();
    expect(bar).toHaveTextContent("1 selected");
    fireEvent.click(third!, { shiftKey: true });
    expect(bar).toHaveTextContent("3 tracks selected");
    expect(bar).toHaveTextContent("3 selected");
    fireEvent.click(first!, { ctrlKey: true });
    expect(bar).toHaveTextContent("2 tracks selected");
    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(button("Add to wantlist")).toBeDisabled();
    expect(bar).toHaveTextContent(`All ${HIDDEN.total} shown`);
  });

  it("sets the selected track from a result row, with Beatport's key as Camelot (DEC-157)", async () => {
    install({
      getDiscoveryRunTracks: vi.fn(async (params: Record<string, unknown>) => {
        const page = runPage(params);
        return value({
          ...page.value!,
          rows: page.value!.rows.map((row, at) => ({ ...row, key: at === 0 ? "Am" : null })),
        });
      }),
    });
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(1), LOADED);
    const [first, second] = rowsOf("Tracks this search found");
    expect(getSelectedTrack()).toBeNull();
    fireEvent.click(first!);
    expect(getSelectedTrack()).toEqual({
      id: `bp-${HIDDEN.rows[0]!.beatport_track_id}`,
      key: "8A",
      title: HIDDEN.rows[0]!.title,
    });
    fireEvent.click(second!);
    expect(getSelectedTrack()).toEqual({
      id: `bp-${HIDDEN.rows[1]!.beatport_track_id}`,
      key: null,
      title: HIDDEN.rows[1]!.title,
    });
    fireEvent.click(within(actionsBar("Tracks this search found")).getByRole("button", { name: "Clear" }));
    expect(getSelectedTrack()).toBeNull();
  });

  it("links the artist and label names to their pages, without selecting the row (FLW-16)", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    const row = rowsOf("Tracks this search found")[0]!;
    const artist = HIDDEN.rows[0]!.artists[0]!;
    const artistLink = within(row).getByRole("button", { name: artist });
    fireEvent.click(artistLink);
    expect(await screen.findByTestId("where")).toHaveTextContent(
      `/discover/artist/${encodeURIComponent(`name:${artist}`)}`,
    );
  });

  it("reaches the links by Tab inside the row, and a click on one selects nothing", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    const row = rowsOf("Tracks this search found")[0]!;
    const links = within(row).getAllByRole("button");
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).not.toHaveAttribute("tabindex", "-1");
    const label = within(row).getByRole("button", { name: HIDDEN.rows[0]!.label_name! });
    const bar = actionsBar("Tracks this search found");
    fireEvent.click(label);
    expect(bar).not.toHaveTextContent("selected");
    expect(await screen.findByTestId("where")).toHaveTextContent(
      `/discover/label/${encodeURIComponent(`bp:${HIDDEN.rows[0]!.label_id}`)}`,
    );
  });

  it("feeds the wheel from the row last clicked, not the last row selected", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(1), LOADED);
    const [first, second] = rowsOf("Tracks this search found");
    fireEvent.click(second!);
    fireEvent.click(first!, { ctrlKey: true });
    expect(getSelectedTrack()?.id).toBe(`bp-${HIDDEN.rows[0]!.beatport_track_id}`);
  });

  it("moves through the rows and selects them from the keyboard", async () => {
    const user = userEvent.setup();
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(2), LOADED);
    const bar = actionsBar("Tracks this search found");
    const grid = table("Tracks this search found");
    // Tab reaches the table, then the name links inside its rows, in order.
    await user.tab();
    while (document.activeElement !== grid && document.activeElement !== document.body) await user.tab();
    expect(grid).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(rowsOf("Tracks this search found")[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(rowsOf("Tracks this search found")[1]).toHaveAttribute("aria-selected", "true");
    expect(rowsOf("Tracks this search found")[0]).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(bar).toHaveTextContent("2 tracks selected");
    // Enter on the active row selects just it; Ctrl+Space takes it out and puts it back.
    await user.keyboard("{Enter}");
    expect(bar).toHaveTextContent("1 track selected");
    await user.keyboard("{Control>} {/Control}");
    expect(bar).not.toHaveTextContent("selected");
    await user.keyboard("{Control>} {/Control}");
    expect(bar).toHaveTextContent("1 track selected");
  });

  it("keeps Enter on a name link its own: it opens the page and selects nothing", async () => {
    const user = userEvent.setup();
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    const artist = HIDDEN.rows[0]!.artists[0]!;
    within(rowsOf("Tracks this search found")[0]!).getByRole("button", { name: artist }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("where")).toHaveTextContent("/discover/artist/");
  });

  it("remembers the hide switch and explains the library column on its header", async () => {
    localStorage.setItem(HIDE_OWNED_STORAGE_KEY, "0");
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    expect(screen.getByRole("checkbox", { name: "Hide tracks already in your library" })).not.toBeChecked();
    expect(bridge.getDiscoveryRunTracks!.mock.calls.at(-1)![0]).toMatchObject({ owned: "all" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide tracks already in your library" }));
    expect(localStorage.getItem(HIDE_OWNED_STORAGE_KEY)).toBe("1");
    const header = within(table("Tracks this search found")).getByRole("button", { name: "In your library" });
    expect(header).toHaveAttribute("title", IN_LIBRARY_EXPLAINER);
  });

  it("adds the selection to the wantlist from the search, and reads it again", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(1), LOADED);
    const [first, second] = rowsOf("Tracks this search found");
    fireEvent.click(first!);
    fireEvent.click(second!, { ctrlKey: true });
    const reads = bridge.getDiscoveryRunTracks!.mock.calls.length;
    fireEvent.click(within(actionsBar("Tracks this search found")).getByRole("button", { name: "Add to wantlist" }));
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
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this search found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open on Beatport" }));
    await waitFor(() => expect(bridge.openBeatportPage).toHaveBeenCalledWith(HIDDEN.rows[0]!.url));
  });

  it("says so when a page is not opened", async () => {
    install({ openBeatportPage: vi.fn(async () => false) });
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this search found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Open on Beatport" }));
    expect(await screen.findByText(/CuePoint opens only pages on beatport\.com/)).toBeInTheDocument();
  });

  it("does nothing on a double-click: a Beatport row has no file to play", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    const calls = Object.values(bridge).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    fireEvent.doubleClick(rowsOf("Tracks this search found")[0]!);
    await act(async () => {});
    const after = Object.values(bridge).reduce((sum, fn) => sum + fn.mock.calls.length, 0);
    expect(after).toBe(calls);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers the same actions on a right-click, selecting the row", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.contextMenu(rowsOf("Tracks this search found")[1]!);
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Add to wantlist",
      "Make a Beatport playlist…",
      "Open on Beatport",
    ]);
    expect(actionsBar("Tracks this search found")).toHaveTextContent("1 track selected");
  });

  it("makes a playlist of the whole table by the search, in its order, with the library's tracks left out", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a playlist on Beatport" });
    expect(within(dialog).getByLabelText("Playlist name")).toHaveValue(OPTIONS.defaults.playlist_name);
    expect(dialog).toHaveTextContent(`the ${HIDDEN.total} tracks this table shows`);
    fireEvent.change(within(dialog).getByLabelText("Playlist name"), {
      target: { value: "Friday finds" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
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
    expect(
      await screen.findByText("Making the playlist on Beatport… The status bar shows how far it has got."),
    ).toBeInTheDocument();
    const outcome = await screen.findByRole("status", { name: "Beatport playlist" });
    expect(outcome).toHaveTextContent(
      "Made “Friday finds” on Beatport with 2 tracks. 1 track already in your library was left out.",
    );
    fireEvent.click(within(outcome).getByRole("button", { name: "Open the playlist" }));
    await waitFor(() =>
      expect(bridge.openBeatportPage).toHaveBeenCalledWith(fixture.playlist_result.playlist_url),
    );
  });

  it("makes the playlist in the order the table is sorted by", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    const released = within(table("Tracks this search found")).getByRole("button", { name: "Released" });
    fireEvent.click(released);
    fireEvent.click(released);
    await waitFor(() =>
      expect(bridge.getDiscoveryRunTracks).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "release_date", dir: "desc" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    await waitFor(() =>
      expect(bridge.startBeatportPlaylistPush).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: 1, sort: "release_date", dir: "desc" }),
      ),
    );
  });

  it("makes a playlist of a selection by its ids, and keeps a refusal in the dialog", async () => {
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
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(rowsOf("Tracks this search found")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("the 1 selected track");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Include tracks already in your library" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "A Beatport playlist is already being made.",
    );
    expect(bridge.startBeatportPlaylistPush).toHaveBeenLastCalledWith({
      name: OPTIONS.defaults.playlist_name,
      include_owned: true,
      track_ids: [HIDDEN.rows[0]!.beatport_track_id],
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses a playlist name the engine would refuse", async () => {
    renderDiscover();
    await openRun(1);
    await waitFor(() => expect(rowsOf("Tracks this search found").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Playlist name");
    fireEvent.change(name, { target: { value: "   " } });
    expect(within(dialog).getByRole("button", { name: "Make playlist" })).toBeDisabled();
    fireEvent.change(name, { target: { value: "x".repeat(201) } });
    expect(within(dialog).getByText("A playlist name is at most 200 characters.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Make playlist" })).toBeDisabled();
  });

  it("deletes an ended search from its row after asking, and opens the next", async () => {
    renderDiscover();
    await openRun(1);
    const list = screen.getByRole("navigation", { name: "Past searches" });
    const row = within(list)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Finished"))!;
    fireEvent.click(within(row).getByRole("button", { name: "Delete this search…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this search?" });
    install({
      ...bridge,
      listDiscoveryRuns: vi.fn(async () =>
        value({ ...RUNS, runs: RUNS.runs.filter((run) => run.id !== 1), total: 1 }),
      ),
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete search" }));
    await waitFor(() => expect(bridge.deleteDiscoveryRun).toHaveBeenCalledWith({ run_id: 1 }));
    expect(await screen.findByText(/Deleted the search/)).toBeInTheDocument();
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
  });

  it("cannot delete a search while it is running, and says why", async () => {
    const running = { ...RUNS.runs[1]!, running: true, outcome: null };
    install({
      listDiscoveryRuns: vi.fn(async () => value({ ...RUNS, runs: [running], total: 1 })),
      getDiscoveryRun: vi.fn(async () => value({ run: running, artists: [], labels: [] })),
      getJob: vi.fn(async (id: string) => ({ id, state: "running" })),
    });
    renderDiscover();
    const button = await screen.findByRole("button", { name: "Delete this search…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "A running search cannot be deleted.");
  });

  it("explains a running search on the page, in the strip's own words (DSC-12)", async () => {
    const running = { ...RUNS.runs[1]!, running: true, outcome: null };
    install({
      listDiscoveryRuns: vi.fn(async () => value({ ...RUNS, runs: [running], total: 1 })),
      getDiscoveryRun: vi.fn(async () => value({ run: running, artists: [], labels: [] })),
    });
    renderDiscover();
    expect(await screen.findByText(/Running: 7 tracks from 3 charts/)).toBeInTheDocument();
    const note = screen.getByText(jobExplainer("discovery"), { exact: false });
    expect(note).toHaveTextContent("This can take a few minutes");
    expect(note).toHaveTextContent("the bar at the bottom shows how far it has got");
  });

  it("goes back to the list when a search is gone", async () => {
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

describe("New search", () => {
  beforeEach(() => {
    install({ listDiscoveryRuns: vi.fn(async () => asAnswer(fixture.runs_empty)) });
  });

  it("says what to do first", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    expect(
      within(panel).getByText("Pick artists, labels or charts, then press Start looking."),
    ).toBeInTheDocument();
  });

  it("explains charts, and folds the chart dates under More options (DSC-5)", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    expect(within(panel).getByText(/Genres for DJ charts \(0 chosen\)/)).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "On Beatport, artists publish charts — short lists of tracks they play. CuePoint reads the charts made by artists in your library, in the genres you tick.",
      ),
    ).toBeInTheDocument();
    const more = within(panel).getByText("More options").closest("details") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more).toContainElement(within(panel).getByLabelText("Charts from"));
    expect(more).toContainElement(within(panel).getByLabelText("Charts to"));
    // The default shown as words, so the dates need not be opened to be understood.
    expect(within(panel).getByText(/Charts from the last \d+ days\./)).toBeInTheDocument();
  });

  it("starts from the engine's defaults, and asks for what was chosen", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    expect(within(panel).getByLabelText("Releases from the last (days)")).toHaveValue(30);
    expect(within(panel).getByLabelText("Charts from")).toHaveValue(OPTIONS.defaults.charts_from);
    // No genre chosen: no chart dates to give.
    expect(within(panel).getByLabelText("Charts from")).toBeDisabled();
    expect(within(panel).getByText("Every artist in your library (3)")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.change(within(panel).getByLabelText("Releases from the last (days)"), {
      target: { value: "14" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
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
      await screen.findByText("The search found 7 tracks from 3 charts and 2 releases."),
    ).toBeInTheDocument();
  });

  it("opens Results on the new search when it starts (FLW-15)", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.queryByRole("region", { name: "New search" })).toBeNull();
  });

  it("picks artists from the Library's facet, with counts", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    const artists = within(panel).getByRole("group", { name: "Artists" });
    fireEvent.click(within(artists).getByRole("radio", { name: "Only the artists I choose" }));
    expect(within(panel).getByText("Choose at least one artist, or look for every one.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Start looking" })).toBeDisabled();

    fireEvent.click(within(artists).getByRole("button", { name: "Choose artists…" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose artists" });
    fireEvent.change(within(dialog).getByLabelText("Find artists"), { target: { value: "ki" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Kiko/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(within(artists).getByText("1 artist: Kiko")).toBeInTheDocument();

    const labels = within(panel).getByRole("group", { name: "Labels" });
    fireEvent.click(within(labels).getByRole("radio", { name: "No labels" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    await waitFor(() =>
      expect(bridge.startDiscoveryRun).toHaveBeenCalledWith(
        expect.objectContaining({ artists: ["Kiko"], labels: [] }),
      ),
    );
  });

  it("keeps the form when the tab is left and come back to", async () => {
    renderDiscover();
    const panel = await openNewSearch();
    fireEvent.click(within(panel).getByRole("checkbox", { name: "House" }));
    fireEvent.click(screen.getByRole("tab", { name: "Wantlist" }));
    const again = await openNewSearch();
    expect(within(again).getByRole("checkbox", { name: "House" })).toBeChecked();
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
    const panel = await openNewSearch();
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "The chart window ends before it starts",
    );
  });

  it("opens the search a start began once the engine has made it", async () => {
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
    const panel = await openNewSearch();
    listed = { ...listed, runs: [running], total: 1 };
    fireEvent.click(within(panel).getByRole("button", { name: "Start looking" }));
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
      `${WANTED.entries} wanted tracks, ${WANTED.bought} bought, ${WANTED.owned} in your library`,
    );
  });

  it("shows every wanted track by default, marking the ones now in your library (FLW-15)", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    expect(screen.getByLabelText("In your library")).toHaveValue("all");
    expect(screen.getByLabelText("In your library")).toHaveAttribute("title", IN_LIBRARY_EXPLAINER);
    expect(bridge.getWantlist).toHaveBeenCalledWith(expect.objectContaining({ owned: "all" }));
    expect(screen.queryByRole("checkbox", { name: "Hide tracks already in your library" })).toBeNull();
    const marked = rowsOf("Wantlist").filter((row) => within(row).queryByText("In your library"));
    expect(marked).toHaveLength(WANTED.rows.filter((row) => row.owned).length);
    expect(marked.length).toBeGreaterThan(0);
  });

  it("words the filters as In your library and Marked bought, each Any, No or Yes", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    for (const label of ["In your library", "Marked bought"]) {
      const select = screen.getByLabelText(label);
      expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Any",
        "No",
        "Yes",
      ]);
    }
  });

  it("links the artist and label names to their pages here too (FLW-16)", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    const row = rowsOf("Wantlist")[0]!;
    fireEvent.click(within(row).getByRole("button", { name: WANTED.rows[0]!.artists[0]! }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/discover/artist/");
  });

  it("filters by bought and by owned, independently", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(WANTED.total), LOADED);
    fireEvent.change(screen.getByLabelText("Marked bought"), { target: { value: "only" } });
    const bought = fixture.wantlist_bought_only.value as unknown as WantlistPage;
    await waitFor(() => expect(rowsOf("Wantlist")).toHaveLength(bought.total), LOADED);
    expect(bridge.getWantlist).toHaveBeenLastCalledWith(
      expect.objectContaining({ owned: "all", bought: "only" }),
    );
    fireEvent.change(screen.getByLabelText("Marked bought"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("In your library"), { target: { value: "hide" } });
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
    expect(screen.getByText("Add tracks from Results or an artist page.")).toBeInTheDocument();
    expect(screen.queryByText(/Select tracks in a run/)).toBeNull();
  });

  it("always shows a wanted track's actions, enabling each as the selection allows", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(1), LOADED);
    const bar = actionsBar("Wantlist");
    const all = [
      "Make a Beatport playlist…",
      "Open on Beatport",
      "Edit note…",
      "Mark bought",
      "Remove from wantlist",
    ];
    const enabled = () =>
      within(bar)
        .getAllByRole("button")
        .filter((button) => all.includes(button.textContent ?? "") && !(button as HTMLButtonElement).disabled)
        .map((button) => button.textContent);
    expect(buttonsOf(bar)).toEqual(all);
    expect(enabled()).toEqual(["Make a Beatport playlist…"]);
    expect(within(bar).getByRole("button", { name: "Edit note…" })).toHaveAttribute(
      "title",
      "Select one track to edit its note.",
    );
    expect(bar).toHaveTextContent(`All ${WANTED.total} shown`);
    const notBought = WANTED.rows.findIndex((row) => row.bought_at === null);
    fireEvent.click(rowsOf("Wantlist")[notBought]!);
    expect(buttonsOf(bar)).toEqual(all);
    expect(enabled()).toEqual(all);
    const other = WANTED.rows.findIndex((row, index) => index !== notBought && row.bought_at === null);
    fireEvent.click(rowsOf("Wantlist")[other]!, { ctrlKey: true });
    expect(buttonsOf(bar)).toEqual(all);
    expect(enabled()).toEqual(all.filter((name) => name !== "Edit note…"));
    expect(bar).toHaveTextContent("2 selected");
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

  it("makes a playlist of every track the list shows, read from the engine, in its order", async () => {
    renderDiscover();
    await waitFor(() => expect(rowsOf("Wantlist").length).toBeGreaterThan(0), LOADED);
    fireEvent.click(screen.getByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    await waitFor(() =>
      expect(bridge.startBeatportPlaylistPush).toHaveBeenCalledWith({
        name: OPTIONS.defaults.playlist_name,
        include_owned: false,
        track_ids: WANTED.rows.map((row) => row.beatport_track_id),
      }),
    );
  });
});
