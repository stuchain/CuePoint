import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLAYER_REPEAT_STORAGE_KEY,
  PLAYER_SHUFFLE_STORAGE_KEY,
  useRestorePlayerOrder,
} from "./playerOrderState";

/**
 * Remembered order settings reach main at startup (PLAYER-07).
 *
 * The timing is the substance. The bar only exists after the first play
 * (DEC-053), and by then a queue has already been built and ordered — so
 * restoring from the bar would shuffle a queue the user had already started
 * listening to in order. This runs at the shell, before anything is queued.
 */

function Harness() {
  useRestorePlayerOrder();
  return null;
}

function installPlayer() {
  const setShuffle = vi.fn().mockResolvedValue(undefined);
  const setRepeat = vi.fn().mockResolvedValue(undefined);
  window.cuepoint = { player: { setShuffle, setRepeat } } as unknown as typeof window.cuepoint;
  return { setShuffle, setRepeat };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("restoring order settings at launch", () => {
  it("sends what was remembered", async () => {
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, "1");
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, "all");
    const player = installPlayer();

    render(<Harness />);

    await waitFor(() => expect(player.setShuffle).toHaveBeenCalledWith(true));
    expect(player.setRepeat).toHaveBeenCalledWith("all");
  });

  it("sends the defaults when nothing was remembered", async () => {
    // Explicitly, rather than assuming main starts in the same state: the two
    // would drift the moment either default changed.
    const player = installPlayer();

    render(<Harness />);

    await waitFor(() => expect(player.setShuffle).toHaveBeenCalledWith(false));
    expect(player.setRepeat).toHaveBeenCalledWith("off");
  });

  it("ignores a stored mode it does not recognise", async () => {
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, "backwards");
    const player = installPlayer();

    render(<Harness />);

    await waitFor(() => expect(player.setRepeat).toHaveBeenCalledWith("off"));
  });

  it("only restores once, however often the shell re-renders", async () => {
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, "1");
    const player = installPlayer();

    const view = render(<Harness />);
    await waitFor(() => expect(player.setShuffle).toHaveBeenCalled());
    view.rerender(<Harness />);
    view.rerender(<Harness />);

    expect(player.setShuffle).toHaveBeenCalledTimes(1);
  });

  it("starts without a player bridge at all", () => {
    // A build with no mpv, or the renderer in a browser tab, must still open.
    expect(() => render(<Harness />)).not.toThrow();
  });

  it("survives a bridge that rejects", async () => {
    const setShuffle = vi.fn().mockRejectedValue(new Error("no player"));
    const setRepeat = vi.fn().mockRejectedValue(new Error("no player"));
    window.cuepoint = { player: { setShuffle, setRepeat } } as unknown as typeof window.cuepoint;

    expect(() => render(<Harness />)).not.toThrow();
    await waitFor(() => expect(setShuffle).toHaveBeenCalled());
  });
});
