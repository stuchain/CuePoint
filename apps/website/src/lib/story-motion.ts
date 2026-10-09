/**
 * The home page's story plates, as the live scene plays under them (SITE-06). Each plate is the text of
 * one step of the story; as it comes up to its reading line it is printed onto the screen from the left
 * in hard pixel steps (a stepped clip-path, the way the app's panels open), and its number lights. The
 * motion says "this is the step now" and hands the screen over to it; it carries no meaning the text
 * does not, so a visitor who never sees it misses nothing.
 *
 * Budgets and fallbacks:
 *   - the page loads this only once the live scene runs (so after the 3D chunk, whose GSAP it shares):
 *     it is never in the page's first JavaScript, and where the scene does not run the plates simply
 *     stand on the page;
 *   - the plates are visible by default; a plate already past its reading line when this loads is set at
 *     its end state, so nothing flashes;
 *   - gsap.matchMedia holds it to `prefers-reduced-motion: no-preference`, and reverts it (the plates
 *     back to plain, still text) the moment reduced motion turns on;
 *   - only clip-path and transform change, which lay nothing out.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Steps in the print-in: few and hard, like the app's own stepped motion (--motion-steps-long is 4). */
export const PRINT_STEPS = 6;
/** Where a plate starts and finishes printing, as ScrollTrigger reads them (the plate's top against the screen). */
export const PRINT_RANGE = { start: "top 96%", end: "top 64%" } as const;
/** The clip that hides a plate: its whole box and the overhanging number and shadow, from the right. */
export const HIDDEN_CLIP = "inset(-3rem 100% -3rem -3rem)";
export const SHOWN_CLIP = "inset(-3rem -3rem -3rem -3rem)";

export function startStoryMotion(plates: readonly HTMLElement[]): () => void {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    for (const plate of plates) {
      const trigger = plate.closest<HTMLElement>("[data-step]") ?? plate;
      gsap.fromTo(
        plate,
        { clipPath: HIDDEN_CLIP, x: -16 },
        {
          clipPath: SHOWN_CLIP,
          x: 0,
          ease: `steps(${PRINT_STEPS})`,
          scrollTrigger: { trigger, start: PRINT_RANGE.start, end: PRINT_RANGE.end, scrub: true },
        },
      );
    }
  });
  return () => mm.revert();
}
