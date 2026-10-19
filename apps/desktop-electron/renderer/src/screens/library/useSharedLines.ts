import { useCallback, useRef } from "react";

/**
 * The Library's pane starts at its own top (with "All tracks"); nothing in it waits for the
 * right side. The one line it still shares is the table header's: the Collections section ends
 * on the divider that runs straight across to the header's rule, so the page reads as one grid.
 *
 * That needs room. The section is given the height that puts its bottom edge on the header's
 * bottom edge, as `--library-collections-min` (whole pixels), only when the pane can hold it and
 * still show the Playlists heading under it. Otherwise (a small window: the header sits far down)
 * the variable is removed and the pane is simply its content, never a blank band.
 *
 * The line is where the header sits with the search and filter bar on one line. When that bar
 * wraps (a narrow window, the queue open), the extra lines are left out, so the pane keeps its
 * own height and its Playlists heading stays put whatever the right side does (C198).
 *
 * Returns the ref for the body element, which sets the observers up when it mounts.
 */
/** How much taller the filter bar's rows are than one line each: the spread of their items' tops. */
function wrapped(body: HTMLElement): number {
  let extra = 0;
  for (const row of body.querySelectorAll<HTMLElement>(".cp-filter-bar__row")) {
    // Only the items drawn: a hidden one has an empty box at the top of the window.
    const tops = [...row.children]
      .map((child) => child.getBoundingClientRect())
      .filter((box) => box.width > 0 || box.height > 0)
      .map((box) => box.top);
    if (tops.length > 1) extra += Math.max(...tops) - Math.min(...tops);
  }
  return extra;
}

export function useSharedLines(): (body: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null);

  return useCallback((body: HTMLElement | null) => {
    stop.current?.();
    stop.current = null;
    if (!body || typeof ResizeObserver === "undefined") return;

    const NAME = "--library-collections-min";
    // What was last written ("" = removed): the property is only touched when its value changes.
    let written = "";
    const apply = (value: string) => {
      if (value === written) return;
      written = value;
      if (value) body.style.setProperty(NAME, value);
      else body.style.removeProperty(NAME);
    };
    const write = () => {
      const header = body.querySelector<HTMLElement>(".track-table__header");
      const all = body.querySelector<HTMLElement>(".cp-library-pane__all");
      const scroll = body.querySelector<HTMLElement>(".cp-library-pane__scroll");
      const next = body.querySelector<HTMLElement>(".cp-collections + .cp-playlist-pane > .cp-playlist-pane__head");
      // A folded Collections section is just its heading: no room is held for it.
      const folded = body.querySelector(".cp-collections .cp-playlist-pane__fold[aria-expanded='false']");
      if (!header || !all || !scroll || folded) {
        apply("");
        return;
      }
      const top = body.getBoundingClientRect().top;
      const target = Math.round(header.getBoundingClientRect().bottom - top - all.getBoundingClientRect().height - wrapped(body));
      const after = next ? next.getBoundingClientRect().height : 0;
      apply(target > 0 && target + after <= scroll.clientHeight ? `${target}px` : "");
    };

    const observer = new ResizeObserver(write);
    const SELECTORS = [".library-screen__main > div:first-child", ".library-toolbar", ".track-table__header", ".cp-library-pane__scroll"];
    let watched: (HTMLElement | null)[] = [];
    // Re-observes only when one of the elements itself was swapped for another.
    const watch = () => {
      const found = SELECTORS.map((selector) => body.querySelector<HTMLElement>(selector));
      if (found.length === watched.length && found.every((el, i) => el === watched[i])) return;
      watched = found;
      observer.disconnect();
      for (const el of found) if (el) observer.observe(el);
      observer.observe(body);
    };
    // The table (and its header) may mount after the body does: look again as the direct
    // children of the body and of its containers change (not the whole subtree: a virtualised
    // table mounts rows on every scroll frame), then measure.
    let frame = 0;
    const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => schedule());
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        observeChildren();
        watch();
        write();
      });
    };
    const observeChildren = () => {
      for (const el of [body, ...body.querySelectorAll<HTMLElement>(".library-screen__main, .cp-library-pane__scroll, .cp-library-pane")]) {
        mutations?.observe(el, { childList: true });
      }
    };
    observeChildren();
    // A fold toggle changes what the section needs, without adding or removing a child of these.
    const onClick = (event: Event) => {
      if ((event.target as Element | null)?.closest?.(".cp-playlist-pane__fold")) schedule();
    };
    body.addEventListener("click", onClick);
    watch();
    write();
    stop.current = () => {
      observer.disconnect();
      mutations?.disconnect();
      body.removeEventListener("click", onClick);
      if (frame) cancelAnimationFrame(frame);
      body.style.removeProperty(NAME);
    };
  }, []);
}
