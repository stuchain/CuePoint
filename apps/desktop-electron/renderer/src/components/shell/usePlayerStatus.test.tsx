import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerBridge, PlayerSnapshot } from "../../api/cuepointBridge.types";
import { StatusStrip } from "./StatusStrip";
import { playerStatusMessage } from "./usePlayerStatus";

/**
 * The player's line in the status strip (PLAYER-03).
 *
 * The rule under test is mostly about *silence*: the strip is always on screen,
 * so anything it says permanently is noise. It speaks when the player was in
 * use and broke, and not otherwise.
 */

function snapshot(overrides: Partial<PlayerSnapshot["status"]> = {}): PlayerSnapshot {
  return {
    status: {
      available: true,
      running: false,
      reconnecting: false,
      restartAttempts: 0,
      ...overrides,
    },
    playback: {
      filePath: null,
      playing: false,
      paused: false,
      positionSeconds: null,
      durationSeconds: null,
      volume: 100,
      muted: false,
    },
    queue: {
      items: [],
      playOrder: [],
      currentId: null,
      currentIndex: -1,
      shuffle: false,
      repeat: "off",
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("what the strip says about the player", () => {
  it("says nothing when there is no bridge at all", () => {
    // The renderer in a browser tab, or a shell older than the player.
    expect(playerStatusMessage(null)).toBeNull();
  });

  it("says nothing when the player is healthy and idle", () => {
    // Nobody needs telling that an unused player is fine.
    expect(playerStatusMessage(snapshot())).toBeNull();
  });

  it("says nothing while a track is playing normally", () => {
    expect(playerStatusMessage(snapshot({ running: true }))).toBeNull();
  });

  it("says nothing when no player is installed", () => {
    // A Linux build bundles no mpv (PLAYER-01). Nagging on every screen about
    // a feature the user has not asked for is worse than silence; the failure
    // is reported when they actually try to play something.
    expect(
      playerStatusMessage(snapshot({ available: false, error: "No audio player found." })),
    ).toBeNull();
  });

  it("reports a reconnecting player", () => {
    expect(playerStatusMessage(snapshot({ reconnecting: true }))).toBe(
      "Audio player reconnecting",
    );
  });

  it("reports a player that gave up", () => {
    expect(
      playerStatusMessage(snapshot({ available: true, error: "stopped responding" })),
    ).toBe("Audio player unavailable");
  });

  it("does not describe a dead player as an engine problem", () => {
    // They mean different things: the engine being down stops everything,
    // while a dead player leaves the whole library usable.
    const message = playerStatusMessage(snapshot({ available: true, error: "boom" }));
    expect(message).not.toMatch(/engine/i);
  });
});

describe("the strip with a player bridge", () => {
  function installBridge(initial: PlayerSnapshot) {
    let push: ((snapshot: PlayerSnapshot) => void) | null = null;
    const unsubscribe = vi.fn();
    // Only the two bridge methods the strip uses; the rest of the surface is
    // PLAYER-06's to exercise.
    const player = {
      getState: vi.fn().mockResolvedValue(initial),
      subscribeState: (onState: (s: PlayerSnapshot) => void) => {
        push = onState;
        onState(initial);
        return unsubscribe;
      },
    } as unknown as PlayerBridge;
    window.cuepoint = {
      getEngineStatus: vi.fn().mockResolvedValue({ connected: true, version: "1.0.0" }),
      listJobs: vi.fn().mockResolvedValue({ jobs: [] }),
      player,
    } as unknown as typeof window.cuepoint;
    return { push: (s: PlayerSnapshot) => push?.(s), unsubscribe };
  }

  it("stays quiet for a healthy player", async () => {
    installBridge(snapshot());
    render(<StatusStrip />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.queryByText(/audio player/i)).not.toBeInTheDocument();
  });

  it("shows the player's trouble when it is pushed", async () => {
    const { push } = installBridge(snapshot());
    render(<StatusStrip />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    push(snapshot({ reconnecting: true }));

    await waitFor(() =>
      expect(screen.getByText("Audio player reconnecting")).toBeInTheDocument(),
    );
  });

  it("goes quiet again once the player recovers", async () => {
    const { push } = installBridge(snapshot({ reconnecting: true }));
    render(<StatusStrip />);
    await waitFor(() =>
      expect(screen.getByText("Audio player reconnecting")).toBeInTheDocument(),
    );

    push(snapshot({ running: true }));

    await waitFor(() =>
      expect(screen.queryByText("Audio player reconnecting")).not.toBeInTheDocument(),
    );
  });

  it("unsubscribes when the strip goes away", async () => {
    const { unsubscribe } = installBridge(snapshot());
    const view = render(<StatusStrip />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    view.unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });

  it("renders without a player bridge at all", async () => {
    window.cuepoint = {
      getEngineStatus: vi.fn().mockResolvedValue({ connected: true }),
      listJobs: vi.fn().mockResolvedValue({ jobs: [] }),
    } as unknown as typeof window.cuepoint;
    render(<StatusStrip />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.queryByText(/audio player/i)).not.toBeInTheDocument();
  });
});
