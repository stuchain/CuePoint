import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScaleProvider } from "../../tokens/ScaleContext";
import {
  useBoxSize,
  useDevicePixelRatio,
  useThemeRevision,
  useWaveformBox,
} from "./waveformEnvironment";

/**
 * What every drawn waveform watches, watched once for all of them (WAVE-06):
 * one `ResizeObserver` for every box, one media query for the pixel ratio,
 * one `MutationObserver` for the theme, each dropped with its last user.
 */

let observers: FakeResizeObserver[];
let rects: Map<Element, { width: number; height: number }>;

class FakeResizeObserver {
  observed = new Set<Element>();
  disconnected = false;
  private readonly callback: (entries: { target: Element }[]) => void;
  constructor(callback: (entries: { target: Element }[]) => void) {
    this.callback = callback;
    observers.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
  report(elements: Element[]) {
    this.callback(elements.map((target) => ({ target })));
  }
}

beforeEach(() => {
  observers = [];
  rects = new Map();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const rect = rects.get(this) ?? { width: 0, height: 0 };
    return { ...rect, left: 0, top: 0 } as DOMRect;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Box({ id, onSize }: { id: string; onSize: (size: { width: number; height: number }) => void }) {
  const [box, size] = useBoxSize<HTMLDivElement>();
  onSize(size);
  return <div ref={box} data-testid={id} />;
}

describe("boxes", () => {
  it("watches every box with one observer, and drops it with the last box", () => {
    const sizes: Record<string, { width: number; height: number }> = {};
    const view = render(
      <>
        {["a", "b", "c"].map((id) => (
          <Box key={id} id={id} onSize={(size) => (sizes[id] = size)} />
        ))}
      </>,
    );
    expect(observers).toHaveLength(1);
    const [observer] = observers;
    expect(observer!.observed.size).toBe(3);

    const b = view.getByTestId("b");
    rects.set(b, { width: 240, height: 30 });
    act(() => observer!.report([b]));
    expect(sizes.b).toEqual({ width: 240, height: 30 });
    expect(sizes.a).toEqual({ width: 0, height: 0 });

    view.unmount();
    expect(observer!.disconnected).toBe(true);
  });
});

describe("the request width", () => {
  function Holder({ onWidth }: { onWidth: (width: number) => void }) {
    const { box, width } = useWaveformBox<HTMLDivElement>();
    onWidth(width);
    return <div ref={box} />;
  }

  it("is 0 until the box is measured, then its columns rounded up to 16", () => {
    const widths: number[] = [];
    const view = render(
      <ScaleProvider>
        <Holder onWidth={(width) => widths.push(width)} />
      </ScaleProvider>,
    );
    expect(widths[0]).toBe(0);
    expect(widths.at(-1)).toBe(0);

    const element = view.container.querySelector("div")!;
    rects.set(element, { width: 200, height: 20 });
    act(() => observers[0]!.report([element]));

    // 200 CSS pixels at scale 2: 100 columns, asked for as 112.
    expect(widths.at(-1)).toBe(112);
  });

  it("works outside the scale provider, at the default scale", () => {
    const widths: number[] = [];
    const view = render(<Holder onWidth={(width) => widths.push(width)} />);
    const element = view.container.querySelector("div")!;
    rects.set(element, { width: 200, height: 20 });
    act(() => observers[0]!.report([element]));
    expect(widths.at(-1)).toBe(112);
  });
});

describe("the pixel ratio", () => {
  it("follows the display, with one query for every reader", () => {
    const listeners = new Set<() => void>();
    const queries: string[] = [];
    // jsdom has neither a media query nor a pixel ratio of its own.
    let ratio = 1;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        queries.push(query);
        return {
          addEventListener: (_: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        } as unknown as MediaQueryList;
      }),
    );
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: () => ratio });
    const restore = () => {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
    };

    const one = renderHook(() => useDevicePixelRatio());
    const two = renderHook(() => useDevicePixelRatio());
    expect(one.result.current).toBe(1);
    expect(queries).toEqual(["(resolution: 1dppx)"]);

    ratio = 2;
    act(() => [...listeners].forEach((listener) => listener()));

    expect(one.result.current).toBe(2);
    expect(two.result.current).toBe(2);
    expect(queries).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
    expect(listeners.size).toBe(1);

    one.unmount();
    two.unmount();
    expect(listeners.size).toBe(0);
    restore();
  });
});

describe("the theme", () => {
  it("changes for every reader when the theme or the root's tokens change", async () => {
    const one = renderHook(() => useThemeRevision());
    const two = renderHook(() => useThemeRevision());
    const before = one.result.current;

    await act(async () => {
      document.documentElement.dataset.theme = "retro16";
      await Promise.resolve();
    });
    expect(one.result.current).toBeGreaterThan(before);
    expect(two.result.current).toBe(one.result.current);

    const after = one.result.current;
    await act(async () => {
      document.documentElement.style.setProperty("--waveform-low", "#00ff00");
      await Promise.resolve();
    });
    expect(one.result.current).toBeGreaterThan(after);

    one.unmount();
    two.unmount();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });
});
