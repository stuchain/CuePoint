import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeActiveJobs } from "./jobsStore";
import { announceLibraryChange } from "./libraryChanges";
import { invalidateReads, resetEngineReadsForTests, useEngineRead } from "./engineReads";
import { BEATPORT_TOKEN_STATUS, DISCOVER_OPTIONS, useSharedRead } from "./sharedReads";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A reader that answers each call from a queue the test controls. */
function reader<T>() {
  const calls: Array<Deferred<T>> = [];
  const read = vi.fn(() => {
    const next = deferred<T>();
    calls.push(next);
    return next.promise;
  });
  return { read, calls };
}

const library = { domains: ["library" as const] };

// The change sources are driven through the real job store: its poll is what
// reports an ending job or a moved counter, so a fake bridge is the honest input.
const world = {
  jobs: [] as Array<{ id: string; type: string }>,
  revisions: { library: 1, waveforms: 1 } as { library: number; waveforms: number; discover?: number },
  authListener: null as (() => void) | null,
};

function installBridge(): void {
  world.jobs = [];
  world.revisions = { library: 1, waveforms: 1 };
  world.authListener = null;
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    onBeatportAuthChanged: (listener: () => void) => {
      world.authListener = listener;
      return () => {
        world.authListener = null;
      };
    },
    listJobs: async () => ({
      jobs: world.jobs.map((j) => ({ ...j, state: "running", created_at: "", updated_at: "" })),
      active_count: world.jobs.length,
      revisions: { ...world.revisions },
    }),
  };
}

/** Lets the poll see a baseline, then runs `change` and lets the next poll see its effect. */
async function pollAfter(change: () => void): Promise<void> {
  await act(async () => {
    // Leaving afterwards stops the poll, so the next call starts from a baseline again.
    const leave = subscribeActiveJobs(() => {}, 1000);
    await vi.advanceTimersByTimeAsync(0);
    change();
    await vi.advanceTimersByTimeAsync(1000);
    leave();
  });
}

async function finishJob(type: string): Promise<void> {
  world.jobs = [{ id: `job-${type}`, type }];
  await pollAfter(() => {
    world.jobs = [];
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  installBridge();
});

afterEach(() => {
  resetEngineReadsForTests();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.useRealTimers();
});

describe("useEngineRead", () => {
  it("shares one read between hooks that mount together", async () => {
    const { read, calls } = reader<string>();
    const a = renderHook(() => useEngineRead("k", read, library));
    const b = renderHook(() => useEngineRead("k", read, library));
    expect(read).toHaveBeenCalledTimes(1);
    expect(a.result.current.loading).toBe(true);
    await act(async () => calls[0].resolve("v"));
    expect(a.result.current.value).toBe("v");
    expect(b.result.current.value).toBe("v");
  });

  it("shows the cached value on the first render and does not read a fresh entry again", async () => {
    const { read, calls } = reader<string>();
    const first = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v"));
    first.unmount();

    const seen: Array<string | undefined> = [];
    const second = renderHook(() => {
      const r = useEngineRead("k", read, library);
      seen.push(r.value);
      return r;
    });
    expect(seen[0]).toBe("v");
    expect(second.result.current.loading).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps the old value while a mounted hook reads again after an invalidation", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("old"));

    act(() => invalidateReads(["library"]));
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.value).toBe("old");
    expect(result.current.refreshing).toBe(true);
    expect(result.current.loading).toBe(false);

    await act(async () => calls[1].resolve("new"));
    expect(result.current.value).toBe("new");
    expect(result.current.refreshing).toBe(false);
  });

  it("is invalidated by a library announcement", async () => {
    const { read, calls } = reader<string>();
    renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v"));
    act(() => announceLibraryChange());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("is invalidated by a revision change of its domain", async () => {
    const { read, calls } = reader<string>();
    renderHook(() => useEngineRead("k", read, { domains: ["waveforms"] }));
    await act(async () => calls[0].resolve("v"));
    await pollAfter(() => {
      world.revisions = { library: 2, waveforms: 1 };
    });
    expect(read).toHaveBeenCalledTimes(1);
    await pollAfter(() => {
      world.revisions = { library: 2, waveforms: 2 };
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads Discover's reads again when its counter moves, and leaves the library's alone", async () => {
    // A dig writes the catalog about once a second: the engine moves `discover`, not
    // `library`, so Statistics and the Library are not read again for it.
    const lib = reader<string>();
    const disc = reader<string>();
    renderHook(() => useEngineRead("lib", lib.read, library));
    renderHook(() => useEngineRead("disc", disc.read, { domains: ["discover"] }));
    await act(async () => {
      lib.calls[0].resolve("a");
      disc.calls[0].resolve("b");
    });
    world.revisions = { library: 1, waveforms: 1, discover: 1 };
    await pollAfter(() => {
      world.revisions = { library: 1, waveforms: 1, discover: 2 };
    });
    expect(disc.read).toHaveBeenCalledTimes(2);
    expect(lib.read).toHaveBeenCalledTimes(1);
  });

  it("maps a finished job to the domains it touched", async () => {
    const lib = reader<string>();
    const wave = reader<string>();
    renderHook(() => useEngineRead("lib", lib.read, library));
    renderHook(() => useEngineRead("wave", wave.read, { domains: ["waveforms"] }));
    await act(async () => {
      lib.calls[0].resolve("a");
      wave.calls[0].resolve("b");
    });

    await finishJob("clean_match");
    expect(lib.read).toHaveBeenCalledTimes(2);
    expect(wave.read).toHaveBeenCalledTimes(1);
    await act(async () => lib.calls[1].resolve("a2"));

    await finishJob("waveform_analysis");
    expect(wave.read).toHaveBeenCalledTimes(2);
    expect(lib.read).toHaveBeenCalledTimes(2);

    // An unknown type (the poll may not have known it) is read as a library change.
    await finishJob("");
    expect(lib.read).toHaveBeenCalledTimes(3);
  });

  it("reads everything again after an import", async () => {
    const wave = reader<string>();
    renderHook(() => useEngineRead("wave", wave.read, { domains: ["settings"] }));
    await act(async () => wave.calls[0].resolve("b"));
    await finishJob("library_import");
    expect(wave.read).toHaveBeenCalledTimes(2);
  });

  it("reads an invalidated, unmounted entry on the next mount, showing the old value meanwhile", async () => {
    const { read, calls } = reader<string>();
    const first = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("old"));
    first.unmount();

    act(() => invalidateReads(["library"]));
    expect(read).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useEngineRead("k", read, library));
    expect(second.result.current.value).toBe("old");
    expect(second.result.current.refreshing).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => calls[1].resolve("new"));
    expect(second.result.current.value).toBe("new");
  });

  it("reads again on mount once the entry is older than maxAgeMs", async () => {
    const { read, calls } = reader<string>();
    const first = renderHook(() => useEngineRead("k", read, { ...library, maxAgeMs: 1000 }));
    await act(async () => calls[0].resolve("v"));
    first.unmount();

    vi.advanceTimersByTime(500);
    renderHook(() => useEngineRead("k", read, { ...library, maxAgeMs: 1000 })).unmount();
    expect(read).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    renderHook(() => useEngineRead("k", read, { ...library, maxAgeMs: 1000 }));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps the old value on failure, sets the error and reads again next time", async () => {
    const { read, calls } = reader<string>();
    const first = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("old"));

    act(() => invalidateReads(["library"]));
    await act(async () => calls[1].reject(new Error("boom")));
    expect(first.result.current.value).toBe("old");
    expect(first.result.current.error).toBeInstanceOf(Error);
    expect(first.result.current.loading).toBe(false);
    expect(first.result.current.refreshing).toBe(false);
    first.unmount();

    const second = renderHook(() => useEngineRead("k", read, library));
    expect(read).toHaveBeenCalledTimes(3);
    await act(async () => calls[2].resolve("new"));
    expect(second.result.current.value).toBe("new");
    expect(second.result.current.error).toBeUndefined();
  });

  it("is not loading after a failure with no value", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    expect(result.current.loading).toBe(true);
    await act(async () => calls[0].reject(new Error("boom")));
    expect(result.current.loading).toBe(false);
    expect(result.current.value).toBeUndefined();
  });

  it("refresh() during a read waits for it, lands its answer, then reads once more", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    // No overlapping read: the running one is not superseded.
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => calls[0].resolve("first"));
    // The running read's answer lands, and exactly one more follows.
    expect(result.current.value).toBe("first");
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.refreshing).toBe(true);

    await act(async () => calls[1].resolve("newer"));
    expect(result.current.value).toBe("newer");
    expect(result.current.refreshing).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("lets a steady refresh() land a slow read (a poll shorter than the read)", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    for (let i = 0; i < 5; i++) act(() => result.current.refresh());
    await act(async () => calls[0].resolve("slow"));
    expect(result.current.value).toBe("slow");
  });

  it("refresh() forces a read of a fresh entry", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v"));
    act(() => result.current.refresh());
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("drops the least recently used entry past 200 keys", async () => {
    const { read, calls } = reader<string>();
    for (let i = 0; i < 201; i++) {
      const h = renderHook(() => useEngineRead(`k${i}`, read, library));
      await act(async () => calls[i].resolve(`v${i}`));
      h.unmount();
    }
    expect(read).toHaveBeenCalledTimes(201);

    const newest = renderHook(() => useEngineRead("k200", read, library));
    expect(newest.result.current.value).toBe("v200");
    expect(read).toHaveBeenCalledTimes(201);

    const oldest = renderHook(() => useEngineRead("k0", read, library));
    expect(oldest.result.current.value).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(202);
  });

  it("does nothing for a null key", () => {
    const { read } = reader<string>();
    const { result } = renderHook(() => useEngineRead(null, read, library));
    expect(read).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ value: undefined, loading: false, refreshing: false });
    act(() => result.current.refresh());
    expect(read).not.toHaveBeenCalled();
  });
});

describe("useEngineRead invalidation while a read runs", () => {
  it("lets a running read land under repeated invalidations, then reads once more", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v0"));

    act(() => invalidateReads(["library"]));
    expect(read).toHaveBeenCalledTimes(2);
    act(() => invalidateReads(["library"]));
    act(() => invalidateReads(["library"]));
    expect(read).toHaveBeenCalledTimes(2);

    await act(async () => calls[1].resolve("v1"));
    expect(result.current.value).toBe("v1");
    // Exactly one more read for everything that arrived meanwhile.
    expect(read).toHaveBeenCalledTimes(3);
    expect(result.current.refreshing).toBe(true);

    await act(async () => calls[2].resolve("v2"));
    expect(result.current.value).toBe("v2");
    expect(result.current.refreshing).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("starts one extra read for two invalidations in one tick", async () => {
    const { read, calls } = reader<string>();
    renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v0"));
    act(() => {
      invalidateReads(["library"]);
      invalidateReads(["library"]);
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads once when a finished job and a revision change arrive from one poll", async () => {
    const { read, calls } = reader<string>();
    renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].resolve("v0"));
    world.jobs = [{ id: "j", type: "clean_match" }];
    await pollAfter(() => {
      world.jobs = [];
      world.revisions = { library: 2, waveforms: 1 };
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not evict an entry whose read is running", async () => {
    const { read, calls } = reader<string>();
    const first = renderHook(() => useEngineRead("k0", read, library));
    first.unmount();
    for (let i = 1; i <= 201; i++) {
      const h = renderHook(() => useEngineRead(`k${i}`, read, library));
      await act(async () => calls[i].resolve(`v${i}`));
      h.unmount();
    }
    await act(async () => calls[0].resolve("v0"));
    const again = renderHook(() => useEngineRead("k0", read, library));
    expect(again.result.current.value).toBe("v0");
    expect(read).toHaveBeenCalledTimes(202);
  });

  it("clears an old error when a read starts on an entry with no value", async () => {
    const { read, calls } = reader<string>();
    const { result } = renderHook(() => useEngineRead("k", read, library));
    await act(async () => calls[0].reject(new Error("boom")));
    expect(result.current.error).toBeInstanceOf(Error);
    act(() => result.current.refresh());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });
});

describe("useEngineRead refresh()", () => {
  it("uses the latest reader and domains, not the first render's", async () => {
    const first = reader<string>();
    const second = reader<string>();
    const { result, rerender } = renderHook(
      ({ r, domains }) => useEngineRead("k", r, { domains }),
      { initialProps: { r: first.read, domains: ["library"] as Array<"library" | "waveforms"> } },
    );
    await act(async () => first.calls[0].resolve("v0"));
    rerender({ r: second.read, domains: ["waveforms"] });

    act(() => result.current.refresh());
    expect(second.read).toHaveBeenCalledTimes(1);
    expect(first.read).toHaveBeenCalledTimes(1);
    await act(async () => second.calls[0].resolve("v1"));

    act(() => invalidateReads(["library"]));
    expect(second.read).toHaveBeenCalledTimes(1);
    act(() => invalidateReads(["waveforms"]));
    expect(second.read).toHaveBeenCalledTimes(2);
  });
});

describe("useEngineRead and a Beatport sign-in change", () => {
  it("marks settings stale, so the options and the token status read again", async () => {
    const options = reader<string>();
    const token = reader<string>();
    const lib = reader<string>();
    const bridge = (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint;
    bridge.getDiscoverOptions = options.read;
    bridge.getBeatportTokenStatus = token.read;
    renderHook(() => {
      useSharedRead(DISCOVER_OPTIONS);
      useSharedRead(BEATPORT_TOKEN_STATUS);
      useEngineRead("library/x", lib.read, library);
    });
    await act(async () => {
      options.calls[0].resolve("o0");
      token.calls[0].resolve("t0");
      lib.calls[0].resolve("l0");
    });
    expect(world.authListener).not.toBeNull();

    act(() => world.authListener?.());
    expect(options.read).toHaveBeenCalledTimes(2);
    expect(token.read).toHaveBeenCalledTimes(2);
    // Not a library change.
    expect(lib.read).toHaveBeenCalledTimes(1);
  });

  it("stops listening when the module is reset", () => {
    const { read } = reader<string>();
    renderHook(() => useEngineRead("k", read, library));
    expect(world.authListener).not.toBeNull();
    resetEngineReadsForTests();
    expect(world.authListener).toBeNull();
  });
});
