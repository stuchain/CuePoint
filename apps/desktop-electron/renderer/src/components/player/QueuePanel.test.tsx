import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem, QueueWindow } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../Toast";
import { MotionProvider } from "../../tokens/MotionContext";
import { useLayerStack } from "../../hooks/useLayerStack";
import { QueuePanel } from "./QueuePanel";
import { ROW_HEIGHT_FALLBACK } from "../table/trackTableLayout";
import { resetPlayerStore } from "./playerStore";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { QUEUE_ARTIST_MIN_WIDTH, QUEUE_DEFAULT_WIDTH, resetQueueWidthForTests, setQueueWidth1x } from "./queueWidth";
import queueCss from "./QueuePanel.css?raw";
import { formatCount } from "../../format/counts";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
import { expectNoAxeViolations } from "../../test/axe";

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
  addToQueue: ReturnType<typeof vi.fn>;
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
  const addToQueue = vi.fn().mockResolvedValue(undefined);

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
      addToQueue,
      clearQueue,
    },
  } as unknown as typeof window.cuepoint;

  return {
    queueWindow,
    jumpTo,
    removeFromQueue,
    moveInQueue,
    addToQueue,
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

describe("Escape (C29)", () => {
  it("closes the queue while focus is inside it, and not from elsewhere", async () => {
    install(2);
    const onClose = vi.fn();
    render(<ToastProvider><QueuePanel onClose={onClose} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "Close the queue" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to a newer layer open over it (M469)", async () => {
    install(2);
    const onClose = vi.fn();
    render(<ToastProvider><QueuePanel onClose={onClose} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    function Layer() {
      useLayerStack(true);
      return null;
    }
    const layer = render(<Layer />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Close the queue" }), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    layer.unmount();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close the queue" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("round 3 gap fixes (P3)", () => {
  it("offers Clear queue as a quiet button (M312)", async () => {
    install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    expect(screen.getByRole("button", { name: "Clear queue…" }).className).toMatch(/cp-btn--quiet/);
  });

  it("lays a row out on one line: title, artist, key column, length (queue A)", async () => {
    install(2);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    const row = rows()[0]!;
    const text = row.querySelector(".cp-queue__text")!;
    expect(text.querySelector(":scope > .cp-queue__row-title")!.textContent).toBe("Track 0");
    expect(text.querySelector(":scope > .cp-queue__row-meta")!.textContent).toBe("Artist 0");
    // The key is a column of its own after the text, and the BPM is no longer in the row.
    expect(text.nextElementSibling!.classList.contains("cp-queue__key")).toBe(true);
    expect(row.querySelector(".cp-queue__key .key-chip")!.textContent).toBe("8A");
    expect(row.textContent).not.toMatch(/BPM/);
    expect(row.querySelector(".cp-queue__row-line")).toBeNull();
  });

  it("keeps the key column on a row with no key, so the lengths line up (queue A)", async () => {
    install(2, [makeItem(0, { status: "playing", key: null }), makeItem(1)]);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    const key = rows()[0]!.querySelector(".cp-queue__key")!;
    expect(key).not.toBeNull();
    expect(key.childElementCount).toBe(0);
  });

  it("shows the artist column only from the wide width (queue A)", async () => {
    install(2);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    const panel = container.querySelector(".cp-queue")!;
    // The default width (213 times the text size) is under the line: the title keeps the room.
    expect(QUEUE_DEFAULT_WIDTH).toBeLessThan(QUEUE_ARTIST_MIN_WIDTH);
    expect(panel.hasAttribute("data-wide")).toBe(false);
    act(() => setQueueWidth1x(QUEUE_ARTIST_MIN_WIDTH));
    await waitFor(() => expect(panel.hasAttribute("data-wide")).toBe(true));
    act(() => setQueueWidth1x(QUEUE_DEFAULT_WIDTH));
  });

  it("puts the gestures at the foot of the head, not under it (queue H1)", async () => {
    install(2);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    const gestures = screen.getByText(/^Drag to reorder/);
    expect(gestures.parentElement!.classList.contains("cp-queue__header")).toBe(true);
    expect(gestures.parentElement!.lastElementChild).toBe(gestures);
  });

  it("leaves as a still copy marked data-leaving when it closes, with motion on (M380)", async () => {
    install(2);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    try {
      const view = render(<MotionProvider><ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider></MotionProvider>);
      await waitFor(() => expect(rows().length).toBe(2));
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      view.unmount();
      const ghost = document.querySelector(".cp-queue[data-ghost]");
      expect(ghost).not.toBeNull();
      expect(ghost).toHaveAttribute("data-leaving");
      expect(ghost).toHaveAttribute("inert");
      ghost?.remove();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("what it shows", () => {
  it("lists the queue in order", async () => {
    install(5);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);

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
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    // Playing is not selected: a selection is the user's, the playing mark is the player's.
    expect(rows()[0]).toHaveAttribute("aria-current", "true");
    expect(rows()[1]).not.toHaveAttribute("aria-current");
    expect(rows()[0]).toHaveAttribute("aria-selected", "false");
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
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    expect(within(rows()[0]).getByText("Track 0")).toBeInTheDocument();
    expect(rows()[1]).toHaveAttribute("aria-current", "true");
  });

  it("marks a track that would not play (DEC-054)", async () => {
    // The skip stays visible after the toast is gone.
    install(2, [makeItem(0, { status: "failed" }), makeItem(1, { status: "playing" })]);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));

    expect(rows()[0]).toHaveAttribute("data-status", "failed");
    expect(within(rows()[0]).getByText("Could not play this track.")).toBeInTheDocument();
  });

  it("shows each track's position, name and length", async () => {
    install(2);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));

    // The playing row shows a speaker where its number would be (M310); the others show theirs.
    const first = rows()[0];
    expect(within(first).queryByText("1")).toBeNull();
    expect(first.querySelector(".cp-queue__position .cp-queue__playing-icon")).not.toBeNull();
    expect(within(first).getByText("Track 0")).toBeInTheDocument();
    expect(within(first).getByText("5:00")).toBeInTheDocument();
    const second = rows()[1];
    expect(within(second).getByText("2")).toBeInTheDocument();
    expect(within(second).getByText("Track 1")).toBeInTheDocument();
  });

  it("says so plainly when the queue is empty", async () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);

    expect(await screen.findByText(/Nothing queued/i)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it("counts the queue in its heading", async () => {
    install(42);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    // The name, then its count apart in grey (area 58): no "Queue · 42".
    const heading = await screen.findByRole("heading", { name: /Queue/ });
    expect(heading.querySelector(".cp-queue__count")).toHaveTextContent("42");
    expect(heading).not.toHaveTextContent("·");
  });

  it("closes when asked", async () => {
    install(2);
    const onClose = vi.fn();
    render(<ToastProvider><QueuePanel onClose={onClose} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Close the queue" }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe("acting on a track", () => {
  it("plays the one double-clicked", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.doubleClick(rows()[2]);

    await waitFor(() => expect(harness.jumpTo).toHaveBeenCalledWith(2));
  });

  it("plays the focused one on Enter", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[1], { key: "Enter" });

    await waitFor(() => expect(harness.jumpTo).toHaveBeenCalledWith(1));
  });

  it("removes one with its button", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Remove Track 1 from the queue" }));

    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q1"));
  });

  it("offers Undo that puts the removed track back in the same place", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.click(screen.getByRole("button", { name: "Remove Track 1 from the queue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(harness.addToQueue).toHaveBeenCalledTimes(1));
    expect(harness.addToQueue.mock.calls[0]![0][0]).toMatchObject({ trackId: 1, filePath: "/music/1.flac", title: "Track 1" });
    // Appended last (the queue was 4 long), then moved to where it was.
    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(3, 1));
  });

  it("removes the focused one with Delete", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[2], { key: "Delete" });

    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q2"));
  });

  it("removing the playing track hands over rather than stalling", async () => {
    // PLAYER-04 advances when the playing entry goes; the panel has only to
    // ask, and then show what main reports.
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
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
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[2], { key: "ArrowUp", altKey: true });

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(2, 1));
  });

  it("moves a track down with Alt+Down", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.keyDown(rows()[1], { key: "ArrowDown", altKey: true });

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(1, 2));
  });

  it("does not move the first track above the queue", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[0], { key: "ArrowUp", altKey: true });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("does not move the last track past the end", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[2], { key: "ArrowDown", altKey: true });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("leaves a plain arrow key to normal navigation", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.keyDown(rows()[1], { key: "ArrowDown" });

    expect(harness.moveInQueue).not.toHaveBeenCalled();
  });

  it("reorders by drag as well", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.dragStart(rows()[3]);
    fireEvent.dragOver(rows()[0]);
    fireEvent.drop(rows()[0]);

    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(3, 0));
  });

  it("ignores a drop onto the row that was picked up", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
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
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);

    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThan(200);
  });

  it("asks main for a window rather than the whole queue", async () => {
    const harness = install(5_000);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(harness.requests.length).toBeGreaterThan(0));

    for (const request of harness.requests) {
      expect(request.limit).toBeLessThanOrEqual(500);
    }
  });

  it("sizes its scrollbar for the whole queue", async () => {
    // The rows are a window; the scrollbar has to describe the queue.
    install(5_000);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));

    const sizer = container.querySelector(".cp-queue__sizer") as HTMLElement;
    expect(Number.parseInt(sizer.style.height, 10)).toBeGreaterThan(5_000 * 20);
  });

  it("makes each row one table row tall, following the size and Row density (R4-1)", async () => {
    // One line per entry (title, then its facts muted), so one of the table's rows.
    document.documentElement.style.setProperty("--row-height", "29px");
    try {
      install(3);
      render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
      await waitFor(() => expect(rows().length).toBe(3));
      expect(rows()[1]!.style.height).toBe("29px");
      expect(rows()[1]!.style.top).toBe("29px");
    } finally {
      document.documentElement.style.removeProperty("--row-height");
    }
  });

  it("asks for a different slice when scrolled", async () => {
    const harness = install(5_000);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const before = harness.requests.length;

    const scroller = container.querySelector(".cp-queue__scroll") as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    // jsdom has no stylesheet, so the table's fallback row height applies: one per entry.
    scroller.scrollTop = ROW_HEIGHT_FALLBACK * 1_000;
    fireEvent.scroll(scroller);

    await waitFor(() => expect(harness.requests.length).toBeGreaterThan(before));
    expect(harness.requests.at(-1)?.offset).toBeGreaterThan(900);
  });
});

describe("without a bridge", () => {
  it("renders its empty state rather than throwing", () => {
    expect(() => render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>)).not.toThrow();
    expect(screen.getByText(/Nothing queued/i)).toBeInTheDocument();
  });

  it("uses the compact empty state with no full stop on its headline (C140, C163)", () => {
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    expect(container.querySelector(".cp-empty-state--compact")).not.toBeNull();
    expect(screen.getByText("Nothing queued")).toBeInTheDocument();
    expect(container.querySelector(".cp-queue__empty")).toBeNull();
  });
});

describe("managing the queue (BAR-8)", () => {
  // D27, M313, M467: the gestures are one muted line under the head, and the title is no longer a tab stop.
  it("says the gestures in one muted line under the head, and the title is not focusable", async () => {
    install(2);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    const line = container.querySelector(".cp-queue__gestures") as HTMLElement;
    expect(line).toHaveTextContent("Drag to reorder · Alt+↑/↓ moves · Delete removes · Enter plays");
    const title = screen.getByRole("heading", { name: /Queue/ }).querySelector(".cp-queue__name") as HTMLElement;
    expect(title).not.toHaveAttribute("tabindex");
    expect(title).not.toHaveAttribute("title");
  });

  it("makes the head a side head, as Track details is (M50)", async () => {
    install(2);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    expect(container.querySelector("header")).toHaveClass("cp-side-head");
  });

  it("says how tracks get here, and draws no grip, when the queue is one track (M311)", async () => {
    install(1);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(1));
    expect(container.querySelector(".cp-queue__one")).toHaveTextContent("Add more with Play next or Add to queue.");
    expect(container.querySelector(".cp-queue__grip")).toBeNull();
  });

  it("takes the remove mark out of the tab order, leaving the row as the one control (M467)", async () => {
    install(2);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    expect(within(rows()[0]!).getByRole("button", { name: /Remove/ })).toHaveAttribute("tabindex", "-1");
  });

  it("moves to the next track whose title starts with the typed letters (M481)", async () => {
    install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));
    rows()[0]!.focus();
    fireEvent.keyDown(rows()[0]!, { key: "t" });
    fireEvent.keyDown(rows()[1]!, { key: "r" });
    fireEvent.keyDown(rows()[1]!, { key: "a" });
    fireEvent.keyDown(rows()[1]!, { key: "c" });
    fireEvent.keyDown(rows()[1]!, { key: "k" });
    fireEvent.keyDown(rows()[1]!, { key: " " });
    fireEvent.keyDown(rows()[1]!, { key: "3" });
    await waitFor(() => expect(rows()[3]).toHaveAttribute("aria-selected", "true"));
  });

  it("dims the tracks above the playing one, as a table's played rows are (M312)", () => {
    const css = stripComments(queueCss);
    const rule = parseRules(css).find((r) => r.selector === ".cp-queue__row--played .cp-queue__row-title")!;
    expect(Object.fromEntries(declarations(rule.body))["color"]).toBe("var(--fg-muted)");
  });

  it("asks before clearing, then clears once", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Clear queue…" }));
    expect(harness.clearQueue).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    // The body no longer repeats the title (M312).
    expect(dialog).toHaveTextContent("Clear queue?The playing track keeps playing.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Clear queue" }));

    await waitFor(() => expect(harness.clearQueue).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears nothing when the question is declined", async () => {
    const harness = install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: "Clear queue…" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(harness.clearQueue).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers no Clear queue for an empty queue", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    expect(screen.queryByRole("button", { name: "Clear queue…" })).toBeNull();
  });

  it("offers no Clear queue when the playing track is the only row", async () => {
    install(1);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(1));
    expect(screen.queryByRole("button", { name: "Clear queue…" })).toBeNull();
  });

  it("draws a drop line at the row being dragged over, and removes it on drop", async () => {
    const harness = install(4);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
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
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.dragStart(rows()[0]);
    fireEvent.dragOver(rows()[2]);
    fireEvent.dragEnd(rows()[0]);

    expect(container.querySelector(".cp-queue__drop")).toBeNull();
  });

  it("draws the close and remove controls as icons, not letters", async () => {
    install(2);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));

    // Removing a track is the boxed × Track details uses, never the trash can (C129).
    expect(container.querySelector(".cp-close [data-icon='close']")).not.toBeNull();
    expect(container.querySelectorAll(".cp-remove [data-icon='close']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-icon='remove']")).toHaveLength(0);
    expect(container.textContent).not.toContain("×");
    expect(screen.getByRole("button", { name: "Close the queue" })).toHaveAttribute(
      "title",
      "Close the queue",
    );
    // The shared RemoveButton: its tip is its name, and it is the boxed button with no trash (C129).
    const remove = screen.getAllByRole("button", { name: /^Remove / })[0]!;
    expect(remove).toHaveAttribute("title", "Remove Track 0 from the queue");
    expect(remove.classList.contains("cp-remove")).toBe(true);
    expect(container.querySelector("[data-icon='trash']")).toBeNull();
  });
});

describe("a track that could not be played (BAR-9)", () => {
  it("says why, as text on the row", async () => {
    install(3, [
      makeItem(0, { status: "playing" }),
      makeItem(1, { status: "failed", failure: "the file is missing or could not be opened" }),
      makeItem(2),
    ]);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    const failed = within(rows()[1]);
    expect(failed.getByText("Could not play. The file is missing or could not be opened.")).toBeVisible();
    expect(within(rows()[0]).queryByText(/Could not play/)).toBeNull();
    expect(within(rows()[2]).queryByText(/Could not play/)).toBeNull();
  });

  it("wraps the reason onto the row's second line instead of cutting it to 'Could n…' (new J)", () => {
    const rules = parseRules(stripComments(queueCss));
    const get = (selector: string) => {
      const rule = rules.filter((r) => selectorList(r.selector).includes(selector)).pop();
      return new Map(rule ? declarations(rule.body) : []);
    };
    // The title and the reason run as one wrapped text over the row's two lines.
    const text = get(".cp-queue__row--failed .cp-queue__text");
    expect(text.get("display")).toBe("-webkit-box");
    expect(text.get("-webkit-line-clamp")).toBe("2");
    expect(text.get("white-space")).toBe("normal");
    for (const part of [".cp-queue__row--failed .cp-queue__row-title", ".cp-queue__row--failed .cp-queue__failed"]) {
      expect(get(part).get("display")).toBe("inline");
      expect(get(part).get("white-space")).toBe("normal");
    }
    // Two lines fit the one row height (the list's rows are all one height).
    expect(text.get("line-height")).toBe("calc((var(--row-height) - var(--hairline)) / 2)");
    // A track that did not play has no length worth the room; the reason takes it.
    expect(get(".cp-queue__row--failed .cp-queue__duration").get("display")).toBe("none");
  });

  it("still says it failed when no reason came", async () => {
    install(2, [makeItem(0), makeItem(1, { status: "failed" })]);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));

    expect(within(rows()[1]).getByText("Could not play this track.")).toBeInTheDocument();
  });
});

describe("its width (C204, D11)", () => {
  afterEach(() => {
    localStorage.clear();
    resetQueueWidthForTests();
  });

  const panel = () => screen.getByRole("complementary", { name: "Playback queue" });

  it("opens at the Track details width, 213 times the text size", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    // The default text size is Medium, 1.5.
    expect(panel().style.width).toBe("320px");
  });

  it("has a resize handle on its left edge, and no fixed width in the stylesheet", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const handle = screen.getByRole("separator", { name: "Resize the queue" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("tabindex", "0");
  });

  it("drags wider to the left and remembers the width in 1x units", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const handle = screen.getByRole("separator", { name: "Resize the queue" });

    fireEvent.mouseDown(handle, { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: 800 });
    fireEvent.mouseUp(window);

    expect(panel().style.width).toBe("420px");
    // 420px at 1.5x is 280 in 1x units.
    expect(localStorage.getItem("cuepoint.queue.width1x")).toBe("280");
  });

  it("stops at 200 and 448 times the text size", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const handle = screen.getByRole("separator", { name: "Resize the queue" });

    fireEvent.mouseDown(handle, { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: -5000 });
    fireEvent.mouseUp(window);
    // 448 x 1.5, kept to half of the test window (1024).
    expect(panel().style.width).toBe("512px");

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 5000 });
    fireEvent.mouseUp(window);
    expect(panel().style.width).toBe("300px");
  });

  it("moves with the arrow keys from the handle", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const handle = screen.getByRole("separator", { name: "Resize the queue" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(panel().style.width).toBe("336px");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(panel().style.width).toBe("304px");
  });

  it("reopens at the width it was left at", () => {
    localStorage.setItem("cuepoint.queue.width1x", "300");
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    expect(panel().style.width).toBe("450px");
  });

  it("keeps to half the window as the window narrows (S4)", () => {
    const before = window.innerWidth;
    try {
      localStorage.setItem("cuepoint.queue.width1x", "448");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });
      install(0);
      render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
      expect(panel().style.width).toBe("672px");
      act(() => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
        window.dispatchEvent(new Event("resize"));
      });
      expect(panel().style.width).toBe("500px");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: before });
    }
  });

  it("tells assistive technology its range on the resize handle (N2)", () => {
    install(0);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const handle = screen.getByRole("separator", { name: "Resize the queue" });
    expect(handle).toHaveAttribute("aria-valuemin", "300");
    // 448 x 1.5 is 672, kept to half of the 1024px test window.
    expect(handle).toHaveAttribute("aria-valuemax", "512");
    expect(handle).toHaveAttribute("aria-valuenow", panel().style.width.replace("px", ""));
  });

  it("takes its width from the code, its border from the stylesheet, and has no shadow (D11)", () => {
    const rule = parseRules(stripComments(queueCss)).find((r) => r.selector === ".cp-queue")!;
    const decls = Object.fromEntries(declarations(rule.body));
    // P56: the panel's left edge is the one divider, on the toolbar tone.
    expect(decls["border-left"]).toBe("var(--divider)");
    expect(decls["background"]).toBe("var(--bg-toolbar)");
    expect(decls["box-shadow"]).toBeUndefined();
    expect(decls["width"]).toBeUndefined();
  });
});

describe("its header (C29, C129)", () => {
  it("is the shared panel header with the section-heading title and the close mark on one line", () => {
    install(0);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const header = container.querySelector("header") as HTMLElement;
    expect(header.classList.contains("cp-panel-header")).toBe(true);
    expect(screen.getByRole("heading", { name: "Queue" }).classList.contains("cp-panel-header__title")).toBe(true);
  });

  // M3: the queue's key chip is the tables' chip (Inter semibold); no rule here makes it regular.
  it("leaves the key chip at the shared chip weight", () => {
    const rule = parseRules(stripComments(queueCss)).find((r) => r.selector === ".cp-queue__row .key-chip");
    expect(rule).toBeUndefined();
  });

  // Queue A: the key column keeps its room and the widest chip's width; the title and artist give way.
  it("keeps the key column at the widest chip's width while the names are cut", () => {
    const key = Object.fromEntries(declarations(parseRules(stripComments(queueCss)).find((r) => r.selector === ".cp-queue__key")!.body));
    expect(key["flex"]).toBe("none");
    expect(key["min-inline-size"]).toBe("calc(3ch + 2 * var(--chip-pad))");
    expect(key["font-size"]).toBe("var(--font-size-chip)");
  });

  // Queue A: the artist is hidden until the panel is wide; the failure line is never hidden by it.
  it("shows the artist column only on a wide panel", () => {
    const rules = parseRules(stripComments(queueCss));
    expect(Object.fromEntries(declarations(rules.find((r) => r.selector === ".cp-queue__row-meta")!.body))["display"]).toBe("none");
    const wide = rules.find((r) => r.selector === ".cp-queue[data-wide] .cp-queue__row-meta:not(.cp-queue__failed)");
    expect(wide).toBeDefined();
  });

  // Queue H1: Clear queue is centred on the title's row, as the close mark is.
  it("sits Clear queue on the close mark's line", () => {
    const clear = Object.fromEntries(declarations(parseRules(stripComments(queueCss)).find((r) => r.selector === ".cp-queue__clear")!.body));
    expect(clear["margin-top"]).toBe("calc((var(--toolbar-height) - var(--control-height-sm)) / 2)");
  });

  // M66: one inset both sides, the head's, so the two × columns line up (M309).
  it("pads its rows by the page's inset, like its head", () => {
    const row = parseRules(stripComments(queueCss)).find((r) => r.selector === ".cp-queue__row")!;
    expect(Object.fromEntries(declarations(row.body))["padding"]).toBe("0 var(--space-lg)");
  });
});

describe("selecting rows, the keys and the menu (C187)", () => {
  it("selects a row on click, with the playing row marked apart", async () => {
    install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.click(rows()[2]!);

    expect(rows()[2]).toHaveAttribute("aria-selected", "true");
    expect(rows()[0]).toHaveAttribute("aria-selected", "false");
    expect(rows()[0]).toHaveAttribute("aria-current", "true");
  });

  it("moves the selection with the arrow keys, and focus with it", async () => {
    install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    rows()[1]!.focus();
    fireEvent.keyDown(rows()[1]!, { key: "ArrowDown" });
    await waitFor(() => expect(rows()[2]).toHaveAttribute("aria-selected", "true"));
    expect(rows()[2]).toHaveFocus();

    fireEvent.keyDown(rows()[2]!, { key: "ArrowUp" });
    fireEvent.keyDown(rows()[1]!, { key: "ArrowUp" });
    await waitFor(() => expect(rows()[0]).toHaveAttribute("aria-selected", "true"));
    // The first row stops it.
    fireEvent.keyDown(rows()[0]!, { key: "ArrowUp" });
    expect(rows()[0]).toHaveAttribute("aria-selected", "true");
  });

  it("is one tab stop: only the active row is in the tab order", async () => {
    install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    expect(rows().filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });

  it("opens a menu on right-click, selecting the row first", async () => {
    install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });

    expect(rows()[2]).toHaveAttribute("aria-selected", "true");
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Play"),
      expect.stringContaining("Move up"),
      expect.stringContaining("Move down"),
      expect.stringContaining("Remove from the queue"),
    ]);
  });

  it("plays, moves and removes from the menu", async () => {
    const harness = install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));

    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Play/ }));
    await waitFor(() => expect(harness.jumpTo).toHaveBeenCalledWith(2));

    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Move up/ }));
    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(2, 1));

    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Move down/ }));
    await waitFor(() => expect(harness.moveInQueue).toHaveBeenCalledWith(2, 3));

    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Remove from the queue/ }));
    await waitFor(() => expect(harness.removeFromQueue).toHaveBeenCalledWith("q2"));
  });

  it("greys Move up on the first row and Move down on the last", async () => {
    install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));

    fireEvent.contextMenu(rows()[0]!, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menuitem", { name: /^Move up/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.contextMenu(rows()[2]!, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menuitem", { name: /^Move down/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the keys beside the menu items", async () => {
    install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    fireEvent.contextMenu(rows()[1]!, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("Enter");
    expect(menu).toHaveTextContent("Delete");
  });

  it("draws the shared grip on each row as the drag handle", async () => {
    install(2);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    expect(container.querySelectorAll(".cp-queue__grip [data-icon='grip']")).toHaveLength(2);
  });

  it("refuses a drag that did not start in the queue, visibly", async () => {
    install(3);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    const dataTransfer = { dropEffect: "move", effectAllowed: "copy", types: ["text/plain"] };

    const scroll = container.querySelector(".cp-queue__scroll") as HTMLElement;
    fireEvent.dragOver(rows()[1]!, { dataTransfer });

    expect(dataTransfer.dropEffect).toBe("none");
    expect(scroll).toHaveAttribute("data-refusing");
    expect(container.querySelector(".cp-queue__drop")).toBeNull();

    fireEvent.dragLeave(scroll);
    expect(scroll).not.toHaveAttribute("data-refusing");
  });

  it("refuses a foreign drag over the gaps between and under the rows too (N1)", async () => {
    install(3);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    const dataTransfer = { dropEffect: "move", types: ["text/plain"] };
    const scroll = container.querySelector(".cp-queue__scroll") as HTMLElement;
    fireEvent.dragOver(scroll, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("none");
    expect(scroll).toHaveAttribute("data-refusing");
  });

  it("moves nothing when a foreign drag is dropped", async () => {
    const harness = install(3);
    const { container } = render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(3));
    fireEvent.dragOver(rows()[1]!, { dataTransfer: { dropEffect: "move", types: [] } });
    fireEvent.drop(rows()[1]!, { dataTransfer: { types: [] } });
    expect(harness.moveInQueue).not.toHaveBeenCalled();
    expect(container.querySelector(".cp-queue__scroll")).not.toHaveAttribute("data-refusing");
  });
});

describe("its words (C73, C161, C163)", () => {
  it("shows a missing title as a dash and lengths in the shared format", async () => {
    install(2, [
      makeItem(0, { title: "", durationSeconds: 3725, status: "playing" }),
      makeItem(1, { durationSeconds: null as unknown as number }),
    ]);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(2));
    expect(within(rows()[0]!).getByText("—", { selector: ".cp-queue__row-title" })).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("1:02:05")).toBeInTheDocument();
    expect(within(rows()[1]!).getByText("—", { selector: ".cp-queue__duration" })).toBeInTheDocument();
    expect(screen.queryByText("Untitled")).toBeNull();
  });

  it("says a removal without a full stop", async () => {
    install(4);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBe(4));
    fireEvent.click(screen.getByRole("button", { name: "Remove Track 1 from the queue" }));
    expect(await screen.findByText("Removed “Track 1” from the queue")).toBeInTheDocument();
  });

  it("counts the queue with the shared grouping", async () => {
    install(1234);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    const heading = await screen.findByRole("heading", { name: /Queue/ });
    expect(heading.querySelector(".cp-queue__count")).toHaveTextContent(formatCount(1234));
  });
});

describe("QueuePanel accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations", async () => {
    install(3);
    render(<ToastProvider><QueuePanel onClose={() => undefined} /></ToastProvider>);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    // A11Y-01: the per-row remove button sits inside the option. Moving it out is a layout change, so it
    // waits for a mockup (a11y-findings.md); everything else on the panel is held.
    await expectNoAxeViolations({
      known: [{ rule: "nested-interactive", selector: ".cp-queue__row", finding: "A11Y-01" }],
    });
  });
});
