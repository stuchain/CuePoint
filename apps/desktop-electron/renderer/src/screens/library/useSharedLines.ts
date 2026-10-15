import { useCallback, useRef, type RefObject } from "react";

/**
 * The Library's pane and its table share their first two lines (library.css): the pane's
 * "All tracks" row is as tall as everything above the toolbar (search row, any note, a wrapped
 * second row of filters), and its Collections heading as tall as the toolbar. The right side
 * decides those heights, so they are measured here and written onto the body as
 * `--library-line-1` and `--library-line-2`, whole pixels; until then, and when nothing can be
 * measured, the stylesheet's one-line values stand.
 *
 * Returns the ref for the body element, which sets the observers up when it mounts.
 */
export function useSharedLines(searchRef: RefObject<HTMLElement | null>): (body: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null);

  return useCallback(
    (body: HTMLElement | null) => {
      stop.current?.();
      stop.current = null;
      if (!body || typeof ResizeObserver === "undefined") return;

      const write = () => {
        const search = searchRef.current;
        const toolbar = body.querySelector<HTMLElement>(".library-toolbar");
        for (const [name, el] of [
          ["--library-line-1", search],
          ["--library-line-2", toolbar],
        ] as const) {
          const height = el ? Math.round(el.getBoundingClientRect().height) : 0;
          if (height > 0) body.style.setProperty(name, `${height}px`);
          else body.style.removeProperty(name);
        }
      };

      const observer = new ResizeObserver(write);
      const search = searchRef.current;
      const toolbar = body.querySelector<HTMLElement>(".library-toolbar");
      if (search) observer.observe(search);
      if (toolbar) observer.observe(toolbar);
      write();
      stop.current = () => {
        observer.disconnect();
        body.style.removeProperty("--library-line-1");
        body.style.removeProperty("--library-line-2");
      };
    },
    [searchRef],
  );
}
