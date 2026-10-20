/**
 * One cover through the shared loader (`coverLoader.ts`), asked for only while its element is on
 * or near the screen.
 *
 * A kept answer is drawn on the first render, so a cover shown again never flashes the
 * placeholder or asks the bridge. Otherwise the element is watched: once it comes within
 * `NEAR_SCREEN` of its scroller's view it joins the loader's queue, and leaving again (scrolled
 * away, hidden, unmounted) drops it from the queue unless it was already sent. A drawn URL is
 * held, so the cache never releases a URL that is on screen; it is let go when the cover goes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { covers, type CoverFetch, type CoverLoader } from "./coverLoader";

/** How far beyond the view a cover is asked for, so it is there by the time it scrolls in. */
export const NEAR_SCREEN = "400px 0px";

/** The nearest ancestor that scrolls vertically, or null for the viewport. */
export function scrollParent(element: Element): Element | null {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  return null;
}

type Watcher = (near: boolean) => void;

// One observer per scroller: hundreds of cards share it.
const observers = new Map<Element | null, { observer: IntersectionObserver; watchers: Map<Element, Watcher> }>();

/** Calls `onChange` with whether `element` is near the screen; returns the stop. */
function watchNearScreen(element: Element, onChange: Watcher): () => void {
  if (typeof IntersectionObserver !== "function") {
    // Nothing can say (a test's jsdom, an old engine host): treat it as shown.
    onChange(true);
    return () => {};
  }
  const root = scrollParent(element);
  let shared = observers.get(root);
  if (!shared) {
    const watchers = new Map<Element, Watcher>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) watchers.get(entry.target)?.(entry.isIntersecting);
      },
      { root, rootMargin: NEAR_SCREEN },
    );
    shared = { observer, watchers };
    observers.set(root, shared);
  }
  const { observer, watchers } = shared;
  watchers.set(element, onChange);
  observer.observe(element);
  return () => {
    observer.unobserve(element);
    watchers.delete(element);
    if (watchers.size === 0) {
      observer.disconnect();
      observers.delete(root);
    }
  };
}

export interface Cover {
  /** Put on the element the cover is drawn in (always rendered, placeholder or picture). */
  ref: (element: Element | null) => void;
  /** The object URL to draw, or null while loading or when there is none. */
  url: string | null;
  /** True once the answer is known: a picture, none, or a failed read (no key counts as known). */
  settled: boolean;
}

interface Shown {
  url: string | null;
  settled: boolean;
}

const WAITING: Shown = { url: null, settled: false };
const NONE: Shown = { url: null, settled: true };

/**
 * The cover named `key` (null: none to ask for), fetched with `fetch` when it is its turn.
 * `fetch` may change between renders; the one current when the request is sent is used.
 */
export function useCover(key: string | null, fetch: CoverFetch, loader: CoverLoader = covers): Cover {
  const [element, setElement] = useState<Element | null>(null);
  const ref = useCallback((next: Element | null) => setElement(next), []);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  // A kept answer drawn on the first render; the effect holds it.
  const [shown, setShown] = useState<Shown>(() => (key == null ? NONE : peek(loader, key)));

  useEffect(() => {
    if (key == null) {
      setShown(NONE);
      return;
    }
    let held = false;
    const take = (): boolean => {
      const hit = loader.hold(key);
      if (hit === undefined) return false;
      held = true;
      setShown({ url: hit, settled: true });
      return true;
    };
    const letGo = () => {
      if (held) loader.letGo(key);
      held = false;
    };
    if (take()) return letGo;
    setShown(WAITING);
    if (!element) return undefined;

    let cancel: (() => void) | null = null;
    let live = true;
    const stop = watchNearScreen(element, (near) => {
      if (held) return;
      if (near && !cancel) {
        cancel = loader.request(
          key,
          () => fetchRef.current(),
          () => {
            cancel = null;
            // Not kept: the read failed. Say so (the placeholder), and try again on a later mount.
            if (live && !take()) setShown(NONE);
          },
        );
      } else if (!near && cancel) {
        cancel();
        cancel = null;
      }
    });
    return () => {
      live = false;
      stop();
      cancel?.();
      letGo();
    };
  }, [element, key, loader]);

  return { ref, url: shown.url, settled: shown.settled };
}

/** The kept answer for `key` without holding it (the effect holds it after the render). */
function peek(loader: CoverLoader, key: string): Shown {
  const hit = loader.hold(key);
  if (hit === undefined) return WAITING;
  loader.letGo(key);
  return { url: hit, settled: true };
}
