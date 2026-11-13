import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../Toast";
import { resetWaveformDetailForTests } from "../waveform/waveformDetailSetting";
import { resetPlayedTracksForTests } from "./playedTracks";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPlayerStore } from "./playerStore";
import { resetQueuePanelStateForTests } from "./queuePanelState";
import { PlayerSlot } from "./PlayerSlot";

/**
 * The bar waits for the first play and then stays (DEC-053, restored by I6 over area 83).
 */

const ITEM: QueueItem = {
  id: "q1",
  trackId: 1,
  filePath: "/music/strobe.flac",
  title: "Strobe",
  artist: "deadmau5",
  key: "8A",
  bpm: 128,
  durationSeconds: 600,
  status: "playing",
};

function snapshot(kind: "idle" | "playing" | "queued"): PlayerSnapshot {
  const items = kind === "idle" ? [] : [ITEM];
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: kind === "playing" ? ITEM.filePath : null,
      playing: kind === "playing",
      paused: false,
      positionSeconds: kind === "playing" ? 30 : null,
      durationSeconds: kind === "playing" ? 600 : null,
      volume: 80,
      muted: false,
    },
    queue: {
      length: items.length,
      currentId: items[0]?.id ?? null,
      currentIndex: 0,
      currentItem: items[0] ?? null,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  } as PlayerSnapshot;
}

function installBridge(initial: PlayerSnapshot) {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  const player = {
    getState: vi.fn().mockResolvedValue(initial),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      push = onState;
      onState(initial);
      return vi.fn();
    }),
    next: vi.fn(),
    previous: vi.fn(),
    toggle: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setShuffle: vi.fn(),
    setRepeat: vi.fn(),
  };
  window.cuepoint = { player } as unknown as typeof window.cuepoint;
  return { player, push: (state: PlayerSnapshot) => act(() => push?.(state)) };
}

function Slot() {
  return (
    <ToastProvider>
      <PlayerSlot />
    </ToastProvider>
  );
}

beforeEach(() => {
  resetPlayerStore();
  resetWaveformDetailForTests();
  resetQueuePanelStateForTests();
  resetPlayedTracksForTests();
});

afterEach(() => {
  resetPlayerStore();
  resetQueuePanelStateForTests();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("PlayerSlot before and after the first play", () => {
  it("draws no bar and no strip before anything has played, but keeps the announcer", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    await waitFor(() => expect(harness.player.subscribeState).toHaveBeenCalled());

    expect(container.querySelector(".cp-player-bar")).toBeNull();
    expect(container.querySelector(".cp-player-slot")).toBeNull();
    expect(container.querySelector('[data-testid="waveform-detail-strip"]')).toBeNull();
    expect(screen.queryByText("Nothing playing")).toBeNull();
    expect(container.querySelector(".cp-player")).toBeNull();
    expect(container.querySelector('[role="status"].cp-player-announcer')).not.toBeNull();
  });

  it("appears when a file is loaded", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    harness.push(snapshot("playing"));

    await waitFor(() => expect(container.querySelector(".cp-player-bar")).not.toBeNull());
    expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument();
  });

  it("appears when only the queue has an item", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    harness.push(snapshot("queued"));

    await waitFor(() => expect(container.querySelector(".cp-player-bar")).not.toBeNull());
  });

  it("stays after the queue empties again", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    harness.push(snapshot("playing"));
    await waitFor(() => expect(container.querySelector(".cp-player-bar")).not.toBeNull());

    harness.push(snapshot("idle"));

    expect(container.querySelector(".cp-player-bar")).not.toBeNull();
    expect(screen.getByText("Nothing playing")).toBeInTheDocument();
  });

  it("announces the first track even though the bar was hidden until then", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    harness.push(snapshot("playing"));

    await waitFor(() =>
      expect(container.querySelector(".cp-player-announcer")).toHaveTextContent(/Playing: Strobe/),
    );
    expect(container.querySelectorAll(".cp-player-announcer")).toHaveLength(1);
  });

  it("keeps the very same announcer node across the first play", async () => {
    const harness = installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    const before = container.querySelector(".cp-player-announcer");
    expect(before).not.toBeNull();
    harness.push(snapshot("playing"));

    await waitFor(() => expect(container.querySelector(".cp-player-bar")).not.toBeNull());
    expect(container.querySelector(".cp-player-announcer")).toBe(before);
    await waitFor(() => expect(before).toHaveTextContent(/Playing: Strobe/));
  });

  it("keeps the bar through a renderer reload while the session lasts", async () => {
    const harness = installBridge(snapshot("playing"));
    const first = render(<Slot />);
    await waitFor(() => expect(first.container.querySelector(".cp-player-bar")).not.toBeNull());
    first.unmount();
    harness.push(snapshot("idle"));
    // A reload loses module state (simulated by resetting the store's copy) but sessionStorage survives it.
    const kept = sessionStorage.getItem("cuepoint.player.hasPlayed");
    expect(kept).toBe("1");
    resetPlayerStore();
    sessionStorage.setItem("cuepoint.player.hasPlayed", kept as string);

    installBridge(snapshot("idle"));
    const again = render(<Slot />);
    await waitFor(() => expect(again.container.querySelector(".cp-player-bar")).not.toBeNull());
  });

  it("starts without the bar again once the session is reset (quitting)", async () => {
    installBridge(snapshot("idle"));
    const { container } = render(<Slot />);
    await waitFor(() => expect(window.cuepoint?.player?.getState).toHaveBeenCalled());
    expect(container.querySelector(".cp-player-bar")).toBeNull();
  });
});
