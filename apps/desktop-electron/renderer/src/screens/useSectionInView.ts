import { useEffect, useState } from "react";
import { useMotion } from "../tokens/MotionContext";

/**
 * Which of a page's sections is at the top of its scroll, so a link list can follow the
 * scroll (Scrolling, PAGES-12: the Settings section links). Nothing is observed while the
 * kind is off or the system asks for reduced motion, and the answer is then null.
 */
export function useSectionInView(ids: readonly string[]): string | null {
  const moves = useMotion("scroll");
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!moves || typeof IntersectionObserver !== "function") {
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
      // The band the top third of the scroll region makes: a section is "in view" once its
      // top is in it.
      { root: sections[0]!.closest(".app-main"), rootMargin: "0px 0px -66% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [moves, ids]);

  return current;
}
