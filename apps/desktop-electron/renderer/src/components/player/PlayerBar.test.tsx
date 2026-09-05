import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { PlayerBar } from "./PlayerBar";
import { PlayerSlot } from "./PlayerSlot";
import { PLAYER_REPEAT_STORAGE_KEY, PLAYER_SHUFFLE_STORAGE_KEY } from "./playerOrderState";
import { resetPlayerStore } from "./playerStore";

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
      items,
      playOrder: items.map((entry) => entry.id),
      currentId: overrides.currentId === undefined ? items[0]?.id ?? null : overrides.currentId,
      currentIndex: 0,
      shuffle: overrides.shuffle ?? false,
      repeat: overrides.repeat ?? "off",
    },
  };
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
});

afterEach(() => {
  resetPlayerStore();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("when the bar exists (DEC-053)", () => {
  it("renders nothing at all before the first play", async () => {
    // DEC-025 held this region at zero height with a stated reason: the app
    // never ships controls that do nothing.
    installBridge(
      snapshot({ playback: { filePath: null }, items: [], currentId: null }),
    );
    const { container } = render(<PlayerSlot />);

    await waitFor(() => expect(window.cuepoint?.player?.getState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("appears once something is playing", async () => {
    const harness = installBridge(
      snapshot({ playback: { filePath: null }, items: [], currentId: null }),
    );
    render(<PlayerSlot />);

    harness.push(snapshot());

    await waitFor(() => expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument());
  });

  it("stays once the queue has finished", async () => {
    // Ending a queue must not make the app jump as a control the user was
    // just using disappears from under the pointer.
    const harness = installBridge(snapshot());
    render(<PlayerSlot />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument());

    harness.push(
      snapshot({ playback: { playing: false, positionSeconds: null }, currentId: null }),
    );

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument(),
    );
  });
});

describe("what it shows", () => {
  it("names the track that is playing", async () => {
    installBridge(snapshot());
    render(<PlayerBar />);
    expect(await screen.findByText("Strobe")).toBeInTheDocument();
    expect(screen.getByText("deadmau5 · 8A · 128.0 BPM")).toBeInTheDocument();
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
    expect(screen.getAllByText("–:––").length).toBeGreaterThan(0);
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
    harness.push(snapshot({ playback: { positionSeconds: 42 } }));

    await waitFor(() => expect((slider as HTMLInputElement).value).toBe("42"));
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
