/**
 * A cover through the shared loader: drawn from the cache on a second mount without asking,
 * asked for only near the screen, and dropped from the queue when it leaves before being sent.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoverLoader, type CoverLoader } from "./coverLoader";
import { NEAR_SCREEN, useCover } from "./useCover";

class FakeObserver {
  static all: FakeObserver[] = [];
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  targets = new Set<Element>();
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.all.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Says whether `target` is near the screen, as the browser would. */
  static show(target: Element, near: boolean) {
    for (const observer of FakeObserver.all) {
      if (!observer.targets.has(target)) continue;
      observer.callback(
        [{ target, isIntersecting: near } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    }
  }
}

function Cover({ id, loader, fetch }: { id: string; loader: CoverLoader; fetch: (id: string) => Promise<string | null> }) {
  const { ref, url } = useCover(id, () => fetch(id), loader);
  return (
    <span ref={ref} data-testid={id}>
      {url ? <img src={url} alt="" /> : "placeholder"}
    </span>
  );
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(() => {
  vi.unstubAllGlobals();
  FakeObserver.all = [];
});

describe("a cover", () => {
  it("is drawn from the cache on a second mount without a bridge call", async () => {
    const loader = createCoverLoader({ release: vi.fn() });
    const fetch = vi.fn(async (id: string) => `blob:${id}`);
    const first = render(<Cover id="a" loader={loader} fetch={fetch} />);
    await settle();
    expect(first.container.querySelector("img")).toHaveAttribute("src", "blob:a");
    first.unmount();
    const second = render(<Cover id="a" loader={loader} fetch={fetch} />);
    // On the first frame: no placeholder flash.
    expect(second.container.querySelector("img")).toHaveAttribute("src", "blob:a");
    await settle();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is asked for only once it comes near the screen", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const loader = createCoverLoader({ release: vi.fn() });
    const fetch = vi.fn(async (id: string) => `blob:${id}`);
    render(<Cover id="a" loader={loader} fetch={fetch} />);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(FakeObserver.all[0]?.options?.rootMargin).toBe(NEAR_SCREEN);
    act(() => FakeObserver.show(screen.getByTestId("a"), true));
    await settle();
    expect(fetch).toHaveBeenCalledWith("a");
    expect(screen.getByTestId("a").querySelector("img")).toHaveAttribute("src", "blob:a");
  });

  it("is never asked for when it went off screen or away while waiting its turn", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const loader = createCoverLoader({ maxInFlight: 1, release: vi.fn() });
    let answer!: (url: string) => void;
    const fetch = vi.fn((id: string) =>
      id === "busy" ? new Promise<string | null>((resolve) => (answer = resolve)) : Promise.resolve(`blob:${id}`),
    );
    const view = render(
      <>
        <Cover id="busy" loader={loader} fetch={fetch} />
        <Cover id="scrolled" loader={loader} fetch={fetch} />
        <Cover id="unmounted" loader={loader} fetch={fetch} />
      </>,
    );
    for (const id of ["busy", "scrolled", "unmounted"]) act(() => FakeObserver.show(screen.getByTestId(id), true));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loader.stats().waiting).toBe(2);
    act(() => FakeObserver.show(screen.getByTestId("scrolled"), false));
    view.rerender(
      <>
        <Cover id="busy" loader={loader} fetch={fetch} />
        <Cover id="scrolled" loader={loader} fetch={fetch} />
      </>,
    );
    expect(loader.stats().waiting).toBe(0);
    answer("blob:busy");
    await settle();
    expect(fetch.mock.calls.map(([id]) => id)).toEqual(["busy"]);
  });

  it("holds its URL while drawn, so eviction releases it only after it goes", async () => {
    const release = vi.fn();
    const loader = createCoverLoader({ maxEntries: 1, release });
    const fetch = vi.fn(async (id: string) => `blob:${id}`);
    const a = render(<Cover id="a" loader={loader} fetch={fetch} />);
    await settle();
    const b = render(<Cover id="b" loader={loader} fetch={fetch} />);
    await settle();
    // Both drawn: over the bound, nothing released.
    expect(release).not.toHaveBeenCalled();
    a.unmount();
    expect(release).toHaveBeenCalledWith("blob:a");
    b.unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
