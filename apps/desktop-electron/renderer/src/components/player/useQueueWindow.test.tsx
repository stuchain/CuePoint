import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem, QueueWindow } from "../../api/cuepointBridge.types";
import { resetPlayerStore } from "./playerStore";
import { useQueueWindow } from "./useQueueWindow";

/**
 * Reading the queue a window at a time (PLAYER-08).
 *
 * Two failures worth a test of their own, because both are invisible until they
 * are not: an older request answering after a newer one and overwriting it, and
 * a panel that keeps showing a queue that has since changed.
 */

function item(index: number): QueueItem {
  return {
    id: `q${index}`,
    trackId: index,
    filePath: `/music/${index}.flac`,
    title: `Track ${index}`,
    artist: "Artist",
    key: "8A",
    bpm: 128,
    durationSeconds: 300,
    status: "pending",
  };
}

function snapshot(length: number, currentId: string | null): PlayerSnapshot {
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
      currentItem: currentId ? item(0) : null,
      shuffle: false,
      repeat: "off",
    },
  };
}

function Probe() {
  const { items, total, loading } = useQueueWindow();
  return (
    <div>
      <span data-testid="total">{total}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="titles">{items.map((entry) => entry.title).join(",")}</span>
    </div>
  );
}

beforeEach(() => resetPlayerStore());

afterEach(() => {
  resetPlayerStore();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

function install(queueWindow: (offset: number, limit: number) => Promise<QueueWindow>) {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(snapshot(3, "q0")),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        onState(snapshot(3, "q0"));
        return vi.fn();
      }),
      queueWindow: vi.fn(queueWindow),
    },
  } as unknown as typeof window.cuepoint;
  return { push: (state: PlayerSnapshot) => push?.(state) };
}

describe("reading a window", () => {
  it("loads the first page", async () => {
    install(async (offset, limit) => ({
      offset,
      total: 3,
      items: [item(0), item(1), item(2)].slice(offset, offset + limit),
    }));

    render(<Probe />);

    await waitFor(() =>
      expect(screen.getByTestId("titles")).toHaveTextContent("Track 0,Track 1,Track 2"),
    );
    expect(screen.getByTestId("total")).toHaveTextContent("3");
  });

  it("re-reads when the queue changes shape", async () => {
    // The panel holds a window, so it cannot notice a change by diffing what it
    // has; it watches the queue's length, current track and ordering.
    const calls: number[] = [];
    const harness = install(async (offset, limit) => {
      calls.push(offset);
      return { offset, total: calls.length === 1 ? 3 : 4, items: [item(0)].slice(0, limit) };
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("3"));

    harness.push(snapshot(4, "q0"));

    await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("4"));
  });

  it("does not re-read when only the position moved", async () => {
    let reads = 0;
    const harness = install(async (offset) => {
      reads += 1;
      return { offset, total: 3, items: [item(0)] };
    });
    render(<Probe />);
    await waitFor(() => expect(reads).toBe(1));

    const moved = snapshot(3, "q0");
    moved.playback.positionSeconds = 99;
    harness.push(moved);
    harness.push(moved);

    expect(reads).toBe(1);
  });

  it("ignores an older answer that arrives after a newer one", async () => {
    // Otherwise scrolling quickly leaves the panel showing a stale page.
    let call = 0;
    const harness = install(async (offset) => {
      call += 1;
      const mine = call;
      // The first request is slow; the second overtakes it.
      await new Promise((resolve) => setTimeout(resolve, mine === 1 ? 60 : 0));
      return {
        offset,
        total: 3,
        items: [{ ...item(0), title: mine === 1 ? "STALE" : "FRESH" }],
      };
    });

    render(<Probe />);
    harness.push(snapshot(3, "q1")); // provoke a second read

    await waitFor(() => expect(screen.getByTestId("titles")).toHaveTextContent("FRESH"));
    // Wait past the slow answer's arrival and confirm it did not win.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(screen.getByTestId("titles")).toHaveTextContent("FRESH");
  });

  it("answers empty when the bridge cannot be reached", async () => {
    install(async () => {
      throw new Error("no player");
    });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("0"));
    expect(screen.getByTestId("titles")).toHaveTextContent("");
  });

  it("answers empty with no bridge at all", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("total")).toHaveTextContent("0"));
  });
});
