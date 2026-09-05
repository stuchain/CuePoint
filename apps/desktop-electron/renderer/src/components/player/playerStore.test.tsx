import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { selectCurrentItem, sameItem, selectPosition } from "./playerFormat";
import { resetPlayerStore, usePlayerValue } from "./playerStore";

/**
 * One subscription, read through selectors (PLAYER-06).
 *
 * This is the step's stated performance risk, made testable. The position moves
 * several times a second for the length of every track; anything that repaints
 * at that rate — the status strip, a table of virtualised rows — is a problem
 * that only shows up on a real library, on a slow machine, long after the code
 * was written.
 *
 * So the rules are: one bridge subscription however many components read state,
 * and a selector that returns the same value leaves its component alone.
 */

function snapshot(position: number, title = "Strobe"): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/a.flac",
      playing: true,
      paused: false,
      positionSeconds: position,
      durationSeconds: 600,
      volume: 100,
      muted: false,
    },
    queue: {
      length: 1,
      currentId: "q1",
      currentIndex: 0,
      currentItem: {
        id: "q1",
        trackId: 1,
        filePath: "/music/a.flac",
        title,
        artist: "deadmau5",
        key: "8A",
        bpm: 128,
        durationSeconds: 600,
        status: "playing",
      },
      shuffle: false,
      repeat: "off",
    },
  };
}

function installBridge() {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeState = vi.fn((onState: (state: PlayerSnapshot) => void) => {
    push = onState;
    return unsubscribe;
  });
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(snapshot(0)),
      subscribeState,
    },
  } as unknown as typeof window.cuepoint;
  return { push: (state: PlayerSnapshot) => push?.(state), subscribeState, unsubscribe };
}

/** Renders a selector's value and counts how often it re-rendered. */
function Probe<T>({
  select,
  isEqual,
  onRender,
  label,
}: {
  select: (state: PlayerSnapshot | null) => T;
  isEqual?: (a: T, b: T) => boolean;
  onRender: () => void;
  label: string;
}) {
  const value = usePlayerValue(select, isEqual);
  onRender();
  return <div data-testid={label}>{JSON.stringify(value ?? null)}</div>;
}

beforeEach(() => resetPlayerStore());

afterEach(() => {
  resetPlayerStore();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("one subscription", () => {
  it("subscribes to the bridge once for many readers", async () => {
    // Three components reading state is still one IPC subscription.
    const bridge = installBridge();
    const noop = () => undefined;

    render(
      <>
        <Probe label="a" select={selectPosition} onRender={noop} />
        <Probe label="b" select={selectPosition} onRender={noop} />
        <Probe label="c" select={selectCurrentItem} isEqual={sameItem} onRender={noop} />
      </>,
    );

    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());
    expect(bridge.subscribeState).toHaveBeenCalledTimes(1);
  });

  it("lets go of the bridge when the last reader unmounts", async () => {
    const bridge = installBridge();
    const view = render(<Probe label="a" select={selectPosition} onRender={() => undefined} />);
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());

    view.unmount();

    expect(bridge.unsubscribe).toHaveBeenCalled();
  });

  it("keeps the subscription while any reader remains", async () => {
    const bridge = installBridge();
    const view = render(
      <>
        <Probe label="a" select={selectPosition} onRender={() => undefined} />
        <Probe label="b" select={selectPosition} onRender={() => undefined} />
      </>,
    );
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());

    view.rerender(<Probe label="a" select={selectPosition} onRender={() => undefined} />);

    expect(bridge.unsubscribe).not.toHaveBeenCalled();
  });
});

describe("selectors isolate re-renders", () => {
  it("delivers a changed value to the component that selected it", async () => {
    const bridge = installBridge();
    render(<Probe label="pos" select={selectPosition} onRender={() => undefined} />);
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());

    bridge.push(snapshot(42));

    await waitFor(() => expect(screen.getByTestId("pos")).toHaveTextContent("42"));
  });

  it("does not re-render a component whose slice did not change", async () => {
    // The whole point: the track has not changed, so a component showing the
    // track must not repaint because the position moved.
    const bridge = installBridge();
    const trackRenders = vi.fn();
    render(
      <Probe
        label="track"
        select={selectCurrentItem}
        isEqual={sameItem}
        onRender={trackRenders}
      />,
    );
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());
    const before = trackRenders.mock.calls.length;

    bridge.push(snapshot(1));
    bridge.push(snapshot(2));
    bridge.push(snapshot(3));

    expect(trackRenders.mock.calls.length).toBe(before);
  });

  it("re-renders when the slice really does change", async () => {
    const bridge = installBridge();
    const trackRenders = vi.fn();
    render(
      <Probe
        label="track"
        select={selectCurrentItem}
        isEqual={sameItem}
        onRender={trackRenders}
      />,
    );
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());
    const before = trackRenders.mock.calls.length;

    const next = snapshot(10, "Ghosts n Stuff");
    next.queue.currentItem!.id = "q2";
    next.queue.currentId = "q2";
    bridge.push(next);

    await waitFor(() => expect(trackRenders.mock.calls.length).toBeGreaterThan(before));
  });

  it("gives a late reader the state that already arrived", async () => {
    // A component mounted after the first push must not sit blank until the
    // next one — which, if playback is paused, may never come.
    const bridge = installBridge();
    render(<Probe label="first" select={selectPosition} onRender={() => undefined} />);
    await waitFor(() => expect(bridge.subscribeState).toHaveBeenCalled());
    bridge.push(snapshot(7));

    render(<Probe label="late" select={selectPosition} onRender={() => undefined} />);

    await waitFor(() => expect(screen.getByTestId("late")).toHaveTextContent("7"));
  });
});

describe("without a bridge", () => {
  it("answers null rather than throwing", () => {
    render(<Probe label="a" select={selectPosition} onRender={() => undefined} />);
    expect(screen.getByTestId("a")).toHaveTextContent("null");
  });

  it("unmounts cleanly when there was nothing to unsubscribe from", () => {
    const view = render(<Probe label="a" select={selectPosition} onRender={() => undefined} />);
    expect(() => view.unmount()).not.toThrow();
  });
});
