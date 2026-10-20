/**
 * The shared cover loader: answers kept per key, a bounded cache whose evicted URLs are
 * released (never a held one), a cap on requests at once, and waiting requests nobody wants
 * dropped before they are sent.
 */
import { describe, expect, it, vi } from "vitest";

import { createCoverLoader } from "./coverLoader";

/** A fetch whose answer the test gives when it likes. */
function deferred() {
  let resolve!: (url: string | null) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<string | null>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the cover loader", () => {
  it("keeps an answer, so asking again does not call the bridge", async () => {
    const loader = createCoverLoader({ release: vi.fn() });
    const fetch = vi.fn(async () => "blob:a");
    const done = vi.fn();
    loader.request("a", fetch, done);
    await settle();
    expect(done).toHaveBeenCalledTimes(1);
    expect(loader.hold("a")).toBe("blob:a");
    const again = vi.fn();
    loader.request("a", fetch, again);
    expect(again).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("asks once for a key two covers want at the same time", async () => {
    const loader = createCoverLoader({ release: vi.fn() });
    const fetch = vi.fn(async () => "blob:a");
    const one = vi.fn();
    const two = vi.fn();
    loader.request("a", fetch, one);
    loader.request("a", fetch, two);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
  });

  it("never has more requests out than its cap", async () => {
    const loader = createCoverLoader({ maxInFlight: 6, release: vi.fn() });
    let out = 0;
    let most = 0;
    const answers: Array<ReturnType<typeof deferred>> = [];
    const fetch = () => {
      out += 1;
      most = Math.max(most, out);
      const answer = deferred();
      answers.push(answer);
      return answer.promise.finally(() => {
        out -= 1;
      });
    };
    for (let i = 0; i < 40; i += 1) loader.request(`k${i}`, fetch, () => {});
    expect(answers).toHaveLength(6);
    expect(loader.stats()).toMatchObject({ inFlight: 6, waiting: 34 });
    // Answer them a few at a time, one failing now and then: the cap still holds.
    for (let round = 0; answers.some((a) => a !== null) && round < 50; round += 1) {
      const pending = answers.splice(0, 3);
      pending.forEach((answer, i) => (i === 1 ? answer.reject(new Error("no")) : answer.resolve(`blob:${round}-${i}`)));
      await settle();
      expect(out).toBeLessThanOrEqual(6);
      if (answers.length === 0) break;
    }
    expect(most).toBe(6);
  });

  it("drops a waiting request nobody wants before it is sent", async () => {
    const loader = createCoverLoader({ maxInFlight: 1, release: vi.fn() });
    const first = deferred();
    loader.request("first", () => first.promise, () => {});
    const gone = vi.fn(async () => "blob:gone");
    const cancel = loader.request("gone", gone, () => {});
    expect(loader.stats().waiting).toBe(1);
    cancel();
    expect(loader.stats().waiting).toBe(0);
    first.resolve("blob:first");
    await settle();
    expect(gone).not.toHaveBeenCalled();
  });

  it("keeps a waiting request one cover still wants when another lets it go", async () => {
    const loader = createCoverLoader({ maxInFlight: 1, release: vi.fn() });
    const first = deferred();
    loader.request("first", () => first.promise, () => {});
    const shared = vi.fn(async () => "blob:shared");
    const cancelOne = loader.request("shared", shared, () => {});
    const other = vi.fn();
    loader.request("shared", shared, other);
    cancelOne();
    first.resolve("blob:first");
    await settle();
    expect(shared).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it("lets a sent request finish and fill the cache after its cover went", async () => {
    const loader = createCoverLoader({ release: vi.fn() });
    const answer = deferred();
    const done = vi.fn();
    const cancel = loader.request("a", () => answer.promise, done);
    cancel();
    answer.resolve("blob:a");
    await settle();
    expect(done).not.toHaveBeenCalled();
    expect(loader.hold("a")).toBe("blob:a");
  });

  it("releases the least recently used URL when full, never a held one", async () => {
    const release = vi.fn();
    const loader = createCoverLoader({ maxEntries: 2, release });
    loader.request("a", async () => "blob:a", () => {});
    loader.request("b", async () => "blob:b", () => {});
    await settle();
    // "a" is drawn somewhere: held.
    expect(loader.hold("a")).toBe("blob:a");
    loader.request("c", async () => "blob:c", () => {});
    await settle();
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith("blob:b");
    expect(loader.hold("b")).toBeUndefined();
    // Over the bound while everything is held; letting go evicts down to it.
    // A cover waiting for "d" holds it as it arrives: it is not evicted before it is drawn.
    expect(loader.hold("c")).toBe("blob:c");
    loader.request("d", async () => "blob:d", () => loader.hold("d"));
    await settle();
    expect(release).toHaveBeenCalledTimes(1);
    expect(loader.stats().kept).toBe(3);
    loader.letGo("a");
    expect(release).toHaveBeenLastCalledWith("blob:a");
    expect(loader.stats().kept).toBe(2);
    // An answer nobody holds, with the cache full of held ones, goes at once.
    loader.request("e", async () => "blob:e", () => {});
    await settle();
    expect(release).toHaveBeenLastCalledWith("blob:e");
  });

  it("keeps 'no picture' but not a failure, so a failure is asked again", async () => {
    const loader = createCoverLoader({ release: vi.fn() });
    loader.request("none", async () => null, () => {});
    loader.request("broken", async () => Promise.reject(new Error("down")), () => {});
    await settle();
    expect(loader.hold("none")).toBeNull();
    expect(loader.hold("broken")).toBeUndefined();
  });

  it("releases everything on clear, and an answer arriving after it", async () => {
    const release = vi.fn();
    const loader = createCoverLoader({ release });
    loader.request("a", async () => "blob:a", () => {});
    await settle();
    const late = deferred();
    loader.request("late", () => late.promise, () => {});
    loader.clear();
    expect(release).toHaveBeenCalledWith("blob:a");
    late.resolve("blob:late");
    await settle();
    expect(release).toHaveBeenCalledWith("blob:late");
    expect(loader.stats()).toEqual({ kept: 0, inFlight: 0, waiting: 0 });
  });
});
