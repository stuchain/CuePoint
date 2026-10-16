import { useEffect, useState } from "react";

/**
 * Which of a page's sections is at the top of its scroll, so a link list can follow the
 * scroll (Scrolling, PAGES-12: the Settings section links). The current link is
 * marked whatever the motion setting is (T15); only its slide belongs to the scroll kind.
 */
/** The height of the page's sticky header in px (`--screen-header-height`, set by ScreenHeader), or 0. */
function headerHeight(section: HTMLElement): number {
  const host = section.closest<HTMLElement>(".screen");
  const value = host?.style.getPropertyValue("--screen-header-height") ?? "";
  const px = Number.parseFloat(value);
  return Number.isFinite(px) && px > 0 ? Math.round(px) : 0;
}

/** A section a link or the app asked for; `n` is new for each ask, so asking again re-pins it. */
export interface RequestedSection {
  id: string;
  n: number;
}

/**
 * The section the side menu marks. By default the first listed section in the top part of the
 * view. A section the person asked for (`requested`) is the one marked instead, until they scroll
 * or press a key themselves: the last sections cannot always be scrolled to the top, and the
 * section above would otherwise stay marked (Help > Privacy marked Rekordbox, About & updates
 * marked Privacy).
 */
export function useSectionInView(ids: readonly string[], requested: RequestedSection | null = null): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  // The ask that the person scrolled away from; an ask not in this is still pinned.
  const [released, setReleased] = useState<number | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver !== "function") {
      setCurrent(null);
      return;
    }
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first listed section that is in the top part of the view.
        setCurrent(ids.find((id) => visible.has(id)) ?? null);
      },
      // The band the top third of the scroll region makes, below the sticky header: a section is
      // "in view" once its top is in it. What the header covers does not count, or the section
      // above the one a link scrolled to (whose end is still behind the header) stayed current.
      {
        root: sections[0]!.closest(".app-main"),
        rootMargin: `${-headerHeight(sections[0]!)}px 0px -66% 0px`,
      },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [ids]);

  // The person takes over: the wheel, touch, a scroll key or any later scroll ends the pin.
  const asked = requested?.n ?? null;
  useEffect(() => {
    if (asked === null) return;
    const root = document.getElementById(requested!.id)?.closest(".app-main");
    if (!root) return;
    const release = () => setReleased(asked);
    // The jump the ask itself made (a smooth scroll) is over after a moment; any scroll after that
    // is the person's, a drag on the scrollbar included.
    const startedAt = Date.now();
    const onScroll = () => {
      if (Date.now() - startedAt > 1000) release();
    };
    const onKey = (event: Event) => {
      const key = (event as KeyboardEvent).key;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(key)) release();
    };
    root.addEventListener("wheel", release, { passive: true });
    root.addEventListener("touchmove", release, { passive: true });
    root.addEventListener("keydown", onKey);
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", release);
      root.removeEventListener("touchmove", release);
      root.removeEventListener("keydown", onKey);
    };
  }, [asked, requested]);

  if (requested && requested.n !== released) return requested.id;
  return current;
}
