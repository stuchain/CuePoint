import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerNotice } from "../../api/cuepointBridge.types";
import { ToastProvider } from "../Toast";
import { usePlayerNotices } from "./usePlayerNotices";

/**
 * Player notices becoming toasts (PLAYER-10, DEC-054).
 *
 * The coalescing itself lives in main, where the failures are. What has to be
 * right here is narrower and just as easy to get wrong: one notice is one
 * toast, a re-delivered notice is no toast at all, and a subscription that is
 * torn down stops listening. React mounts effects twice under StrictMode and
 * again on every hot reload, so "the same failure showed up three times" is a
 * real bug rather than a theoretical one.
 */

function notice(overrides: Partial<PlayerNotice> = {}): PlayerNotice {
  return {
    id: 1,
    kind: "track-failed",
    message: "Could not play “Strobe” (loading failed)",
    count: 1,
    stopped: false,
    ...overrides,
  };
}

function install() {
  let send: ((notice: PlayerNotice) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribeNotices = vi.fn((onNotice: (notice: PlayerNotice) => void) => {
    send = onNotice;
    return unsubscribe;
  });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { player: { subscribeNotices } };
  return {
    subscribeNotices,
    unsubscribe,
    send: (value: PlayerNotice) => send?.(value),
  };
}

function Probe() {
  usePlayerNotices();
  return null;
}

function renderProbe() {
  return render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  );
}

afterEach(() => {
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("notices", () => {
  it("shows what the player said", async () => {
    const harness = install();
    renderProbe();

    harness.send(notice());

    expect(
      await screen.findByText("Could not play “Strobe” (loading failed)"),
    ).toBeInTheDocument();
  });

  it("shows one toast per notice, however many tracks it covers", async () => {
    const harness = install();
    renderProbe();

    harness.send(notice({ id: 1, count: 5_000, message: "5,000 tracks could not be played" }));

    expect(await screen.findByText("5,000 tracks could not be played")).toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeLessThanOrEqual(1);
  });

  it("ignores a notice it has already shown", async () => {
    // A re-delivered notice — a re-subscribe, a StrictMode double mount — must
    // not turn one failure into two toasts.
    const harness = install();
    renderProbe();

    harness.send(notice({ id: 7 }));
    await screen.findByText("Could not play “Strobe” (loading failed)");
    harness.send(notice({ id: 7 }));
    harness.send(notice({ id: 3 }));

    expect(screen.getAllByText("Could not play “Strobe” (loading failed)")).toHaveLength(1);
  });

  it("shows the next notice after one it has seen", async () => {
    const harness = install();
    renderProbe();

    harness.send(notice({ id: 1, message: "first" }));
    await screen.findByText("first");
    harness.send(notice({ id: 2, message: "second" }));

    expect(await screen.findByText("second")).toBeInTheDocument();
  });

  it("is an error when playback stopped and a warning when it did not", async () => {
    const harness = install();
    renderProbe();

    harness.send(notice({ id: 1, message: "skipped one", stopped: false }));
    harness.send(notice({ id: 2, message: "everything failed", stopped: true }));

    const skipped = await screen.findByText("skipped one");
    const stopped = await screen.findByText("everything failed");
    // The variant is what carries "the queue carried on" versus "nothing is
    // playing any more", which is the difference the user acts on.
    expect(skipped.closest(".cp-toast")).toHaveClass("cp-toast--warning");
    expect(stopped.closest(".cp-toast")).toHaveClass("cp-toast--error");
  });

  it("says nothing for an empty message", async () => {
    const harness = install();
    renderProbe();

    harness.send(notice({ id: 1, message: "" }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("unsubscribes when it goes away", () => {
    // Otherwise a reloaded window keeps a dead listener registered in main.
    const harness = install();
    const view = renderProbe();

    view.unmount();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a bridge", () => {
    expect(() => renderProbe()).not.toThrow();
  });

  it("does nothing when the bridge is too old to know about notices", () => {
    // A preload from before PLAYER-10: the renderer must not throw at it.
    (window as unknown as { cuepoint?: unknown }).cuepoint = { player: {} };

    expect(() => renderProbe()).not.toThrow();
  });
});
