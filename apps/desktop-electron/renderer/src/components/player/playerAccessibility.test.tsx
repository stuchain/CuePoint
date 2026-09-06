import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { KEYBOARD_SHORTCUTS } from "../../api/keyboardShortcuts";
import { ShortcutsDialog } from "../ShortcutsDialog";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { PlayerBar } from "./PlayerBar";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPlayerStore } from "./playerStore";

/**
 * The player, audited rather than assumed (PLAYER-12).
 *
 * PLAYER-06 through PLAYER-08 built these controls and tested what they *do*.
 * This file tests what they *are*, which is the thing that quietly rots: a
 * button that becomes a div, a slider that loses its value, a toggle whose
 * pressed state stops being announced. None of those change a single pixel, and
 * none of them would fail any other test in this phase — they would only fail a
 * user who cannot see the bar.
 *
 * Every assertion here is a claim PLAYER-12's scope makes in words.
 */

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
    filePath: "/music/a.flac",
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
  paused?: boolean;
  shuffle?: boolean;
  repeat?: "off" | "one" | "all";
  muted?: boolean;
  volume?: number;
  position?: number;
} = {}): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/a.flac",
      playing: !(overrides.paused ?? false),
      paused: overrides.paused ?? false,
      positionSeconds: overrides.position ?? 90,
      durationSeconds: 600,
      volume: overrides.volume ?? 80,
      muted: overrides.muted ?? false,
    },
    queue: {
      length: 3,
      currentId: "q1",
      currentIndex: 0,
      currentItem: item(),
      shuffle: overrides.shuffle ?? false,
      repeat: overrides.repeat ?? "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

function install(initial: PlayerSnapshot) {
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(initial),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        onState(initial);
        return vi.fn();
      }),
      toggle: vi.fn().mockResolvedValue(undefined),
      next: vi.fn().mockResolvedValue(undefined),
      previous: vi.fn().mockResolvedValue(undefined),
      seek: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn().mockResolvedValue(undefined),
      setMuted: vi.fn().mockResolvedValue(undefined),
      setShuffle: vi.fn().mockResolvedValue(undefined),
      setRepeat: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof window.cuepoint;
}

function renderBar(state: PlayerSnapshot = snapshot()) {
  install(state);
  return render(
    <ScaleProvider>
      <PlayerBar />
    </ScaleProvider>,
  );
}

beforeEach(() => resetPlayerStore());

afterEach(() => {
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the transport is made of real controls", () => {
  it("is a labelled region, so it can be reached and skipped", async () => {
    renderBar();

    await waitFor(() => expect(screen.getByRole("region", { name: "Player" })).toBeInTheDocument());
  });

  it("gives every control a name that says what it does", async () => {
    renderBar();

    for (const name of ["Previous track", "Next track", "Pause", "Seek", "Volume", "Mute"]) {
      await waitFor(() =>
        expect(screen.getByRole(/Seek|Volume/.test(name) ? "slider" : "button", { name })).toBeEnabled(),
      );
    }
  });

  it("names play and pause for what pressing it will do", async () => {
    const { unmount } = renderBar(snapshot({ paused: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument());
    unmount();
    resetPlayerStore();

    renderBar(snapshot());
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
  });
});

describe("toggles announce their state", () => {
  it("says whether shuffle is on", async () => {
    const { unmount } = renderBar(snapshot({ shuffle: false }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shuffle off" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    unmount();
    resetPlayerStore();

    renderBar(snapshot({ shuffle: true }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shuffle on" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("says which repeat mode is on, not merely that one is", async () => {
    // Three states on one button. `aria-pressed` alone cannot tell "all" from
    // "one", so the name carries the mode.
    for (const [repeat, label] of [
      ["off", "Repeat off"],
      ["all", "Repeat all"],
      ["one", "Repeat one"],
    ] as const) {
      const { unmount } = renderBar(snapshot({ repeat }));
      await waitFor(() => expect(screen.getByRole("button", { name: label })).toBeInTheDocument());
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        String(repeat !== "off"),
      );
      unmount();
      resetPlayerStore();
    }
  });

  it("says whether the sound is muted", async () => {
    renderBar(snapshot({ muted: true }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});

describe("the sliders carry values a screen reader can read", () => {
  it("reads the position as a time, not as a number of seconds", async () => {
    // `aria-valuenow` on a seek bar is a raw count; on its own a screen reader
    // says "90", which tells the user nothing about where they are.
    renderBar(snapshot({ position: 90 }));

    const seek = await screen.findByRole("slider", { name: "Seek" });
    expect(seek).toHaveAttribute("aria-valuetext", "1:30 of 10:00");
    expect(seek).toHaveValue("90");
  });

  it("reads the volume as a percentage", async () => {
    renderBar(snapshot({ volume: 80 }));

    const volume = await screen.findByRole("slider", { name: "Volume" });
    expect(volume).toHaveAttribute("aria-valuetext", "80%");
  });

  it("reads a muted volume as zero, whatever the slider is set to", async () => {
    renderBar(snapshot({ volume: 80, muted: true }));

    const volume = await screen.findByRole("slider", { name: "Volume" });
    expect(volume).toHaveAttribute("aria-valuetext", "0%");
  });
});

describe("the shortcuts dialog lists what the player takes", () => {
  it("shows every player key, so the bindings are discoverable", () => {
    // A shortcut nobody can find is a shortcut nobody has.
    render(<ShortcutsDialog open onClose={() => undefined} />);

    const table = screen.getByRole("table");
    for (const action of ["Play or pause", "Next track", "Previous track", "Volume up"]) {
      expect(within(table).getByText(action)).toBeInTheDocument();
    }
    expect(within(table).getAllByText("Player").length).toBeGreaterThan(0);
  });

  it("binds Space once, and every other player key exactly once", () => {
    // Two rows claiming one key is the ambiguity SHELL-10 forbids.
    const player = KEYBOARD_SHORTCUTS.filter((row) => row.context === "Player");
    const keys = player.map((row) => row.shortcut);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("Space");
    // And no player key collides with a shortcut another context already owns.
    const others = KEYBOARD_SHORTCUTS.filter((row) => row.context !== "Player").map(
      (row) => row.shortcut,
    );
    expect(keys.filter((key) => others.includes(key))).toEqual([]);
  });
});
