/**
 * The first-steps checklist on the empty Library (RUN-3, LIB-2).
 *
 * Four things get a new user from nothing to a library that works: import it,
 * match the tracks, play one, add a Beatport token. Each ticks from what the
 * app knows, not from the user's say-so, and the list goes away once all four
 * are true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { LibraryHealth, PlayerSnapshot } from "../../api/cuepointBridge.types";
import { resetPlayerStore } from "../../components/player/playerStore";
import { announceLibraryChange } from "../../api/libraryChanges";
import { FirstSteps, FirstStepsNote } from "./FirstSteps";

function health(trackCount: number, notMatched: number): LibraryHealth {
  return {
    track_count: trackCount,
    counts: [
      { id: "not_matched", label: "Not matched", count: notMatched, rules: { match: "all", rules: [] } },
    ],
    detections: [],
    unavailable_roots: [],
  };
}

function playerState(played: boolean): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: played ? "/music/a.mp3" : null,
      playing: played,
      paused: false,
      positionSeconds: null,
      durationSeconds: null,
      volume: 100,
      muted: false,
    },
    queue: played
      ? { length: 1, currentId: "1", currentIndex: 0, currentItem: null, shuffle: false, repeat: "off" }
      : { length: 0, currentId: null, currentIndex: -1, currentItem: null, shuffle: false, repeat: "off" },
  } as unknown as PlayerSnapshot;
}

interface Setup {
  token?: boolean;
  played?: boolean;
  health?: LibraryHealth;
}

let pushPlayer: ((state: PlayerSnapshot) => void) | null;

function install({ token = false, played = false, health: h = health(10, 10) }: Setup = {}) {
  pushPlayer = null;
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    getBeatportTokenStatus: vi.fn().mockResolvedValue({ configured: token, masked: token ? "ab…yz" : null }),
    getLibraryHealth: vi.fn().mockResolvedValue(h),
    player: {
      getState: vi.fn().mockResolvedValue(playerState(played)),
      subscribeState: vi.fn((onState: (next: PlayerSnapshot) => void) => {
        pushPlayer = onState;
        onState(playerState(played));
        return vi.fn();
      }),
    },
  };
}

function mount(props: { imported?: boolean } = {}) {
  const handlers = { onMatch: vi.fn(), onAddToken: vi.fn() };
  const view = render(<FirstSteps imported={props.imported ?? false} {...handlers} />);
  return { ...handlers, ...view };
}

const item = (name: RegExp | string) => {
  const found = screen.getAllByRole("listitem").find((li) =>
    typeof name === "string" ? li.textContent?.includes(name) : name.test(li.textContent ?? ""),
  );
  if (!found) throw new Error(`no step like ${String(name)}`);
  return found;
};
const done = (name: RegExp | string) => item(name).getAttribute("data-done");

beforeEach(() => {
  localStorage.clear();
  resetPlayerStore();
});

afterEach(() => {
  localStorage.clear();
  resetPlayerStore();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the list", () => {
  it("has the four steps in order, none ticked on a new install", async () => {
    install();
    mount();
    const steps = within(screen.getByRole("list", { name: "First steps" })).getAllByRole("listitem");
    expect(steps.map((li) => li.querySelector(".first-steps__label")?.textContent)).toEqual([
      "Import your Rekordbox collection",
      "Match your tracks",
      "Play a track",
      "Add your Beatport token",
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add your Beatport token…" })).toBeEnabled());
    for (const li of steps) expect(li).toHaveAttribute("data-done", "false");
  });

  it("explains what each step is for, in the app's words", async () => {
    install();
    mount();
    expect(screen.getByText(/Clean and Discover/)).toBeInTheDocument();
    expect(screen.getByText(/Double-click a track to play it/)).toBeInTheDocument();
    expect(screen.getByText(/Keys, genres and labels come from Beatport/)).toBeInTheDocument();
  });
});

describe("ticking from real state", () => {
  it("ticks Import when the library has been imported", async () => {
    install();
    mount({ imported: true });
    await waitFor(() => expect(done("Import your Rekordbox collection")).toBe("true"));
  });

  it("ticks Match your tracks once some track has been looked up", async () => {
    install({ health: health(10, 7) });
    mount({ imported: true });
    await waitFor(() => expect(done("Match your tracks")).toBe("true"));
  });

  it("leaves Match your tracks open while every track is still not looked up", async () => {
    install({ health: health(10, 10) });
    mount({ imported: true });
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(done("Match your tracks")).toBe("false");
  });

  it("does not read the library's health before anything is imported", () => {
    install();
    mount({ imported: false });
    expect(window.cuepoint!.getLibraryHealth).not.toHaveBeenCalled();
    expect(done("Match your tracks")).toBe("false");
  });

  it("ticks Play a track when the player has been given one, and when it starts later", async () => {
    install({ played: false });
    mount();
    expect(done("Play a track")).toBe("false");
    act(() => pushPlayer?.(playerState(true)));
    await waitFor(() => expect(done("Play a track")).toBe("true"));
  });

  it("ticks Add your Beatport token when one is saved", async () => {
    install({ token: true });
    mount();
    await waitFor(() => expect(done("Add your Beatport token")).toBe("true"));
  });

  it("does not tick the token when the status cannot be read", async () => {
    install();
    (window.cuepoint as unknown as { getBeatportTokenStatus: unknown }).getBeatportTokenStatus = vi
      .fn()
      .mockRejectedValue(new Error("not ready"));
    mount();
    await waitFor(() => expect(window.cuepoint!.getBeatportTokenStatus).toHaveBeenCalled());
    expect(done("Add your Beatport token")).toBe("false");
  });
});

describe("hiding", () => {
  it("hides the whole list once all four are done", async () => {
    install({ token: true, played: true, health: health(10, 2) });
    const { container } = mount({ imported: true });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole("list", { name: "First steps" })).toBeNull();
  });

  it("stays while any one is open", async () => {
    install({ token: true, played: true, health: health(10, 10) });
    mount({ imported: true });
    await waitFor(() => expect(done("Add your Beatport token")).toBe("true"));
    expect(screen.getByRole("list", { name: "First steps" })).toBeInTheDocument();
  });
});

describe("the buttons", () => {
  it("offers only the token's button before anything is imported", () => {
    install();
    mount();
    expect(screen.getByRole("button", { name: "Add your Beatport token…" })).toBeInTheDocument();
    // The Library's own header has the import button, and there is nothing to match yet.
    expect(screen.queryByRole("button", { name: "Import your Rekordbox collection…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Match tracks…" })).toBeNull();
    expect(within(item("Play a track")).queryByRole("button")).toBeNull();
  });

  it("offers Match tracks… once there are tracks to match", () => {
    install({ health: health(10, 10) });
    mount({ imported: true });
    expect(screen.getByRole("button", { name: "Match tracks…" })).toBeInTheDocument();
  });

  it("takes a ticked step's button away", async () => {
    install({ token: true });
    mount();
    await waitFor(() => expect(done("Add your Beatport token")).toBe("true"));
    expect(screen.queryByRole("button", { name: "Add your Beatport token…" })).toBeNull();
  });

  it("each button calls what the page gave it", async () => {
    install({ health: health(10, 10) });
    const { onMatch, onAddToken } = mount({ imported: true });
    await userEvent.click(screen.getByRole("button", { name: "Match tracks…" }));
    await userEvent.click(screen.getByRole("button", { name: "Add your Beatport token…" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onAddToken).toHaveBeenCalledTimes(1);
  });
});

const DONE_KEY = "cuepoint-first-steps-done";
const PLAYED_KEY = "cuepoint-first-steps-played";

describe("after the import (RUN-3)", () => {
  it("is still listed once imported, with Match unticked and the others as they are", async () => {
    install({ health: health(10, 10) });
    mount({ imported: true });
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalled());
    expect(done("Import your Rekordbox collection")).toBe("true");
    expect(done("Match your tracks")).toBe("false");
  });

  it("ticks Match when a library change is announced after a match finishes", async () => {
    install({ health: health(10, 10) });
    mount({ imported: true });
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalledTimes(1));
    (window.cuepoint!.getLibraryHealth as ReturnType<typeof vi.fn>).mockResolvedValue(health(10, 6));
    act(() => announceLibraryChange());
    await waitFor(() => expect(done("Match your tracks")).toBe("true"));
  });

  it("reads Health again when the window gets focus back", async () => {
    install({ health: health(10, 10) });
    mount({ imported: true });
    await waitFor(() => expect(window.cuepoint!.getLibraryHealth).toHaveBeenCalledTimes(1));
    (window.cuepoint!.getLibraryHealth as ReturnType<typeof vi.fn>).mockResolvedValue(health(10, 6));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(done("Match your tracks")).toBe("true"));
  });

  it("remembers that a track was played, in a later session", async () => {
    install({ played: true, health: health(10, 10) });
    const first = mount({ imported: true });
    await waitFor(() => expect(done("Play a track")).toBe("true"));
    expect(localStorage.getItem(PLAYED_KEY)).toBe("1");
    first.unmount();

    install({ played: false, health: health(10, 10) });
    mount({ imported: true });
    expect(done("Play a track")).toBe("true");
  });

  it("is hidden for good once all four are done, and after a remount", async () => {
    install({ token: true, played: true, health: health(10, 2) });
    const first = mount({ imported: true });
    await waitFor(() => expect(localStorage.getItem(DONE_KEY)).toBe("1"));
    first.unmount();

    // Nothing is true any more, and still nothing shows.
    install({ token: false, played: false, health: health(10, 10) });
    const { container } = mount({ imported: true });
    expect(container).toBeEmptyDOMElement();
    expect(window.cuepoint!.getLibraryHealth).not.toHaveBeenCalled();
  });

  it("does not break when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    install({ token: true, played: true, health: health(10, 2) });
    const { container } = mount({ imported: true });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    install({ health: health(10, 10) });
    mount({ imported: true });
    expect(screen.getAllByRole("list", { name: "First steps" }).length).toBeGreaterThan(0);
  });
});

describe("the entry on the Library's notice line", () => {
  function mountNote() {
    const handlers = { onMatch: vi.fn(), onAddToken: vi.fn() };
    const view = render(<FirstStepsNote {...handlers} />);
    return { ...handlers, ...view };
  }

  it("says how many of the four are done and keeps the list closed", async () => {
    install({ health: health(10, 10) });
    mountNote();
    expect(await screen.findByText("First steps: 1 of 4 done")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("list", { name: "First steps" })).toBeNull();
  });

  it("counts a matched library: 2 of 4", async () => {
    install({ health: health(10, 6) });
    mountNote();
    expect(await screen.findByText("First steps: 2 of 4 done")).toBeInTheDocument();
  });

  it("opens the checklist in a dialog with Match tracks… inside it", async () => {
    install({ health: health(10, 10) });
    const { onMatch } = mountNote();
    await userEvent.click(await screen.findByRole("button", { name: /First steps/ }));
    const dialog = screen.getByRole("dialog", { name: "First steps" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(4);
    await userEvent.click(within(dialog).getByRole("button", { name: "Match tracks…" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and on a click outside", async () => {
    install({ health: health(10, 10) });
    mountNote();
    const open = await screen.findByRole("button", { name: /First steps/ });
    await userEvent.click(open);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(open);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is gone once all four are done and after a remount", async () => {
    install({ token: true, played: true, health: health(10, 2) });
    const first = mountNote();
    await waitFor(() => expect(screen.queryByText(/First steps:/)).toBeNull());
    expect(localStorage.getItem(DONE_KEY)).toBe("1");
    first.unmount();
    install({ health: health(10, 10) });
    const { container } = mountNote();
    expect(container).toBeEmptyDOMElement();
  });
});
