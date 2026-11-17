/**
 * The wait screen shown instead of the app while the first launch after an update brings the
 * library up to date, and the gate's rule for when it shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

import type { LibraryStatus } from "../../api/cuepointBridge.types";
import { ToastProvider, useToast } from "../../components/Toast";
import { LibraryGate } from "./LibraryGate";
import { LibraryUpgrading } from "./LibraryUpgrading";
import { expectNoAxeViolations } from "../../test/axe";

function status(overrides: Partial<LibraryStatus> = {}): LibraryStatus {
  return {
    state: "upgrading",
    appVersion: "1.0.0",
    libraryVersion: null,
    schemaVersion: null,
    headVersion: 31,
    newestGoodBackup: null,
    preUpgradeBackup: null,
    requiredFreeBytes: null,
    failedMigration: null,
    uncleanExit: false,
    computedAt: "2026-10-29T09:00:00Z",
    integrityCheck: { state: "idle", finishedAt: null },
    launchBackupSkipped: null,
    ...overrides,
  };
}

let getState: ReturnType<typeof vi.fn>;
let changed: (() => void) | null;

function wire(first: LibraryStatus, ...rest: LibraryStatus[]) {
  getState = vi.fn();
  getState.mockResolvedValueOnce(first);
  for (const next of rest) getState.mockResolvedValueOnce(next);
  getState.mockResolvedValue(rest.length ? rest[rest.length - 1] : first);
  changed = null;
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    library: {
      getState,
      recheck: vi.fn(),
      getUncleanExit: vi.fn(),
      onStateChanged: (listener: () => void) => {
        changed = listener;
        return () => undefined;
      },
    },
    backups: { onRestoreEvent: () => () => undefined },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LibraryUpgrading", () => {
  it("says what is happening in a title, two sentences and an indeterminate progress bar", async () => {
    const { container } = render(<LibraryUpgrading />);
    expect(screen.getByRole("heading", { name: "Getting your library ready…" })).toBeTruthy();
    expect(
      screen.getByText(
        "CuePoint was updated, so it is bringing your library up to date. This takes a few seconds, and your tracks, playlists and tags stay as they are.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("A backup was made first.")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(screen.getByRole("progressbar", { name: "Getting your library ready…" })).toBe(bar);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector(".library-recovery")?.getAttribute("data-state")).toBe("upgrading");
    await expectNoAxeViolations({ within: container });
  });
});

describe("LibraryGate while the library upgrades at startup", () => {
  it("shows the wait screen, not the app, then the app once the state is ok", async () => {
    wire(status(), status({ state: "ok", computedAt: "2026-10-29T10:00:00Z" }));
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("the app")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(await screen.findByText("the app")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps the app when an update runs after the library was already settled", async () => {
    wire(status({ state: "ok" }), status({ state: "upgrading", computedAt: "2026-10-29T10:00:00Z" }));
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    expect(await screen.findByText("the app")).toBeTruthy();
    await act(async () => {
      changed?.();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(getState.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByText("the app")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("still shows the recovery screen for a damaged library", async () => {
    wire(status({ state: "damaged" }));
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    expect(await screen.findByRole("heading", { name: "CuePoint couldn't read your library" })).toBeTruthy();
    expect(screen.queryByText("the app")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("LibraryGate and the wait screen, over a longer run", () => {
  let live: LibraryStatus | Error;

  /** The library answers whatever `live` is now; an Error is an engine that is not up. */
  function wireLive(first: LibraryStatus | Error) {
    live = first;
    getState = vi.fn(async () => {
      if (live instanceof Error) throw live;
      return live;
    });
    changed = null;
    (window as unknown as { cuepoint: unknown }).cuepoint = {
      library: {
        getState,
        recheck: vi.fn(async () => undefined),
        getUncleanExit: vi.fn(),
        onStateChanged: (listener: () => void) => {
          changed = listener;
          return () => undefined;
        },
      },
      backups: { onRestoreEvent: () => () => undefined },
    };
  }
  const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const notify = () => act(async () => void (changed?.(), await vi.advanceTimersByTimeAsync(10)));

  it("closes what the app said before the first answer when the wait screen takes over", async () => {
    wireLive(new Error("Engine not running"));
    function Probe() {
      const { push } = useToast();
      return (
        <button type="button" onClick={() => push("[LIBRARY_NOT_READY] still getting your library ready", "error")}>
          Say it
        </button>
      );
    }
    render(
      <ToastProvider>
        <LibraryGate>
          <Probe />
        </LibraryGate>
      </ToastProvider>,
    );
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole("button", { name: "Say it" }));
    expect(await screen.findByText("[LIBRARY_NOT_READY] still getting your library ready")).toBeTruthy();
    live = status();
    await tick(1600);
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("[LIBRARY_NOT_READY] still getting your library ready")).toBeNull());
  });

  it("gives the app back after a minute of waiting, so an engine that died is not hidden", async () => {
    wireLive(status());
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    await tick(59_000);
    expect(screen.getByRole("progressbar")).toBeTruthy();
    await tick(2000);
    expect(screen.getByText("the app")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("keeps the recovery screen while Try again runs an update, then shows the app", async () => {
    wireLive(status({ state: "needs_space", requiredFreeBytes: 1 }));
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    live = status({ state: "upgrading", computedAt: "2026-10-29T09:30:00Z" });
    await tick(3000);
    expect(screen.getByRole("heading", { name: "CuePoint needs more space to update your library" })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    live = status({ state: "ok", computedAt: "2026-10-29T10:00:00Z" });
    await tick(3000);
    expect(await screen.findByText("the app")).toBeTruthy();
  });

  it("goes from the wait screen to the recovery screen, keeps it through a later update, and ends in the app", async () => {
    wireLive(status());
    render(
      <LibraryGate>
        <p>the app</p>
      </LibraryGate>,
    );
    expect(await screen.findByRole("progressbar")).toBeTruthy();
    live = status({ state: "upgrade_failed", computedAt: "2026-10-29T09:10:00Z" });
    await tick(1600);
    expect(await screen.findByRole("heading", { name: "CuePoint couldn't finish updating your library" })).toBeTruthy();
    live = status({ state: "upgrading", computedAt: "2026-10-29T09:20:00Z" });
    await notify();
    await tick(1600);
    expect(screen.getByRole("heading", { name: "CuePoint couldn't finish updating your library" })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    live = status({ state: "ok", computedAt: "2026-10-29T10:00:00Z" });
    await notify();
    expect(await screen.findByText("the app")).toBeTruthy();
  });

  it("does not remount the app across ok, upgrading and ok", async () => {
    wireLive(status({ state: "ok" }));
    let mounts = 0;
    function Child() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>the app</p>;
    }
    render(
      <LibraryGate>
        <Child />
      </LibraryGate>,
    );
    expect(await screen.findByText("the app")).toBeTruthy();
    live = status({ state: "upgrading", computedAt: "2026-10-29T09:20:00Z" });
    await notify();
    live = status({ state: "ok", computedAt: "2026-10-29T10:00:00Z" });
    await notify();
    expect(screen.getByText("the app")).toBeTruthy();
    expect(mounts).toBe(1);
  });
});
