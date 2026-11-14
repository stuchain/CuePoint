/**
 * The Following tab: first-use suggestions, the feed and its list, the check, and the one mark
 * when the tab is left. Over a faked bridge; the engine's shapes are `cuepointBridge.types.ts`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type {
  DiscoverAnswer,
  DiscoverOptions,
  FollowFeed,
  FollowFeedRow,
  FollowRow,
  FollowSuggestion,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { ScaleProvider } from "../../tokens/ScaleContext";
import fixture from "./discoverPage.fixture.json";
import { FollowingView } from "./FollowingView";
import { RETRY } from "../../format/words";
import { followStatusLine, checkedAgo, oldestSeenThrough } from "./followFormat";
import type { DiscoverTools } from "./discoverTools";

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const LOADED = { timeout: 3000 };

function value<T>(of: T): DiscoverAnswer<T> {
  return { value: of, refusal: null };
}

function follow(over: Partial<FollowRow>): FollowRow {
  return {
    kind: "artist",
    beatport_id: 1,
    name: "Amsel",
    followed_at: "2026-11-01T00:00:00Z",
    seen_through: "2026-11-06",
    seen_at: null,
    new_count: 0,
    checked_at: null,
    state: null,
    ...over,
  };
}

const AMSEL = follow({ beatport_id: 1, name: "Amsel", new_count: 2 });
const DREYER = follow({ beatport_id: 2, name: "Anouk Dreyer", new_count: 1 });
const MONO = follow({ kind: "label", beatport_id: 10, name: "Monochrome Hours", new_count: 0 });
const FOLLOWS = [AMSEL, DREYER, MONO];

function trackRow(id: number, title: string, artist: string, source: FollowRow): FollowFeedRow {
  return {
    artists: [artist],
    beatport_track_id: id,
    bpm: 128,
    fetched_at: "2026-11-12T12:00:00+00:00",
    genre_id: 5,
    genre_name: "House",
    key: null,
    label_id: 1,
    label_key: "monochrome",
    label_name: "Monochrome Hours",
    mix_name: "Original Mix",
    on_wantlist: false,
    owned: false,
    release_date: "2026-11-12",
    release_id: 601,
    release_name: "R",
    remixers: [],
    title,
    url: `https://www.beatport.com/track/x/${id}`,
    follows: [{ kind: source.kind, beatport_id: source.beatport_id, name: source.name }],
  } as unknown as FollowFeedRow;
}

const ROWS = [
  trackRow(101, "Glass Meridian", "Amsel", AMSEL),
  trackRow(102, "Amber Season", "Amsel", AMSEL),
  trackRow(201, "Quiet Engine", "Anouk Dreyer", DREYER),
];

function feedPage(params: Record<string, unknown> = {}): DiscoverAnswer<FollowFeed> {
  const id = params.beatport_id as number | undefined;
  const rows = id === undefined ? ROWS : ROWS.filter((row) => row.follows[0]!.beatport_id === id);
  return value({
    rows,
    total: rows.length,
    hidden_owned: 3,
    checked_at: new Date().toISOString(),
    unchecked: 0,
    states: [],
    follow_count: FOLLOWS.length,
    window: {
      kind: (params.kind as "artist" | undefined) ?? null,
      beatport_id: id ?? null,
      owned: (params.owned as "hide") ?? "hide",
      offset: Number(params.offset ?? 0),
      limit: Number(params.limit ?? 100),
    },
  });
}

const SUGGESTIONS: FollowSuggestion[] = [
  { kind: "artist", beatport_id: 1, name: "Amsel", track_count: 42, followed: false },
  { kind: "label", beatport_id: 10, name: "Monochrome Hours", track_count: 28, followed: false },
];

function install(overrides: Record<string, Fn> = {}) {
  bridge = {
    getFollows: vi.fn(async () =>
      value({ follows: FOLLOWS, new_count: FOLLOWS.reduce((sum, row) => sum + row.new_count, 0) }),
    ),
    getFollowSuggestions: vi.fn(async () => value({ suggestions: SUGGESTIONS })),
    getFollowFeed: vi.fn(async (params: Record<string, unknown>) => feedPage(params ?? {})),
    addFollow: vi.fn(async () => value({ changed: true, followed: true })),
    removeFollow: vi.fn(async () => value({ changed: true, followed: false })),
    markFollowsSeen: vi.fn(async () => value({ changed: 3, seen_through: "2026-11-13" })),
    startFollowsCheck: vi.fn(async () => value({ id: "job-follows", type: "follows_check", state: "queued" })),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({
      id,
      state: "succeeded",
      result: { outcome: "ok", state: "ok", checked: 3, from_cache: 0, failed: [], total: 3 },
    })),
    addToWantlist: vi.fn(async () => value({ changed: [101], message: "Added 1 track to your wantlist." })),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function emptyFollows() {
  return { getFollows: vi.fn(async () => value({ follows: [], new_count: 0 })) };
}

function tools(over: Partial<DiscoverTools> = {}): DiscoverTools {
  return {
    options: OPTIONS,
    beatportState: "ok",
    pushing: false,
    push: vi.fn(async () => null),
    notify: vi.fn(),
    ...over,
  };
}

function renderView(
  props: { active?: boolean; tools?: DiscoverTools; onNewCount?: (n: number) => void; onLeft?: () => void } = {},
) {
  const onNewCount = props.onNewCount ?? vi.fn();
  const onLeft = props.onLeft ?? vi.fn();
  let current = props.tools ?? tools();
  let shown = props.active ?? true;
  const ui = () => (
    <ScaleProvider>
      <ToastProvider>
        <MemoryRouter>
          <FollowingView tools={current} onNewCount={onNewCount} onLeft={onLeft} active={shown} />
        </MemoryRouter>
      </ToastProvider>
    </ScaleProvider>
  );
  const view = render(ui());
  return {
    ...view,
    setActive: (active: boolean) => {
      shown = active;
      view.rerender(ui());
    },
    setTools: (next: DiscoverTools) => {
      current = next;
      view.rerender(ui());
    },
  };
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

function rowsOf(name: string) {
  return within(screen.getByRole("grid", { name }))
    .getAllByRole("row")
    .filter((row) => row.getAttribute("aria-rowindex") !== "1");
}

const FEED = "New tracks from who you follow";
const statusLine = () => document.querySelector<HTMLElement>(".discover-following__status");

describe("with nobody followed", () => {
  beforeEach(() => install(emptyFollows()));

  it("offers the names you own the most tracks by, with a button each", async () => {
    renderView();
    expect(await screen.findByRole("heading", { name: "Follow artists and labels" })).toBeInTheDocument();
    expect(
      screen.getByText(/See their new Beatport releases here each time you open this tab/),
    ).toBeInTheDocument();
    expect(await screen.findByText("42 of your tracks")).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow Amsel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow Monochrome Hours" })).toBeInTheDocument();
    expect(bridge.startFollowsCheck).not.toHaveBeenCalled();
  });

  it("follows and unfollows from the list, and counts who is followed in the main button", async () => {
    renderView();
    const main = await screen.findByRole("button", { name: "Show what's new (0 followed)" });
    expect(main).toBeDisabled();

    fireEvent.click(await screen.findByRole("button", { name: "Follow Amsel" }));
    expect(bridge.addFollow).toHaveBeenCalledWith({ kind: "artist", beatport_id: 1, name: "Amsel" });
    const following = await screen.findByRole("button", { name: "Following Amsel" });
    expect(following).toHaveTextContent("Following");
    expect(screen.getByRole("button", { name: "Show what's new (1 followed)" })).toBeEnabled();

    fireEvent.click(following);
    expect(bridge.removeFollow).toHaveBeenCalledWith({ kind: "artist", beatport_id: 1 });
    expect(await screen.findByRole("button", { name: "Follow Amsel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show what's new (0 followed)" })).toBeDisabled();
  });

  it("asks for ten more when the list may hold more", async () => {
    const full = Array.from({ length: 10 }, (_, at) => ({ ...SUGGESTIONS[0]!, beatport_id: 100 + at, name: `Name ${at}` }));
    install({
      ...emptyFollows(),
      getFollowSuggestions: vi.fn(async () => value({ suggestions: full })),
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Show 10 more" }));
    await waitFor(() => expect(bridge.getFollowSuggestions).toHaveBeenLastCalledWith({ limit: 20 }));
  });

  it("shows what is new once someone is followed, and starts a check from the cache", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Follow Amsel" }));
    await screen.findByRole("button", { name: "Following Amsel" });
    bridge.getFollows!.mockResolvedValue(
      value({ follows: [AMSEL], new_count: 2 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show what's new (1 followed)" }));
    expect(await screen.findByRole("navigation", { name: "Followed artists and labels" })).toBeInTheDocument();
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledWith({ refresh: false }));
  });
});

describe("with follows", () => {
  it("reads the cache and checks Beatport, then reads again when the check ends", async () => {
    let ended = false;
    install({ getJob: vi.fn(async (id: string) => ({ id, state: ended ? "succeeded" : "running" })) });
    renderView();
    // From the cache at once, with the check still running.
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    expect(bridge.startFollowsCheck).toHaveBeenCalledWith({ refresh: false });
    const follows = bridge.getFollows!.mock.calls.length;
    const feeds = bridge.getFollowFeed!.mock.calls.length;
    expect(bridge.getJobResults).not.toHaveBeenCalled();

    ended = true;
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledWith("job-follows"), LOADED);
    await waitFor(() => expect(bridge.getFollows!.mock.calls.length).toBeGreaterThan(follows), LOADED);
    await waitFor(() => expect(bridge.getFollowFeed!.mock.calls.length).toBeGreaterThan(feeds), LOADED);
  });

  it("lists the follows by kind with their new counts", async () => {
    renderView();
    const list = await screen.findByRole("navigation", { name: "Followed artists and labels" });
    expect(within(list).getByRole("heading", { name: /Artists/ })).toBeInTheDocument();
    expect(within(list).getByRole("heading", { name: /Labels/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^All 3 new$/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^Amsel 2 new$/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^Monochrome Hours nothing new$/ })).toBeInTheDocument();
  });

  it("says what is new, when it was checked and what is hidden", async () => {
    renderView();
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    await waitFor(() => expect(statusLine()?.textContent).toMatch(/^3 new tracks since Nov 7 · checked just now · 3 you own hidden$/), LOADED);
    // The count is the bold part.
    expect(within(statusLine()!).getByText("3 new tracks").tagName).toBe("STRONG");
  });

  it("filters the feed to one follow, and back to all", async () => {
    renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    fireEvent.click(screen.getByRole("button", { name: /^Anouk Dreyer/ }));
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(1), LOADED);
    expect(bridge.getFollowFeed).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "artist", beatport_id: 2 }),
    );
    expect(screen.getByRole("button", { name: /^Anouk Dreyer/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
  });

  it("has an Unfollow button for the follow picked, in view", async () => {
    renderView();
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    expect(screen.queryByRole("button", { name: /^Unfollow/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Amsel/ }));
    bridge.getFollows!.mockResolvedValue(value({ follows: [DREYER, MONO], new_count: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: "Unfollow Amsel" }));
    expect(bridge.removeFollow).toHaveBeenCalledWith({ kind: "artist", beatport_id: 1 });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Amsel/ })).toBeNull(), LOADED);
    expect(screen.queryByRole("button", { name: /^Unfollow/ })).toBeNull();
  });

  it("starts a refreshing check with Check again", async () => {
    renderView();
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledTimes(1), LOADED);
    bridge.startFollowsCheck!.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledWith({ refresh: true }), LOADED);
  });

  it("does not check without a Beatport sign-in, and says why on the button", async () => {
    renderView({ tools: tools({ beatportState: "no_token" }) });
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
    expect(bridge.startFollowsCheck).not.toHaveBeenCalled();
  });

  it("says in the list which follow Beatport refused", async () => {
    const refused = follow({
      beatport_id: 3,
      name: "Petra Solano",
      state: { state: "unavailable", message: "Beatport could not be reached." },
    });
    install({ getFollows: vi.fn(async () => value({ follows: [AMSEL, refused], new_count: 2 })) });
    renderView();
    expect(await screen.findByText("Beatport could not be reached.")).toBeInTheDocument();
  });

  it("adds the selected rows to the wantlist", async () => {
    renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    fireEvent.click(rowsOf(FEED)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Add to wantlist" }));
    await waitFor(() => expect(bridge.addToWantlist).toHaveBeenCalledWith({ track_ids: [101] }));
  });
});

describe("leaving the tab", () => {
  it("marks what was shown as seen, once", async () => {
    const onNewCount = vi.fn();
    const onLeft = vi.fn();
    const view = renderView({ onNewCount, onLeft });
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();

    view.setActive(false);
    await waitFor(() => expect(bridge.markFollowsSeen).toHaveBeenCalledTimes(1));
    expect(bridge.markFollowsSeen).toHaveBeenCalledWith({});
    // The count is read again by the page once the mark is answered, never set to 0 here.
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
    expect(onNewCount).not.toHaveBeenCalledWith(0);

    // Shown again and left again with nothing new: no second mark.
    bridge.getFollows!.mockResolvedValue(value({ follows: FOLLOWS.map((row) => ({ ...row, new_count: 0 })), new_count: 0 }));
    await act(async () => view.setActive(true));
    await waitFor(() => expect(bridge.getFollows!.mock.calls.length).toBeGreaterThan(2), LOADED);
    view.setActive(false);
    view.unmount();
    expect(bridge.markFollowsSeen).toHaveBeenCalledTimes(1);
  });

  it("marks nothing when nothing was new", async () => {
    install({ getFollows: vi.fn(async () => value({ follows: [{ ...AMSEL, new_count: 0 }], new_count: 0 })) });
    const view = renderView();
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    view.setActive(false);
    view.unmount();
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();
  });

  it("does not read anything while the tab is not on screen", async () => {
    renderView({ active: false });
    await act(async () => {});
    expect(bridge.getFollows).not.toHaveBeenCalled();
  });
});

describe("review fixes", () => {
  const busy = {
    value: null,
    refusal: { code: "DISCOVER_BUSY", message: "busy", job_type: "follows_check", job_id: "job-m" },
  };

  it("does not mark seen when the tab is left while a check is still running", async () => {
    install({ getJob: vi.fn(async (id: string) => ({ id, state: "running" })) });
    const view = renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalled());
    view.setActive(false);
    view.unmount();
    await act(async () => {});
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();
  });

  it("moves out of loading when Retry follows a failed first read", async () => {
    const getFollows = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(value({ follows: FOLLOWS, new_count: 3 }));
    install({ getFollows });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: RETRY }));
    expect(await screen.findByRole("navigation", { name: "Followed artists and labels" }, LOADED)).toBeInTheDocument();
  });

  it("moves to the suggestions when Retry finds nobody followed", async () => {
    const getFollows = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(value({ follows: [], new_count: 0 }));
    install({ getFollows });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: RETRY }));
    expect(await screen.findByRole("heading", { name: "Follow artists and labels" }, LOADED)).toBeInTheDocument();
  });

  it("shows an error with Retry when the suggestions cannot be read", async () => {
    const getFollowSuggestions = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(value({ suggestions: SUGGESTIONS }));
    install({ ...emptyFollows(), getFollowSuggestions });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: RETRY }));
    expect(await screen.findByRole("button", { name: "Follow Amsel" }, LOADED)).toBeInTheDocument();
  });

  it("says one follow's own count and date when it is picked", async () => {
    renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    fireEvent.click(screen.getByRole("button", { name: /^Anouk Dreyer/ }));
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(1), LOADED);
    await waitFor(() => expect(statusLine()?.textContent).toMatch(/^1 new track since Nov 7 /), LOADED);
  });

  it("does not say a cancelled check was done", async () => {
    install({
      getJobResults: vi.fn(async (id: string) => ({
        id,
        state: "succeeded",
        result: { outcome: "cancelled", state: "cancelled", checked: 1, from_cache: 0, failed: [], total: 3 },
      })),
    });
    const t = tools();
    renderView({ tools: t });
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledTimes(1), LOADED);
    bridge.startFollowsCheck!.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledTimes(2), LOADED);
    await act(async () => {});
    expect(t.notify).not.toHaveBeenCalledWith("Checked for new releases.", "success");
  });

  it("keeps the toast of Check again when an automatic check follows the same job", async () => {
    let manualStart: ((answer: unknown) => void) | null = null;
    let first = true;
    install({
      startFollowsCheck: vi.fn((params: { refresh: boolean }) => {
        if (params.refresh) return new Promise((resolve) => (manualStart = resolve));
        if (first) {
          first = false;
          return Promise.resolve(value({ id: "job-follows", type: "follows_check", state: "queued" }));
        }
        return Promise.resolve(busy);
      }),
    });
    const t = tools();
    const view = renderView({ tools: t });
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledTimes(1), LOADED);
    fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
    await waitFor(() => expect(manualStart).not.toBeNull());
    // Leave and come back while the manual start is out: the automatic check is refused as busy.
    view.setActive(false);
    view.setActive(true);
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledTimes(3), LOADED);
    await act(async () => {});
    manualStart!(busy);
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalledWith("job-m"), LOADED);
    await waitFor(() => expect(t.notify).toHaveBeenCalledWith("Checked for new releases.", "success"), LOADED);
  });

  it("starts the check once when Beatport becomes usable while the tab is active", async () => {
    const view = renderView({ tools: tools({ beatportState: "no_token" }) });
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    expect(bridge.startFollowsCheck).not.toHaveBeenCalled();
    view.setTools(tools({ beatportState: "ok" }));
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledTimes(1), LOADED);
    view.setTools(tools({ beatportState: "ok" }));
    await act(async () => {});
    expect(bridge.startFollowsCheck).toHaveBeenCalledTimes(1);
  });

  it("moves focus to All after Unfollow", async () => {
    renderView();
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    fireEvent.click(screen.getByRole("button", { name: /^Amsel/ }));
    bridge.getFollows!.mockResolvedValue(value({ follows: [DREYER, MONO], new_count: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: "Unfollow Amsel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Amsel/ })).toBeNull(), LOADED);
    await waitFor(() => expect(screen.getByRole("button", { name: /^All/ })).toHaveFocus(), LOADED);
  });

  it("shows just the number on a follow's chip, with the words for a screen reader", async () => {
    renderView();
    const button = await screen.findByRole("button", { name: /^Amsel 2 new$/ });
    expect(within(button).getByText("2")).toBeInTheDocument();
    expect(button.querySelector(".cp-visually-hidden")?.textContent).toBe(" new");
  });

  it("shows eight names in a group and a + N more button for the rest", async () => {
    const many = Array.from({ length: 11 }, (_, at) =>
      follow({ beatport_id: 100 + at, name: `Name ${String(at).padStart(2, "0")}`, new_count: 0 }),
    );
    install({ getFollows: vi.fn(async () => value({ follows: many, new_count: 0 })) });
    renderView();
    const list = await screen.findByRole("navigation", { name: "Followed artists and labels" });
    expect(within(list).getAllByRole("button", { name: /^Name / })).toHaveLength(8);
    fireEvent.click(within(list).getByRole("button", { name: "+ 3 more" }));
    expect(within(list).getAllByRole("button", { name: /^Name / })).toHaveLength(11);
    expect(within(list).queryByRole("button", { name: /more$/ })).toBeNull();
  });

  it("does not read the follows when a check ends while the tab is hidden, and reads when shown", async () => {
    let ended = false;
    install({ getJob: vi.fn(async (id: string) => ({ id, state: ended ? "succeeded" : "running" })) });
    const view = renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalled());
    view.setActive(false);
    await act(async () => {});
    const reads = bridge.getFollows!.mock.calls.length;
    const feeds = bridge.getFollowFeed!.mock.calls.length;
    ended = true;
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalled(), LOADED);
    await act(async () => {});
    expect(bridge.getFollows!.mock.calls.length).toBe(reads);
    expect(bridge.getFollowFeed!.mock.calls.length).toBe(feeds);
    view.setActive(true);
    await waitFor(() => expect(bridge.getFollows!.mock.calls.length).toBeGreaterThan(reads), LOADED);
  });
});

describe("suggestions keep who was followed", () => {
  beforeEach(() => install(emptyFollows()));

  it("keeps a followed name, and the count, when Show 10 more answers", async () => {
    const first = Array.from({ length: 10 }, (_, at) => ({
      ...SUGGESTIONS[0]!,
      beatport_id: 100 + at,
      name: `Name ${at}`,
    }));
    // The engine keeps a followed name in its place, marked followed.
    const getFollowSuggestions = vi.fn(async (params?: { limit?: number }) => {
      const followed = bridge.addFollow!.mock.calls.length > 0;
      const rows = first.map((row, at) => ({ ...row, followed: followed && at === 0 }));
      return value({ suggestions: (params?.limit ?? 10) > 10 ? [...rows, ...rows.slice(0, 0)] : rows });
    });
    install({ ...emptyFollows(), getFollowSuggestions });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Follow Name 0" }));
    await screen.findByRole("button", { name: "Following Name 0" });
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more" }));
    await waitFor(() => expect(getFollowSuggestions).toHaveBeenLastCalledWith({ limit: 20 }));
    expect(await screen.findByRole("button", { name: "Following Name 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show what's new (1 followed)" })).toBeEnabled();
  });

  it("keeps a followed name through Retry", async () => {
    const names = Array.from({ length: 10 }, (_, at) => ({
      ...SUGGESTIONS[0]!,
      beatport_id: 100 + at,
      name: `Name ${at}`,
    }));
    let fail = false;
    const getFollowSuggestions = vi.fn(async () => {
      if (fail) {
        fail = false;
        throw new Error("offline");
      }
      const followed = bridge.addFollow!.mock.calls.length > 0;
      return value({ suggestions: names.map((row, at) => ({ ...row, followed: followed && at === 0 })) });
    });
    install({ ...emptyFollows(), getFollowSuggestions });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Follow Name 0" }));
    await screen.findByRole("button", { name: "Following Name 0" });
    fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Show 10 more" }));
    fireEvent.click(await screen.findByRole("button", { name: RETRY }, LOADED));
    expect(await screen.findByRole("button", { name: "Following Name 0" }, LOADED)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show what's new (1 followed)" })).toBeEnabled();
  });

  it("stops asking for more at the engine's cap of 100", async () => {
    const getFollowSuggestions = vi.fn(async (params?: { limit?: number }) =>
      value({
        suggestions: Array.from({ length: params?.limit ?? 10 }, (_, at) => ({
          ...SUGGESTIONS[0]!,
          beatport_id: 100 + at,
          name: `Name ${at}`,
        })),
      }),
    );
    install({ ...emptyFollows(), getFollowSuggestions });
    renderView();
    for (let limit = 20; limit <= 100; limit += 10) {
      fireEvent.click(await screen.findByRole("button", { name: "Show 10 more" }));
      await waitFor(() => expect(getFollowSuggestions).toHaveBeenLastCalledWith({ limit }));
      await screen.findByRole("button", { name: `Follow Name ${limit - 1}` });
    }
    expect(screen.queryByRole("button", { name: "Show 10 more" })).toBeNull();
    expect(getFollowSuggestions).not.toHaveBeenCalledWith({ limit: 110 });
  });

  it("hides Show 10 more when fewer names came back than were asked for", async () => {
    renderView();
    await screen.findByRole("button", { name: "Follow Amsel" });
    expect(screen.queryByRole("button", { name: "Show 10 more" })).toBeNull();
  });

  it("draws a neutral picture beside each name: round for an artist, square for a label", async () => {
    renderView();
    const amsel = (await screen.findByRole("button", { name: "Follow Amsel" })).closest("li")!;
    expect(amsel.querySelector(".discover-following__avatar--artist")).not.toBeNull();
    const label = screen.getByRole("button", { name: "Follow Monochrome Hours" }).closest("li")!;
    expect(label.querySelector(".discover-following__avatar--label")).not.toBeNull();
  });
});

describe("leaving marks only what was shown", () => {
  it("marks only the follow that was picked", async () => {
    const view = renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    fireEvent.click(screen.getByRole("button", { name: /^Anouk Dreyer/ }));
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(1), LOADED);
    view.setActive(false);
    await waitFor(() => expect(bridge.markFollowsSeen).toHaveBeenCalledTimes(1));
    expect(bridge.markFollowsSeen).toHaveBeenCalledWith({ kind: "artist", beatport_id: 2 });
  });

  it("marks nothing when the feed shows an error", async () => {
    install({ getFollowFeed: vi.fn(async () => { throw new Error("offline"); }) });
    const onLeft = vi.fn();
    const view = renderView({ onLeft });
    await screen.findByText("What is new could not be read", {}, LOADED);
    view.setActive(false);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();
  });

  it("marks nothing when the feed never loaded", async () => {
    install({ getFollowFeed: vi.fn(() => new Promise(() => {})) });
    const onLeft = vi.fn();
    const view = renderView({ onLeft });
    await screen.findByRole("navigation", { name: "Followed artists and labels" });
    view.setActive(false);
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();
  });

  it("asks the page to read the count only after the mark has been answered", async () => {
    let answer: (value: unknown) => void = () => {};
    install({ markFollowsSeen: vi.fn(() => new Promise((resolve) => (answer = resolve))) });
    const onLeft = vi.fn();
    const view = renderView({ onLeft });
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    view.setActive(false);
    await waitFor(() => expect(bridge.markFollowsSeen).toHaveBeenCalled());
    await act(async () => {});
    expect(onLeft).not.toHaveBeenCalled();
    answer(value({ changed: 3, seen_through: "2026-11-13" }));
    await waitFor(() => expect(onLeft).toHaveBeenCalledTimes(1));
  });

  it("marks nothing in the gap between starting a check and its job arriving", async () => {
    let started: (value: unknown) => void = () => {};
    install({ startFollowsCheck: vi.fn(() => new Promise((resolve) => (started = resolve))) });
    const view = renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalled());
    view.setActive(false);
    await act(async () => {});
    expect(bridge.markFollowsSeen).not.toHaveBeenCalled();
    started(value({ id: "job-follows", type: "follows_check", state: "queued" }));
  });
});

describe("a failed check and a failed read", () => {
  it("lets the automatic check run again when the one that ended failed", async () => {
    install({
      getJob: vi.fn(async (id: string) => ({ id, state: "failed", error: { message: "engine restarted" } })),
      getJobResults: vi.fn(async (id: string) => ({ id, state: "failed", result: null })),
    });
    const view = renderView({ tools: tools({ beatportState: "ok" }) });
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledTimes(1), LOADED);
    await waitFor(() => expect(bridge.getJobResults).toHaveBeenCalled(), LOADED);
    // Beatport usable again after the restart: the next ready starts the check once more.
    view.setTools(tools({ beatportState: "no_token" }));
    await act(async () => {});
    view.setTools(tools({ beatportState: "ok" }));
    await waitFor(() => expect(bridge.startFollowsCheck).toHaveBeenCalledTimes(2), LOADED);
  });

  it("says so when the list cannot be read again while follows are showing", async () => {
    let ended = false;
    install({ getJob: vi.fn(async (id: string) => ({ id, state: ended ? "succeeded" : "running" })) });
    renderView();
    await waitFor(() => expect(rowsOf(FEED)).toHaveLength(3), LOADED);
    bridge.getFollows!.mockRejectedValue(new Error("engine is gone"));
    ended = true;
    expect(await screen.findByRole("alert", {}, LOADED)).toHaveTextContent(/could not be read/);
    // The follows already read stay on screen.
    expect(screen.getByRole("button", { name: /^Amsel/ })).toBeInTheDocument();
  });
});

describe("the sentences", () => {
  const now = new Date(2026, 10, 13, 12, 0, 0);
  it("says how long ago it checked", () => {
    expect(checkedAgo(null, now)).toBe("not checked yet");
    expect(checkedAgo(new Date(now.getTime() - 20_000).toISOString(), now)).toBe("just now");
    expect(checkedAgo(new Date(now.getTime() - 2 * 60_000).toISOString(), now)).toBe("2 min ago");
    expect(checkedAgo(new Date(now.getTime() - 3 * 3_600_000).toISOString(), now)).toBe("3 hours ago");
  });

  it("leaves the hidden part out when nothing is hidden", () => {
    const line = followStatusLine(
      { total: 1, hidden_owned: 0, checked_at: new Date(now.getTime() - 120_000).toISOString() },
      { newCount: 1, seenThrough: "2026-11-06", hiding: true },
      now,
    );
    expect(line).toBe("1 new track since Nov 7 · checked 2 min ago");
  });

  it("never reads 'checked not checked yet'", () => {
    const line = followStatusLine(
      { total: 1, hidden_owned: 0, checked_at: null },
      { newCount: 1, seenThrough: "2026-11-06", hiding: true },
      now,
    );
    expect(line).toBe("1 new track since Nov 7 · not checked yet");
    expect(line).not.toMatch(/checked not/);
  });

  it("keeps the new count and appends the owned tracks shown when Hide owned is off", () => {
    const line = followStatusLine(
      { total: 5, hidden_owned: 0, checked_at: null },
      { newCount: 3, seenThrough: "2026-11-11", hiding: false },
      now,
    );
    expect(line).toBe("3 new tracks since yesterday · not checked yet · 2 you own shown");
  });

  it("says since the day after the one seen through, in words near today", () => {
    const line = followStatusLine(
      { total: 1, hidden_owned: 0, checked_at: null },
      { newCount: 1, seenThrough: "2026-11-12", hiding: true },
      now,
    );
    expect(line).toMatch(/^1 new track since today/);
  });

  it("says since you last looked for a follow that was marked seen", () => {
    const line = followStatusLine(
      { total: 1, hidden_owned: 0, checked_at: null },
      { newCount: 1, seenThrough: "2026-11-13", seenAt: "2026-11-13T09:00:00+00:00", hiding: true },
      now,
    );
    expect(line).toBe("1 new track since you last looked · not checked yet");
  });

  it("takes the oldest day any follow was seen through", () => {
    expect(oldestSeenThrough([AMSEL, follow({ seen_through: "2026-11-01" })])).toBe("2026-11-01");
    expect(oldestSeenThrough([])).toBeNull();
  });
});
