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

export function useSectionInView(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);

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

  return current;
}
