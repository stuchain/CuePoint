import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import playerBarCss from "./PlayerBar.css?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { PlayerBar } from "./PlayerBar";
import { PlayerSlot } from "./PlayerSlot";
import { ToastProvider } from "../Toast";
import { PLAYER_REPEAT_STORAGE_KEY, PLAYER_SHUFFLE_STORAGE_KEY } from "./playerOrderState";
import { usePlayedTracks, resetPlayedTracksForTests } from "./playedTracks";
import { resetPlayerStore } from "./playerStore";
import { resetQueuePanelStateForTests, useQueueOpen } from "./queuePanelState";
import { closeWheel, getWheelState } from "../wheel/wheelStore";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { WAVEFORM_DETAIL_STORAGE_KEY, resetWaveformDetailForTests } from "../waveform/waveformDetailSetting";

/**
 * The player bar (PLAYER-06, DEC-052, DEC-053).
 *
 * The rule these tests exist to hold is that the bar shows what *main* said,
 * not what the click implied (DEC-050). A transport that flips its own icon and
 * then finds the command failed is worse than one that waits: it tells the user
 * something untrue about a process they cannot see.
 *
 * The other rule is the seek: a position arriving mid-drag must not pull the
 * handle away from the pointer, and letting go must produce exactly one seek.
 */

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
    filePath: "/music/strobe.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function snapshot(overrides: {
  playback?: Partial<PlayerSnapshot["playback"]>;
  items?: QueueItem[];
  currentId?: string | null;
  shuffle?: boolean;
  repeat?: PlayerSnapshot["queue"]["repeat"];
} = {}): PlayerSnapshot {
  const items = overrides.items ?? [item()];
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/strobe.flac",
      playing: true,
      paused: false,
      positionSeconds: 30,
      durationSeconds: 600,
      volume: 80,
      muted: false,
      ...overrides.playback,
    },
    queue: {
      length: items.length,
      currentId: overrides.currentId === undefined ? items[0]?.id ?? null : overrides.currentId,
      currentIndex: 0,
      currentItem:
        overrides.currentId === null ? null : (items[0] ?? null),
      shuffle: overrides.shuffle ?? false,
      repeat: overrides.repeat ?? "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

/** The artist, key and tempo line under the title. */
function metaLine(): HTMLElement {
  const line = document.querySelector<HTMLElement>(".cp-player-bar__meta");
  if (!line) throw new Error("the track line is not drawn");
  return line;
}

interface Harness {
  push: (state: PlayerSnapshot) => void;
  player: Record<string, ReturnType<typeof vi.fn>>;
}

function installBridge(initial: PlayerSnapshot | null = null): Harness {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  const player = {
    getState: vi.fn().mockResolvedValue(initial ?? snapshot()),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      push = onState;
      if (initial) onState(initial);
      return vi.fn();
    }),
    next: vi.fn().mockResolvedValue(undefined),
    previous: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    setMuted: vi.fn().mockResolvedValue(undefined),
    setShuffle: vi.fn().mockResolvedValue(undefined),
    setRepeat: vi.fn().mockResolvedValue(undefined),
  } as unknown as Record<string, ReturnType<typeof vi.fn>>;

  window.cuepoint = {
    getEngineStatus: vi.fn().mockResolvedValue({ connected: true }),
    listJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    player,
  } as unknown as typeof window.cuepoint;

  return { push: (state) => push?.(state), player };
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
  resetWaveformDetailForTests();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

/** The slot reports player notices (PLAYER-10), so it needs the toast stack. */
function Slot() {
  return (
    <ToastProvider>
      <PlayerSlot />
    </ToastProvider>
  );
}

describe("when the bar exists (DEC-053)", () => {
  it("is there before the first play, saying Nothing playing with the transport greyed (area 83)", async () => {
    installBridge(
      snapshot({ playback: { filePath: null }, items: [], currentId: null }),
    );
    const { container } = render(<Slot />);

    await waitFor(() => expect(window.cuepoint?.player?.getState).toHaveBeenCalled());
    expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument();
    expect(container.querySelector(".cp-player-bar")).not.toBeNull();
    expect(screen.getByText("Nothing playing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^(Play|Pause)$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next track" })).toBeDisabled();
  });

  it("appears once something is playing", async () => {
    const harness = installBridge(
      snapshot({ playback: { filePath: null }, items: [], currentId: null }),
    );
    render(<Slot />);

    harness.push(snapshot());

    await waitFor(() => expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument());
  });

  it("stays once the queue has finished", async () => {
    // Ending a queue must not make the app jump as a control the user was
    // just using disappears from under the pointer.
    const harness = installBridge(snapshot());
    render(<Slot />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument());

    harness.push(
      snapshot({ playback: { playing: false, positionSeconds: null }, currentId: null }),
    );

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument(),
    );
  });
});

describe("where the queue opens (R2-1, DEC-264)", () => {
  /** Reads the store the bar's toggle writes, from outside the slot. */
  function OpenProbe() {
    return <span data-testid="queue-open">{String(useQueueOpen())}</span>;
  }

  it("opens in the right column, not in the slot", async () => {
    installBridge(snapshot());
    const { container } = render(
      <>
        <Slot />
        <OpenProbe />
      </>,
    );
    await screen.findByRole("region", { name: "Player" });

    fireEvent.click(screen.getByRole("button", { name: /Show the queue/ }));

    expect(screen.getByTestId("queue-open")).toHaveTextContent("true");
    // The bar knows it is open, but the slot draws no panel of its own.
    expect(screen.getByRole("button", { name: "Hide the queue" })).toBeInTheDocument();
    expect(container.querySelector(".cp-player-slot__queue")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Playback queue" })).toBeNull();
  });
});

describe("what it shows", () => {
  it("names the track that is playing", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    expect(await screen.findByText("Strobe")).toBeInTheDocument();
    expect(metaLine()).toHaveTextContent("deadmau5 · 8A · 128 BPM");
  });

  it("shows elapsed and total time", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    expect(await screen.findByText("0:30")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("offers the transport controls", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.getByRole("button", { name: "Previous track" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next track" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("says so plainly when nothing is playing", async () => {
    installBridge(snapshot({ currentId: null }));
    render(<PlayerBar />);
    expect(await screen.findByText("Nothing playing")).toBeInTheDocument();
  });

  it("shows a dash for a duration that has not arrived", async () => {
    installBridge(snapshot({ playback: { durationSeconds: null, positionSeconds: null } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("transport", () => {
  it("asks main to toggle rather than deciding itself (DEC-050)", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(harness.player.toggle).toHaveBeenCalledTimes(1);
  });

  it("does not flip the button until main says so", async () => {
    // A bar that flipped optimistically would show "paused" over a player that
    // never paused, if the command failed.
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
  });

  it("shows Play once main reports it paused", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    harness.push(snapshot({ playback: { paused: true, playing: false } }));

    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("skips forward and back", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Next track" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous track" }));

    expect(harness.player.next).toHaveBeenCalledTimes(1);
    expect(harness.player.previous).toHaveBeenCalledTimes(1);
  });
});

describe("seeking", () => {
  it("commits exactly once, on release", async () => {
    // Not one seek per pixel: over a network drive that is a stutter machine.
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(slider, { target: { value: "100" } });
    fireEvent.change(slider, { target: { value: "200" } });
    fireEvent.change(slider, { target: { value: "300" } });
    expect(harness.player.seek).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);

    expect(harness.player.seek).toHaveBeenCalledTimes(1);
    expect(harness.player.seek).toHaveBeenCalledWith(300);
  });

  it("previews the dragged time while dragging", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.change(screen.getByRole("slider", { name: "Seek" }), {
      target: { value: "125" },
    });

    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("does not let an incoming position yank the handle mid-drag", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(slider, { target: { value: "400" } });
    harness.push(snapshot({ playback: { positionSeconds: 31 } }));

    expect((slider as HTMLInputElement).value).toBe("400");
  });

  it("follows the player again after the drag ends", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(slider, { target: { value: "400" } });
    fireEvent.pointerUp(slider);
    harness.push(snapshot({ playback: { positionSeconds: 400.2 } }));

    await waitFor(() => expect((slider as HTMLInputElement).value).toBe("400.2"));
  });

  it("keeps the clicked spot after release until the store reports it", async () => {
    const harness = installBridge(snapshot({ playback: { positionSeconds: 10 } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "120" } });
    fireEvent.pointerUp(slider);
    expect(slider.value).toBe("120");
    harness.push(snapshot({ playback: { positionSeconds: 10.1 } }));
    expect(slider.value).toBe("120");
    harness.push(snapshot({ playback: { positionSeconds: 120.2 } }));
    await waitFor(() => expect(slider.value).toBe("120.2"));
    harness.push(snapshot({ playback: { positionSeconds: 130 } }));
    await waitFor(() => expect(slider.value).toBe("130"));
  });

  it("lets go of the clicked spot after the fail-safe even if main never reports it", async () => {
    vi.useFakeTimers();
    try {
      const harness = installBridge(snapshot({ playback: { positionSeconds: 10 } }));
      render(<PlayerBar />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "120" } });
      fireEvent.pointerUp(slider);
      harness.push(snapshot({ playback: { positionSeconds: 10.1 } }));
      expect(slider.value).toBe("120");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600);
      });
      expect(slider.value).toBe("10.1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits one seek on pointercancel", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(slider, { target: { value: "200" } });
    fireEvent.pointerCancel(slider);

    expect(harness.player.seek).toHaveBeenCalledTimes(1);
    expect(harness.player.seek).toHaveBeenCalledWith(200);
  });

  it("takes any value, not half seconds", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute("step", "any");
  });

  it("drops the preview when the seek is rejected, well before the fail-safe", async () => {
    vi.useFakeTimers();
    try {
      const harness = installBridge(snapshot({ playback: { positionSeconds: 10 } }));
      let reject: (error: Error) => void = () => undefined;
      harness.player.seek.mockReturnValue(new Promise((_, no) => (reject = no)));
      render(<PlayerBar />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;

      fireEvent.change(slider, { target: { value: "120" } });
      fireEvent.pointerUp(slider);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(slider.value).toBe("120");
      await act(async () => {
        reject(new Error("refused"));
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(slider.value).toBe("10");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an earlier commit's late rejection clear a later preview", async () => {
    const harness = installBridge(snapshot({ playback: { positionSeconds: 10 } }));
    let rejectFirst: (error: Error) => void = () => undefined;
    harness.player.seek
      .mockReturnValueOnce(new Promise((_, no) => (rejectFirst = no)))
      .mockResolvedValue(undefined);
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;

    fireEvent.change(slider, { target: { value: "120" } });
    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: "130" } });
    fireEvent.pointerUp(slider);
    await act(async () => {
      rejectFirst(new Error("refused"));
    });
    expect(slider.value).toBe("130");
  });

  it("steps Shift and Ctrl arrows by five seconds too, never by the browser's 1 %", async () => {
    const harness = installBridge(snapshot({ playback: { positionSeconds: 30 } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    expect(fireEvent.keyDown(slider, { key: "ArrowRight", ctrlKey: true })).toBe(false);
    fireEvent.keyUp(slider, { key: "ArrowRight", ctrlKey: true });
    expect(harness.player.seek).toHaveBeenLastCalledWith(35);
    expect(fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true })).toBe(false);
    fireEvent.keyUp(slider, { key: "ArrowRight", shiftKey: true });
    expect(harness.player.seek).toHaveBeenLastCalledWith(40);
  });

  it("steps the arrow keys by five seconds", async () => {
    const harness = installBridge(snapshot({ playback: { positionSeconds: 30 } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(harness.player.seek).toHaveBeenLastCalledWith(35);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyUp(slider, { key: "ArrowLeft" });
    expect(harness.player.seek).toHaveBeenLastCalledWith(30);
  });

  it("is disabled for a track with no known duration", async () => {
    installBridge(snapshot({ playback: { durationSeconds: null } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.getByRole("slider", { name: "Seek" })).toBeDisabled();
  });

  it("keyboard seeking commits too", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    const slider = screen.getByRole("slider", { name: "Seek" });

    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.keyUp(slider, { key: "ArrowRight" });

    expect(harness.player.seek).toHaveBeenCalledWith(60);
  });
});

describe("volume", () => {
  it("sends the new volume", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "35" },
    });

    expect(harness.player.setVolume).toHaveBeenCalledWith(35);
  });

  it("reflects the volume main reports", async () => {
    installBridge(snapshot({ playback: { volume: 20 } }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect((screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement).value).toBe("20");
  });

  it("mutes and unmutes", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));

    expect(harness.player.setMuted).toHaveBeenCalledWith(true);
  });

  it("shows a muted player as silent without forgetting the level", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    harness.push(snapshot({ playback: { muted: true, volume: 80 } }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument(),
    );
    expect((screen.getByRole("slider", { name: "Volume" }) as HTMLInputElement).value).toBe("0");
  });
});

describe("without a bridge", () => {
  it("renders without throwing when there is no player at all", () => {
    // The renderer in a browser tab, or a shell older than the player.
    expect(() => render(<PlayerBar />)).not.toThrow();
  });

  it("clicking a control is a no-op rather than a crash", () => {
    render(<PlayerBar />);
    // Nothing is playing, so the button offers Play.
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Play" }))).not.toThrow();
  });
});

describe("shuffle and repeat (PLAYER-07, DEC-052)", () => {
  it("offers both controls", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    expect(screen.getByRole("button", { name: "Shuffle off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repeat off" })).toBeInTheDocument();
  });

  it("asks main to shuffle rather than reordering anything itself", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));

    await waitFor(() => expect(harness.player.setShuffle).toHaveBeenCalledWith(true));
  });

  it("shows shuffle as on only once main says so", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));
    expect(screen.getByRole("button", { name: "Shuffle off" })).toBeInTheDocument();

    harness.push(snapshot({ shuffle: true }));

    expect(await screen.findByRole("button", { name: "Shuffle on" })).toBeInTheDocument();
  });

  it("cycles repeat off, all, one", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Repeat off" }));
    await waitFor(() => expect(harness.player.setRepeat).toHaveBeenCalledWith("all"));

    harness.push(snapshot({ repeat: "all" }));
    fireEvent.click(await screen.findByRole("button", { name: "Repeat all" }));
    await waitFor(() => expect(harness.player.setRepeat).toHaveBeenCalledWith("one"));

    harness.push(snapshot({ repeat: "one" }));
    fireEvent.click(await screen.findByRole("button", { name: "Repeat one" }));
    await waitFor(() => expect(harness.player.setRepeat).toHaveBeenCalledWith("off"));
  });

  it("draws repeat-one with its own glyph, not a badge (DEC-052)", async () => {
    installBridge(snapshot({ repeat: "one" }));
    const { container } = render(<PlayerBar />);
    await screen.findByText("Strobe");

    expect(container.querySelector('[data-icon="repeat-one"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="repeat"]')).toBeNull();
  });

  it("remembers shuffle for the next session", async () => {
    const harness = installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));

    await waitFor(() => expect(localStorage.getItem(PLAYER_SHUFFLE_STORAGE_KEY)).toBe("1"));
    expect(harness.player.setShuffle).toHaveBeenCalledWith(true);
  });

  it("remembers repeat for the next session", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Repeat off" }));

    await waitFor(() => expect(localStorage.getItem(PLAYER_REPEAT_STORAGE_KEY)).toBe("all"));
  });

  it("remembers nothing when the command failed", async () => {
    // Persisting first would remember a preference the player never applied.
    const harness = installBridge(snapshot());
    harness.player.setShuffle.mockRejectedValue(new Error("no player"));
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Shuffle off" }));

    await waitFor(() => expect(harness.player.setShuffle).toHaveBeenCalled());
    expect(localStorage.getItem(PLAYER_SHUFFLE_STORAGE_KEY)).toBeNull();
  });

  it("marks an engaged toggle as pressed for assistive technology", async () => {
    installBridge(snapshot({ shuffle: true, repeat: "all" }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    expect(screen.getByRole("button", { name: "Shuffle on" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Repeat all" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("the waveform button (C30)", () => {
  it("is lit while the strip shows, and one click hides it and remembers", async () => {
    installBridge(snapshot());
    const { container } = render(<PlayerBar />);
    await screen.findByText("Strobe");

    const button = screen.getByRole("button", { name: "Hide the zoomed waveform" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveClass("cp-player-bar__button--on");
    expect(container.querySelector('[data-icon="waveform"]')).not.toBeNull();
    // Beside shuffle and repeat, after them.
    const order = container.querySelector(".cp-player-bar__order")!;
    expect(order.lastElementChild?.contains(button)).toBe(true);

    fireEvent.click(button);

    expect(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY)).toBe("off");
    const off = screen.getByRole("button", { name: "Show the zoomed waveform" });
    expect(off).toHaveAttribute("aria-pressed", "false");
    expect(off).not.toHaveClass("cp-player-bar__button--on");
  });

  it("shows it again with one click", async () => {
    localStorage.setItem(WAVEFORM_DETAIL_STORAGE_KEY, "off");
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    fireEvent.click(screen.getByRole("button", { name: "Show the zoomed waveform" }));

    expect(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY)).toBe("on");
    expect(screen.getByRole("button", { name: "Hide the zoomed waveform" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("adds no library note when nothing is playing", async () => {
    installBridge(snapshot({ playback: { filePath: null }, items: [], currentId: null }));
    render(<PlayerBar />);
    await waitFor(() => expect(window.cuepoint?.player?.getState).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Hide the zoomed waveform" })).toHaveAttribute(
      "title",
      "Hide the zoomed waveform",
    );
  });

  it("puts the library note on the Show wording too", async () => {
    localStorage.setItem(WAVEFORM_DETAIL_STORAGE_KEY, "off");
    installBridge(snapshot({ items: [item({ trackId: null })] }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    expect(screen.getByRole("button", { name: "Show the zoomed waveform · only for tracks in your Library" })).toHaveAttribute(
      "title",
      "Show the zoomed waveform · only for tracks in your Library",
    );
  });

  it("says when the playing track is not in the Library, and still toggles", async () => {
    installBridge(snapshot({ items: [item({ trackId: null })] }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    const button = screen.getByRole("button", { name: "Hide the zoomed waveform · only for tracks in your Library" });
    expect(button).toHaveAttribute("title", "Hide the zoomed waveform · only for tracks in your Library");
    fireEvent.click(button);
    expect(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY)).toBe("off");
  });
});

describe("a short window starts without the strip (R2-2, C207)", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("draws no strip while the window is short, whatever was chosen: one threshold for the bar and the strip", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    installBridge(snapshot());
    const { container } = render(<Slot />);
    await screen.findByText("Strobe");
    expect(container.querySelector(".cp-detail-strip")).toBeNull();

    // The toggle is hidden by the stylesheet in a short window; pressing it anyway keeps the choice
    // for when the window is tall, and draws nothing now.
    fireEvent.click(screen.getByRole("button", { name: "Show the zoomed waveform" }));

    expect(container.querySelector(".cp-detail-strip")).toBeNull();
  });
});

describe("every control names itself (BAR-1)", () => {
  const titleOf = (name: string, role: "button" | "slider" = "button") =>
    screen.getByRole(role, { name }).getAttribute("title");

  it("gives each button a title with its shortcut", async () => {
    installBridge(snapshot({ items: [item(), item({ id: "q2" }), item({ id: "q3" })] }));
    render(<PlayerBar onToggleQueue={() => undefined} />);
    await screen.findByText("Strobe");

    expect(titleOf("Previous track")).toBe("Previous track (Ctrl+←)");
    expect(titleOf("Pause")).toBe("Pause (Space)");
    expect(titleOf("Next track")).toBe("Next track (Ctrl+→)");
    expect(titleOf("Shuffle off")).toBe("Shuffle off");
    expect(titleOf("Repeat off")).toBe("Repeat off");
    expect(titleOf("Show the queue (3 tracks)")).toBe("Show the queue (3 tracks)");
    expect(titleOf("Hide the zoomed waveform")).toBe("Hide the zoomed waveform");
    expect(titleOf("Mute")).toBe("Mute");
    expect(titleOf("Volume", "slider")).toBe("Volume (Ctrl+↑/↓)");
  });

  it("follows the state: Play, Shuffle on, Repeat all and one, Hide, Unmute", async () => {
    const harness = installBridge(snapshot());
    const { rerender } = render(<PlayerBar queueOpen onToggleQueue={() => undefined} />);
    await screen.findByText("Strobe");
    expect(titleOf("Hide the queue")).toBe("Hide the queue");

    harness.push(
      snapshot({
        playback: { playing: false, paused: true, muted: true },
        shuffle: true,
        repeat: "all",
      }),
    );
    rerender(<PlayerBar queueOpen onToggleQueue={() => undefined} />);
    expect(await screen.findByRole("button", { name: "Play" })).toHaveAttribute("title", "Play (Space)");
    expect(titleOf("Shuffle on")).toBe("Shuffle on");
    expect(titleOf("Repeat all")).toBe("Repeat all");
    expect(titleOf("Unmute")).toBe("Unmute");

    harness.push(snapshot({ repeat: "one" }));
    expect(await screen.findByRole("button", { name: "Repeat one" })).toHaveAttribute(
      "title",
      "Repeat one",
    );
  });

  it("ends with the Activity button, which the status strip no longer holds (C231)", async () => {
    installBridge(snapshot({ items: [item()] }));
    const { container } = render(<PlayerBar onToggleQueue={() => undefined} />);
    await screen.findByText("Strobe");
    const buttons = container.querySelectorAll(".cp-player-bar__volume button");
    expect(buttons[buttons.length - 1]).toHaveAccessibleName("Activity");
  });

  it("has one wording per control: the tip is the spoken name, shortcut aside (C175)", async () => {
    installBridge(snapshot({ items: [item({ trackId: null }), item({ id: "q2" })], shuffle: true, repeat: "one" }));
    render(<PlayerBar onToggleQueue={() => undefined} />);
    await screen.findByText("Strobe");

    for (const control of screen.getAllByRole("button")) {
      const label = control.getAttribute("aria-label");
      const title = control.getAttribute("title");
      if (!label || !title) continue;
      expect(title.replace(/ \((Space|Ctrl\+[^)]+)\)$/, ""), label).toBe(label);
    }
  });

  it("shows the name on keyboard focus too, through Hint", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    await screen.findByText("Strobe");

    screen.getByRole("button", { name: "Next track" }).focus();

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Next track Ctrl+→");
  });
});

describe("the queue button's count (BAR-2)", () => {
  const badge = (container: HTMLElement) => container.querySelector(".cp-player-bar__count");

  it("shows how many tracks are queued", async () => {
    installBridge(snapshot({ items: [item(), item({ id: "q2" }), item({ id: "q3" })] }));
    const { container } = render(<PlayerBar onToggleQueue={() => undefined} />);
    await screen.findByText("Strobe");

    expect(badge(container)).toHaveTextContent("3");
    expect(badge(container)?.className).toContain("cp-badge");
  });

  it("is hidden at 0", async () => {
    installBridge(snapshot({ items: [], currentId: null }));
    const { container } = render(<PlayerBar onToggleQueue={() => undefined} />);
    await screen.findByText("Nothing playing");

    expect(badge(container)).toBeNull();
  });
});

describe("repeat says its state in words (BAR-3)", () => {
  const label = (container: HTMLElement) => container.querySelector(".cp-player-bar__repeat-label");

  it("says nothing when repeat is off", async () => {
    installBridge(snapshot());
    const { container } = render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(label(container)).toBeNull();
  });

  it("says All, then One, as main reports them", async () => {
    const harness = installBridge(snapshot({ repeat: "all" }));
    const { container } = render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(label(container)).toHaveTextContent("All");

    harness.push(snapshot({ repeat: "one" }));
    await waitFor(() => expect(label(container)).toHaveTextContent("One"));
  });
});

describe("the title and artist open things (BAR-4)", () => {
  it("opens the track in the Library from its title", async () => {
    installBridge(snapshot());
    const onOpenTrack = vi.fn();
    render(<PlayerBar onOpenTrack={onOpenTrack} onOpenArtist={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Strobe" }));

    expect(onOpenTrack).toHaveBeenCalledWith(1);
  });

  it("opens the artist's page from the artist", async () => {
    installBridge(snapshot());
    const onOpenArtist = vi.fn();
    render(<PlayerBar onOpenTrack={() => undefined} onOpenArtist={onOpenArtist} />);

    fireEvent.click(await screen.findByRole("button", { name: "deadmau5" }));

    expect(onOpenArtist).toHaveBeenCalledWith("deadmau5");
  });

  it("keeps plain text for a queue item without a track id", async () => {
    installBridge(snapshot({ items: [item({ trackId: null })] }));
    render(<PlayerBar onOpenTrack={() => undefined} onOpenArtist={() => undefined} />);

    await screen.findByText("Strobe");
    expect(screen.queryByRole("button", { name: "Strobe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "deadmau5" })).toBeNull();
    expect(metaLine()).toHaveTextContent("deadmau5 · 8A");
  });

  it("keeps the track line as it was, key and tempo included", async () => {
    installBridge(snapshot());
    render(<PlayerBar onOpenTrack={() => undefined} onOpenArtist={() => undefined} />);
    await screen.findByRole("button", { name: "Strobe" });

    expect(metaLine()).toHaveTextContent("8A · 128 BPM");
  });
});

describe("the key opens the Camelot wheel (BAR-5, PAGES-10)", () => {
  afterEach(() => {
    closeWheel();
  });

  it("makes the key a button that opens the wheel for the playing track", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    const key = await screen.findByRole("button", { name: "Show 8A on the Camelot wheel" });
    // The key in the facts line is itself the chip that opens the wheel: no ring, no word Wheel,
    // no second button.
    expect(key).toHaveTextContent("8A");
    expect(key).toHaveClass("key-chip", "key-chip--8A");
    expect(key.querySelector("svg")).toBeNull();
    expect(key).toHaveAttribute("title", "Show 8A on the Camelot wheel");
    expect(metaLine()).toHaveTextContent("deadmau5 · 8A · 128 BPM");
    expect(screen.queryByRole("button", { name: "Camelot wheel" })).toBeNull();
    expect(document.querySelector(".cp-player-bar__wheel")).toBeNull();

    fireEvent.click(key);
    expect(getWheelState()).toMatchObject({ open: true, source: "player" });
    fireEvent.click(key);
    expect(getWheelState().open).toBe(false);
  });

  it("leaves the artist's own button alone", async () => {
    installBridge(snapshot());
    const onOpenArtist = vi.fn();
    render(<PlayerBar onOpenTrack={() => undefined} onOpenArtist={onOpenArtist} />);
    fireEvent.click(await screen.findByRole("button", { name: "deadmau5" }));
    expect(onOpenArtist).toHaveBeenCalledWith("deadmau5");
    expect(getWheelState().open).toBe(false);
  });

  it("does not make a button of a key the track does not have", async () => {
    installBridge(snapshot({ items: [item({ key: null })] }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(screen.queryByRole("button", { name: /Camelot wheel/ })).toBeNull();
  });

  it("is not fooled by an artist whose name is the key", async () => {
    installBridge(snapshot({ items: [item({ artist: "8A", key: "8A" })] }));
    render(<PlayerBar />);
    const key = await screen.findByRole("button", { name: "Show 8A on the Camelot wheel" });
    expect(key).toBeInTheDocument();
    expect(metaLine()).toHaveTextContent("8A · 8A · 128 BPM");
    // Only the key is a button: the artist, with no track to open, is text.
    expect(metaLine().querySelectorAll("button")).toHaveLength(1);
    expect(metaLine().querySelector("button")).toBe(key);
  });
});

describe("hover hints on the track line and the seek region (C10)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function hoverTip(el: HTMLElement) {
    fireEvent.pointerEnter(el.closest(".cp-hint") as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    return screen.getByRole("tooltip");
  }

  async function ready(props: Parameters<typeof PlayerBar>[0]) {
    installBridge(snapshot());
    render(<PlayerBar {...props} />);
    await screen.findByText("Strobe");
    vi.useFakeTimers();
  }

  it("shows the title's words on hover", async () => {
    await ready({ onOpenTrack: () => undefined, onOpenArtist: () => undefined });
    const link = screen.getByRole("button", { name: "Strobe" });
    expect(await hoverTip(link)).toHaveTextContent("Show “Strobe” in the Library");
  });

  it("shows the artist's words on hover", async () => {
    await ready({ onOpenTrack: () => undefined, onOpenArtist: () => undefined });
    const link = screen.getByRole("button", { name: "deadmau5" });
    expect(await hoverTip(link)).toHaveTextContent("Show deadmau5 in Discover");
  });

  it("leaves no native title over the track line or the seek region", async () => {
    await ready({ onOpenTrack: () => undefined, onOpenArtist: () => undefined });
    expect(metaLine()).not.toHaveAttribute("title");
    expect(document.querySelector(".cp-player-bar__seek")).not.toHaveAttribute("title");
  });

  it("keeps the track line title off the plain-text line too", async () => {
    installBridge(snapshot({ items: [item({ trackId: null })] }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    expect(metaLine()).not.toHaveAttribute("title");
  });
});

describe("the bar's CSS (C7, C9)", () => {
  const rule = (selector: string) => {
    const at = playerBarCss.indexOf(`${selector} {`);
    return at < 0 ? "" : playerBarCss.slice(at, playerBarCss.indexOf("}", at));
  };

  it("gives the track its room first, up to its text", () => {
    const track = rule(".cp-player-bar__track");
    expect(track).toMatch(/flex:\s*1 1 auto;/);
    expect(track).toMatch(/max-inline-size:\s*max-content;/);
  });

  it("is not selectable", () => {
    expect(rule(".cp-player-bar")).toMatch(/user-select:\s*none;/);
  });

  it("has no separate Wheel button to make room for", () => {
    // Not a container: that would make the bar the box its fixed hints are placed in.
    expect(rule(".cp-player-bar")).not.toMatch(/container-type/);
    expect(playerBarCss).not.toContain("cp-wheel-button__word");
  });
});

describe("the played set (R4-6)", () => {
  it("marks a track played when it becomes the current one", async () => {
    const harness = installBridge(
      snapshot({ playback: { filePath: null }, items: [], currentId: null }),
    );
    const { result } = renderHook(() => usePlayedTracks());
    render(<Slot />);

    expect(result.current.has(1)).toBe(false);
    harness.push(snapshot({ items: [item({ trackId: 1 })] }));
    await waitFor(() => expect(result.current.has(1)).toBe(true));

    harness.push(snapshot({ items: [item({ id: "q2", trackId: 2 })] }));
    await waitFor(() => expect(result.current.has(2)).toBe(true));
    expect(result.current.has(1)).toBe(true);
  });
});
