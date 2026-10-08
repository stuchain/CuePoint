import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem, QueueWindow } from "../../api/cuepointBridge.types";
import { QueuePanel } from "./QueuePanel";
import { resetPlayerStore } from "./playerStore";
import { EMPTY_AUDIO_STATE } from "./playerFormat";

/**
 * The queue panel (PLAYER-08, DEC-013).
 *
 * Two things are being held here. The first is that every gesture works from
 * the keyboard: reordering is a drag, but drag is not the *only* way to do it,
 * which is what makes the panel usable without a mouse and what lets these
 * tests exercise the behaviour without simulating drags — the risk the step was
 * flagged for.
 *
 * The second is that the panel stays windowed. A queue can hold 50,000 tracks,
 * and a panel that quietly rendered all of them would pass every behavioural
 * test here while being unusable on a real queue.
 */

function makeItem(index: number, overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: `q${index}`,
    trackId: index,
    filePath: `/music/${index}.flac`,
    title: `Track ${index}`,
    artist: `Artist ${index}`,
    key: "8A",
    bpm: 128,
    durationSeconds: 300,
    status: "pending",
    ...overrides,
  };
}

function snapshot(length: number, currentId: string | null = "q0"): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/0.flac",
      playing: true,
      paused: false,
      positionSeconds: 1,
      durationSeconds: 300,
      volume: 100,
      muted: false,
    },
    queue: {
      length,
      currentId,
      currentIndex: 0,
      currentItem: currentId ? makeItem(0, { status: "playing" }) : null,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

interface Harness {
  queueWindow: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  removeFromQueue: ReturnType<typeof vi.fn>;
  moveInQueue: ReturnType<typeof vi.fn>;
  clearQueue: ReturnType<typeof vi.fn>;
  push: (state: PlayerSnapshot) => void;
  /** Every window request the panel made. */
  requests: Array<{ offset: number; limit: number }>;
}

function install(total: number, items?: QueueItem[]): Harness {
  const all =
    items ??
    Array.from({ length: total }, (_, index) =>
      makeItem(index, index === 0 ? { status: "playing" } : {}),
    );
  const requests: Array<{ offset: number; limit: number }> = [];
  let push: ((state: PlayerSnapshot) => void) | null = null;

  const queueWindow = vi.fn(async (offset: number, limit: number): Promise<QueueWindow> => {
    requests.push({ offset, limit });
    return { offset, total: all.length, items: all.slice(offset, offset + limit) };
  });
  const jumpTo = vi.fn().mockResolvedValue(undefined);
  const removeFromQueue = vi.fn().mockResolvedValue(undefined);
  const moveInQueue = vi.fn().mockResolvedValue(undefined);
  const clearQueue = vi.fn().mockResolvedValue(undefined);

  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(snapshot(all.length)),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        onState(snapshot(all.length));
        return vi.fn();
      }),
      queueWindow,
      jumpTo,
      removeFromQueue,
      moveInQueue,
      clearQueue,
    },
  } as unknown as typeof window.cuepoint;

  return {
    queueWindow,
    jumpTo,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    requests,
    push: (state) => push?.(state),
  };
}

const rows = () => screen.queryAllByRole("option");

beforeEach(() => resetPlayerStore());

afterEach(() => {
  resetPlayerStore();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("what it shows", () => {
  it("lists the queue in order", async () => {
    install(5);
    render(<QueuePanel onClose={() => undefined} />);

    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().map((row) => within(row).getByText(/^Track/).textContent)).toEqual([
      "Track 0",
      "Track 1",
      "Track 2",
      "Track 3",
      "Track 4",
    ]);
  });

  it("marks the track that is playing", async () => {
    install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    expect(rows()[0]).toHaveAttribute("aria-selected", "true");
    expect(rows()[1]).toHaveAttribute("aria-selected", "false");
  });

  it("keeps already-played entries above the current one", async () => {
    // A queue is a place, not a stack: "what did I just play?" has to be
    // answerable, and jumping back to it possible.
    const items = [
      makeItem(0, { status: "pending" }),
      makeItem(1, { status: "playing" }),
      makeItem(2),
    ];
    install(3, items);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    expect(within(rows()[0]).getByText("Track 0")).toBeInTheDocument();
    expect(rows()[1]).toHaveAttribute("aria-selected", "true");
  });

  it("marks a track that would not play (DEC-054)", async () => {
    // The skip stays visible after the toast is gone.
    install(2, [makeItem(0, { status: "failed" }), makeItem(1, { status: "playing" })]);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(2));

    expect(rows()[0]).toHaveAttribute("data-status", "failed");
    expect(within(rows()[0]).getByText("Couldn't play this track")).toBeInTheDocument();
  });

  it("shows each track's position, name and length", async () => {
    install(2);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(2));

    const first = rows()[0];
    expect(within(first).getByText("1")).toBeInTheDocument();
    expect(within(first).getByText("Track 0")).toBeInTheDocument();
    expect(within(first).getByText("5:00")).toBeInTheDocument();
  });

  it("says so plainly when the queue is empty", async () => {
    install(0);
    render(<QueuePanel onClose={() => undefined} />);

    expect(await screen.findByText(/Nothing queued/i)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it("counts the queue in its heading", async () => {
    install(42);
    render(<QueuePanel onClose={() => undefined} />);
    expect(await screen.findByText(/Queue · 42/)).toBeInTheDocument();
  });

  it("closes when asked", async () => {
    install(2);
    const onClose = vi.fn();
    render(<QueuePanel onClose={onClose} />);
    await waitFor(() => expect(rows().length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Close the queue" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("acting on a track", () => {
  it("plays the one double-clicked", async () => {
    const harness = install(4);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.doubleClick(rows()[2]);

    await waitFor(() => expect(harness.jumpTo).toHaveBeenCalledWith(2));
  });

  it("plays the focused one on Enter", async () => {
    const harness = install(4);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[1], { key: "Enter" });

    await waitFor(() => expect(harness.jumpTo).toHaveBeenCalledWith(1));
  });

  it("removes one with its button", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Remove Track 1 from the queue" }));

    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q1"));
  });

  it("removes the focused one with Delete", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[2], { key: "Delete" });

    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q2"));
  });

  it("removing the playing track hands over rather than stalling", async () => {
    // PLAYER-04 advances when the playing entry goes; the panel has only to
    // ask, and then show what main reports.
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[0], { key: "Delete" });
    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q0"));

    harness.push(snapshot(2, "q1"));
    await waitFor(() => expect(harness.queueWindow).toHaveBeenCalledTimes(3));
  });
});

describe("reordering without a mouse", () => {
  it("moves a track up with Alt+Up", async () => {
    const harness = install(4);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[2], { key: "ArrowUp", altKey: true });

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(2, 1));
  });

  it("moves a track down with Alt+Down", async () => {
    const harness = install(4);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[1], { key: "ArrowDown", altKey: true });

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(1, 2));
  });

  it("does not move the first track above the queue", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[0], { key: "ArrowUp", altKey: true });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("does not move the last track past the end", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[2], { key: "ArrowDown", altKey: true });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("leaves a plain arrow key to normal navigation", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[1], { key: "ArrowDown" });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("reorders by drag as well", async () => {
    const harness = install(4);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.dragStart(rows()[3]);
    fireEvent.dragOver(rows()[0]);
    fireEvent.drop(rows()[0]);

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(3, 0));
  });

  it("ignores a drop onto the row that was picked up", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.dragStart(rows()[1]);
    fireEvent.drop(rows()[1]);

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });
});

describe("a queue too big to render", () => {
  it("draws a bounded number of rows for 5,000 tracks", async () => {
    // The acceptance criterion. A panel that rendered the list would pass every
    // behavioural test above and be unusable on a real queue.
    install(5_000);
    render(<QueuePanel onClose={() => undefined} />);

    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThan(200);
  });

  it("asks main for a window rather than the whole queue", async () => {
    const harness = install(5_000);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(harness.requests.length).toBeGreaterThan(0));

    for (const request of harness.requests) {
      expect(request.limit).toBeLessThanOrEqual(500);
    }
  });

  it("sizes its scrollbar for the whole queue", async () => {
    // The rows are a window; the scrollbar has to describe the queue.
    install(5_000);
    const { container } = render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));

    const sizer = container.querySelector(".cp-queue__sizer") as HTMLElement;
    expect(Number.parseInt(sizer.style.height, 10)).toBeGreaterThan(5_000 * 20);
  });

  it("asks for a different slice when scrolled", async () => {
    const harness = install(5_000);
    const { container } = render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const before = harness.requests.length;

    const scroller = container.querySelector(".cp-queue__scroll") as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    scroller.scrollTop = 44 * 1_000;
    fireEvent.scroll(scroller);

    await waitFor(() => expect(harness.requests.length).toBeGreaterThan(before));
    expect(harness.requests.at(-1)?.offset).toBeGreaterThan(900);
  });
});

describe("without a bridge", () => {
  it("renders its empty state rather than throwing", () => {
    expect(() => render(<QueuePanel onClose={() => undefined} />)).not.toThrow();
    expect(screen.getByText(/Nothing queued/i)).toBeInTheDocument();
  });
});

describe("managing the queue (BAR-8)", () => {
  it("says the gestures in a hint line", async () => {
    install(2);
    render(<QueuePanel onClose={() => undefined} />);
    expect(
      await screen.findByText("Drag to reorder · Alt+↑/↓ moves · Delete removes · Enter plays"),
    ).toBeInTheDocument();
  });

  it("asks before clearing, then clears once", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Clear queue" }));
    expect(harness.clearQueue).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Clear the queue? The playing track keeps playing.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Clear queue" }));

    await waitFor(() => expect(harness.clearQueue).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears nothing when the question is declined", async () => {
    const harness = install(3);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Clear queue" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(harness.clearQueue).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no Clear queue for an empty queue", () => {
    install(0);
    render(<QueuePanel onClose={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Clear queue" })).toBeNull();
  });

  it("offers no Clear queue when the playing track is the only row", async () => {
    install(1);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(1));
    expect(screen.queryByRole("button", { name: "Clear queue" })).toBeNull();
  });

  it("draws a drop line at the row being dragged over, and removes it on drop", async () => {
    const harness = install(4);
    const { container } = render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.dragStart(rows()[0]);
    expect(container.querySelector(".cp-queue__drop")).toBeNull();
    fireEvent.dragOver(rows()[2]);
    const line = container.querySelector(".cp-queue__drop") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.getAttribute("aria-hidden")).toBe("true");

    fireEvent.drop(rows()[2]);
    expect(container.querySelector(".cp-queue__drop")).toBeNull();
    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(0, 2));
  });

  it("removes the line when the drag ends elsewhere", async () => {
    install(4);
    const { container } = render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.dragStart(rows()[0]);
    fireEvent.dragOver(rows()[2]);
    fireEvent.dragEnd(rows()[0]);

    expect(container.querySelector(".cp-queue__drop")).toBeNull();
  });

  it("draws the close and remove controls as icons, not letters", async () => {
    install(2);
    const { container } = render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(2));

    expect(container.querySelector(".cp-queue__close [data-icon='close']")).not.toBeNull();
    expect(container.querySelectorAll(".cp-queue__remove [data-icon='close']")).toHaveLength(2);
    expect(container.textContent).not.toContain("×");
    expect(screen.getByRole("button", { name: "Close the queue" })).toHaveAttribute(
      "title",
      "Close the queue",
    );
    expect(screen.getAllByRole("button", { name: /^Remove / })[0]).toHaveAttribute(
      "title",
      "Remove from the queue",
    );
  });
});

describe("a track that could not be played (BAR-9)", () => {
  it("says why, as text on the row", async () => {
    install(3, [
      makeItem(0, { status: "playing" }),
      makeItem(1, { status: "failed", failure: "the file is missing or could not be opened" }),
      makeItem(2),
    ]);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(3));

    const failed = within(rows()[1]);
    expect(failed.getByText("Couldn't play: the file is missing or could not be opened")).toBeVisible();
    expect(within(rows()[0]).queryByText(/Couldn't play/)).toBeNull();
    expect(within(rows()[2]).queryByText(/Couldn't play/)).toBeNull();
  });

  it("still says it failed when no reason came", async () => {
    install(2, [makeItem(0), makeItem(1, { status: "failed" })]);
    render(<QueuePanel onClose={() => undefined} />);
    await waitFor(() => expect(rows().length).toBe(2));

    expect(within(rows()[1]).getByText("Couldn't play this track")).toBeInTheDocument();
  });
});
