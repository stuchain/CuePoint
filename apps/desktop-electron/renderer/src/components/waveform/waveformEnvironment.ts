/**
 * What every drawn waveform watches, watched once for all of them (WAVE-06).
 *
 * A waveform is drawn in the bar, the Inspector and in every row of the
 * Library's column, so forty or more can be on screen at once. Each needs to
 * know its box's width, the display's pixel ratio and when the theme changes.
 * One `ResizeObserver`, one media query and one `MutationObserver` serve them
 * all, made with the first view that needs them and dropped with the last.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { useScaleFactor } from "../../tokens/ScaleContext";
import { requestWidth } from "./waveformLayout";

// ------------------------------------------------------------------ boxes

/** A box's size in CSS pixels. */
export interface BoxSize {
  width: number;
  height: number;
}

type BoxListener = (size: BoxSize) => void;

const boxListeners = new Map<Element, BoxListener>();
let resizeObserver: ResizeObserver | null = null;

function measure(element: Element): BoxSize {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function observeBox(element: Element, listener: BoxListener): () => void {
  boxListeners.set(element, listener);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) boxListeners.get(entry.target)?.(measure(entry.target));
    });
    resizeObserver.observe(element);
  }
  return () => {
    boxListeners.delete(element);
    resizeObserver?.unobserve(element);
    if (boxListeners.size === 0) {
      resizeObserver?.disconnect();
      resizeObserver = null;
    }
  };
}

const NO_BOX: BoxSize = { width: 0, height: 0 };

/** A box's size in CSS pixels, followed as it changes; zero until measured. */
export function useBoxSize<T extends HTMLElement>(): [RefObject<T | null>, BoxSize] {
  const box = useRef<T>(null);
  const [size, setSize] = useState<BoxSize>(NO_BOX);
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const changed = (next: BoxSize) =>
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      );
    changed(measure(element));
    return observeBox(element, changed);
  }, []);
  return [box, size];
}

// ------------------------------------------------------ device pixel ratio

function currentRatio(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

const ratioListeners = new Set<() => void>();
let ratioQuery: MediaQueryList | null = null;

function onRatioChange(): void {
  watchRatio();
  ratioListeners.forEach((listener) => listener());
}

/** Follow the ratio: a query matches one ratio, so each change makes a new one. */
function watchRatio(): void {
  ratioQuery?.removeEventListener?.("change", onRatioChange);
  ratioQuery = null;
  if (ratioListeners.size === 0 || typeof window.matchMedia !== "function") return;
  ratioQuery = window.matchMedia(`(resolution: ${currentRatio()}dppx)`);
  ratioQuery.addEventListener?.("change", onRatioChange);
}

function subscribeRatio(listener: () => void): () => void {
  ratioListeners.add(listener);
  if (ratioListeners.size === 1) watchRatio();
  return () => {
    ratioListeners.delete(listener);
    if (ratioListeners.size === 0) watchRatio();
  };
}

/** The display's pixel ratio, followed as it changes (a window moved to another monitor). */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribeRatio, currentRatio, () => 1);
}

// ------------------------------------------------------------------ theme

const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;
let themeRevision = 0;

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  if (!themeObserver && typeof MutationObserver !== "undefined") {
    themeObserver = new MutationObserver(() => {
      themeRevision += 1;
      themeListeners.forEach((each) => each());
    });
    // A custom theme's preview changes the root's inline tokens, not its
    // `data-theme`, so both are watched.
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
  }
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0) {
      themeObserver?.disconnect();
      themeObserver = null;
    }
  };
}

/** A number that changes whenever the theme's tokens may have. */
export function useThemeRevision(): number {
  return useSyncExternalStore(
    subscribeTheme,
    () => themeRevision,
    () => 0,
  );
}

// ---------------------------------------------------------- request width

/**
 * The box a waveform is drawn in, and the picture to ask for to fill it: its
 * columns rounded up to a multiple of 16 (`requestWidth`), or 0 until the box
 * has been measured, so nothing is asked for at a width nobody draws.
 */
export function useWaveformBox<T extends HTMLElement>(): {
  box: RefObject<T | null>;
  cssWidth: number;
  width: number;
} {
  const [box, size] = useBoxSize<T>();
  const cssWidth = size.width;
  const scale = useScaleFactor();
  const ratio = useDevicePixelRatio();
  const width = cssWidth > 0 ? requestWidth(cssWidth, scale, ratio) : 0;
  return { box, cssWidth, width };
}
