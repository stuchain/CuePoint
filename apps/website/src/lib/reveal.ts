/**
 * The once-only fade-up of blocks marked [data-reveal] (the inner pages' rows and cards). Only a block
 * that starts below the first screen is held back, so nothing the visitor sees on arrival ever waits, and
 * the largest paint is never one of them. With reduced motion, or without IntersectionObserver, nothing
 * is held. The styles are in global.css ([data-reveal="pending"] and [data-reveal="shown"]).
 */

/** Whether a block whose top is at `top` (px from the top of the viewport) waits to be revealed. */
export function holdsBack(top: number, viewportHeight: number, reducedMotion: boolean): boolean {
  return !reducedMotion && top >= viewportHeight;
}

export function startReveal(doc: Document = document, win: Window = window): void {
  // the observer is the page's own (win is the page's window); the check keeps old browsers out
  const blocks = [...doc.querySelectorAll<HTMLElement>("[data-reveal]")];
  if (blocks.length === 0 || !("IntersectionObserver" in win)) return;
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const height = win.innerHeight;
  const observer = new IntersectionObserver(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset["reveal"] = "shown";
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -6% 0px" },
  );
  for (const block of blocks) {
    if (!holdsBack(block.getBoundingClientRect().top, height, reduced)) continue;
    block.dataset["reveal"] = "pending";
    observer.observe(block);
  }
}
