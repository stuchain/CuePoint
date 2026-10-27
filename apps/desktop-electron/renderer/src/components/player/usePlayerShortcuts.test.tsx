import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { resetFocusOrigin } from "../shell/focusOrigin";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPlayerStore } from "./playerStore";
import { PLAYER_VOLUME_STEP, usePlayerShortcuts } from "./usePlayerShortcuts";

/**
 * Driving playback from the keyboard (PLAYER-12, SHELL-10).
 *
 * Most of this file is about the keys that must *not* do anything. Space is the
 * obvious play/pause key and it is also the key that activates every button in
 * the app and types a space in every text field — so a binding without guards
 * pauses the music each time someone presses a button, and stops the track
 * while they are typing a search. Each of those is a test here, because each of
 * them is a bug a user would report as "the player randomly stops".
 */

function snapshot(volume = 50): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: "/music/a.flac",
      playing: true,
      paused: false,
      positionSeconds: 10,
      durationSeconds: 300,
      volume,
      muted: false,
    },
    queue: {
      length: 2,
      currentId: "q1",
      currentIndex: 0,
      currentItem: {
        id: "q1",
        trackId: 1,
        filePath: "/music/a.flac",
        title: "Strobe",
        artist: "deadmau5",
        key: "8A",
        bpm: 128,
        durationSeconds: 300,
        status: "playing",
      },
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  };
}

function install(volume = 50) {
  const player = {
    toggle: vi.fn().mockResolvedValue(undefined),
    next: vi.fn().mockResolvedValue(undefined),
    previous: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue(snapshot(volume)),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      onState(snapshot(volume));
      return vi.fn();
    }),
  };
  window.cuepoint = { player } as unknown as typeof window.cuepoint;
  return player;
}

function Probe({ children }: { children?: React.ReactNode }) {
  usePlayerShortcuts();
  return <div>{children}</div>;
}

beforeEach(() => {
  resetPlayerStore();
  resetFocusOrigin();
});

afterEach(() => {
  resetPlayerStore();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("transport keys", () => {
  it("toggles playback on Space", async () => {
    const player = install();
    render(<Probe />);

    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
  });

  it("moves through the queue with Ctrl and the arrows", async () => {
    const player = install();
    render(<Probe />);

    await userEvent.keyboard("{Control>}{ArrowRight}{/Control}");
    await userEvent.keyboard("{Control>}{ArrowLeft}{/Control}");

    expect(player.next).toHaveBeenCalledTimes(1);
    expect(player.previous).toHaveBeenCalledTimes(1);
  });

  it("steps the volume from where it actually is", async () => {
    const player = install(50);
    render(<Probe />);

    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
    await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");

    expect(player.setVolume).toHaveBeenNthCalledWith(1, 50 + PLAYER_VOLUME_STEP);
    expect(player.setVolume).toHaveBeenNthCalledWith(2, 50 - PLAYER_VOLUME_STEP);
  });

  it("stops at the ends of the volume range", async () => {
    const player = install(98);
    render(<Probe />);

    await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");

    expect(player.setVolume).toHaveBeenCalledWith(100);
  });

  it.each(["table", "grid", "tree", "listbox"])(
    "leaves Ctrl+Up/Down to a focused %s, which moves through it, not the volume (M461)",
    async (role) => {
      const player = install(50);
      render(
        <>
          <Probe />
          <div role={role}>
            <button type="button">row</button>
          </div>
        </>,
      );
      screen.getByRole("button", { name: "row" }).focus();

      await userEvent.keyboard("{Control>}{ArrowUp}{/Control}");
      await userEvent.keyboard("{Control>}{ArrowDown}{/Control}");
      expect(player.setVolume).not.toHaveBeenCalled();

      // Ctrl+Left/Right still step the queue from there.
      await userEvent.keyboard("{Control>}{ArrowRight}{/Control}");
      expect(player.next).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves bare arrows to the table and the queue panel", async () => {
    // They are how a keyboard user moves through a list; taking them would
    // break the two places this app is actually used from the keyboard.
    const player = install();
    render(<Probe />);

    await userEvent.keyboard("{ArrowRight}{ArrowLeft}{ArrowUp}{ArrowDown}");

    expect(player.next).not.toHaveBeenCalled();
    expect(player.previous).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
  });
});

describe("Cmd on macOS", () => {
  const platform = (value: string) => vi.spyOn(navigator, "platform", "get").mockReturnValue(value);

  it("steps the queue and the volume with Cmd and the arrows", async () => {
    platform("MacIntel");
    const player = install(50);
    render(<Probe />);

    await userEvent.keyboard("{Meta>}{ArrowRight}{/Meta}");
    await userEvent.keyboard("{Meta>}{ArrowLeft}{/Meta}");
    await userEvent.keyboard("{Meta>}{ArrowUp}{/Meta}");

    expect(player.next).toHaveBeenCalledTimes(1);
    expect(player.previous).toHaveBeenCalledTimes(1);
    expect(player.setVolume).toHaveBeenCalledWith(50 + PLAYER_VOLUME_STEP);
  });

  it("leaves the Windows key alone elsewhere", async () => {
    platform("Linux x86_64");
    const player = install();
    render(<Probe />);

    await userEvent.keyboard("{Meta>}{ArrowRight}{/Meta}");

    expect(player.next).not.toHaveBeenCalled();
  });
});

describe("keys that belong to something else", () => {
  it("leaves Space to a text field", async () => {
    // Otherwise typing "drum and bass" into the filter bar stops the music
    // three times.
    const player = install();
    render(
      <Probe>
        <input aria-label="Search" />
      </Probe>,
    );

    await userEvent.type(screen.getByLabelText("Search"), "drum and bass");

    expect(player.toggle).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>("Search").value).toBe("drum and bass");
  });

  it("leaves Ctrl+arrow to a text field, where it moves by word", async () => {
    const player = install();
    render(
      <Probe>
        <input aria-label="Search" />
      </Probe>,
    );
    const field = screen.getByLabelText("Search");
    field.focus();

    await userEvent.keyboard("{Control>}{ArrowRight}{ArrowLeft}{/Control}");

    expect(player.next).not.toHaveBeenCalled();
    expect(player.previous).not.toHaveBeenCalled();
  });

  it("leaves Space to a focused button", async () => {
    // Pressing a button must do one thing. Space on a button is that button.
    const player = install();
    const clicked = vi.fn();
    render(
      <Probe>
        <button type="button" onClick={clicked}>
          Import
        </button>
      </Probe>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();

    await userEvent.keyboard(" ");

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("leaves Space to a queue row and a menu item", async () => {
    const player = install();
    render(
      <Probe>
        <div role="option" tabIndex={0} aria-selected="false" data-testid="row">
          Queued track
        </div>
      </Probe>,
    );
    await userEvent.tab();
    expect(screen.getByTestId("row")).toHaveFocus();

    await userEvent.keyboard(" ");

    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("toggles on Space after a mouse click on a button, without a second click", async () => {
    const player = install();
    const clicked = vi.fn();
    render(
      <Probe>
        <button type="button" onClick={clicked}>
          Next
        </button>
      </Probe>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("toggles on Space for a keyboard-reached range input, which has no Space action", async () => {
    const player = install();
    render(
      <Probe>
        <input type="range" aria-label="Volume" />
        <div role="slider" tabIndex={0} aria-valuenow={1} data-testid="slider" />
      </Probe>,
    );

    await userEvent.tab();
    expect(screen.getByLabelText("Volume")).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(player.toggle).toHaveBeenCalledTimes(1);

    await userEvent.tab();
    expect(screen.getByTestId("slider")).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(player.toggle).toHaveBeenCalledTimes(2);
  });

  it("toggles on Space after clicking a Tab-reached button, which the click made the pointer's", async () => {
    const player = install();
    const clicked = vi.fn();
    render(
      <Probe>
        <button type="button" onClick={clicked}>
          Import
        </button>
      </Probe>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Import" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveBeenCalledTimes(1); // the click only, not the Space
  });

  it("sees Space as keyboard input even though the shortcut stops it at window capture", async () => {
    const player = install();
    render(
      <Probe>
        <button type="button">Import</button>
        <div role="option" tabIndex={0} aria-selected="false" data-testid="row">
          Queued
        </div>
      </Probe>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" })); // pointer
    await userEvent.keyboard(" "); // toggles; stopped at window capture
    expect(player.toggle).toHaveBeenCalledTimes(1);

    // Focus moves with no further input: programmatic, after that Space press.
    // If the stopped Space had not been seen, the last input would still be
    // the pointer and this row would count as pointer-reached.
    screen.getByTestId("row").focus();
    await userEvent.keyboard(" ");
    expect(player.toggle).toHaveBeenCalledTimes(1);
  });

  it("toggles on Space after clicking a role=option row", async () => {
    const player = install();
    render(
      <Probe>
        <div role="option" tabIndex={0} aria-selected="false" data-testid="row">
          Queued track
        </div>
      </Probe>,
    );

    await userEvent.click(screen.getByTestId("row"));
    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
  });

  it("toggles on Space after clicking a range input", async () => {
    const player = install();
    render(
      <Probe>
        <input type="range" aria-label="Seek" />
      </Probe>,
    );

    await userEvent.click(screen.getByLabelText("Seek"));
    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to a keyboard-reached treeitem that handles it itself", async () => {
    const player = install();
    const own = vi.fn();
    render(
      <Probe>
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected="false"
          data-testid="node"
          onKeyDown={(e) => e.key === " " && own()}
        >
          Folder
        </div>
      </Probe>,
    );

    await userEvent.tab();
    await userEvent.keyboard(" ");

    expect(own).toHaveBeenCalledTimes(1);
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("toggles for a mouse-reached treeitem and does not run its own handler", async () => {
    const player = install();
    const own = vi.fn();
    render(
      <Probe>
        <div
          role="treeitem"
          tabIndex={0}
          aria-selected="false"
          data-testid="node"
          onKeyDown={(e) => e.key === " " && own()}
        >
          Folder
        </div>
      </Probe>,
    );

    await userEvent.click(screen.getByTestId("node"));
    await userEvent.keyboard(" ");

    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(own).not.toHaveBeenCalled();
  });

  it("leaves Space alone while a menu is open", async () => {
    const player = install();
    render(
      <Probe>
        <div role="menu">
          <div role="menuitem" tabIndex={0}>
            Play
          </div>
        </div>
      </Probe>,
    );

    await userEvent.keyboard(" ");

    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("leaves Space alone while a dialog is open", async () => {
    // The user is somewhere else; music must not start or stop behind it.
    const player = install();
    render(
      <Probe>
        <div role="dialog" aria-label="Import">
          <p>Choose a file</p>
        </div>
      </Probe>,
    );

    await userEvent.keyboard(" ");

    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("ignores Space with a modifier, which belongs to the OS or the app", async () => {
    const player = install();
    render(<Probe />);

    await userEvent.keyboard("{Control>} {/Control}");
    await userEvent.keyboard("{Shift>} {/Shift}");

    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("ignores Ctrl+Shift+arrow, which is a selection gesture", async () => {
    const player = install();
    render(<Probe />);

    await userEvent.keyboard("{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}");

    expect(player.next).not.toHaveBeenCalled();
  });
});

describe("without a player", () => {
  it("does nothing and throws nothing", async () => {
    render(<Probe />);

    await expect(userEvent.keyboard(" ")).resolves.not.toThrow();
  });

  it("survives a transport that rejects", async () => {
    const player = install();
    player.toggle.mockRejectedValue(new Error("no player"));
    render(<Probe />);

    await userEvent.keyboard(" ");
    // A rejection here would surface as an unhandled one, which fails the suite.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(player.toggle).toHaveBeenCalled();
  });

  it("stops listening when it goes away", async () => {
    const player = install();
    const view = render(<Probe />);

    view.unmount();
    await userEvent.keyboard(" ");

    expect(player.toggle).not.toHaveBeenCalled();
  });
});
