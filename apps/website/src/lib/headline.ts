/**
 * The home page's headline build (SITE-06). A light runs through the headline letter by letter: each one
 * is pressed flat (its extruded shadow goes) and lit in a Camelot key's color, then springs back to full
 * depth, the way the wheel lights key by key in the scene below it.
 *
 * Built for the page's budgets:
 *   - the headline is on screen, whole, from the first paint (it is the page's largest paint): nothing
 *     hides it and nothing waits for this script;
 *   - only color and text-shadow are animated, which lay nothing out, so there is no layout shift; and
 *     the split into letters is undone at once, in the same task, if it would rewrap a line;
 *   - it runs once, when the live scene fades in (or a little after the page is idle where the scene will
 *     not run), and never with reduced motion;
 *   - screen readers hear the heading once: the letters are aria-hidden and the heading carries its text.
 * No GSAP: a few lines of the Web Animations API keep it out of the 3D chunk and well inside the budget
 * for the page's first JavaScript.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";
/** The accent tokens the light cycles through, as the wheel's cells are colored. */
const KEY_TOKENS = ["--accent-primary", "--accent-success", "--accent-warning", "--accent-danger", "--accent-info"] as const;
export const LETTER_STAGGER_MS = 26;
export const LETTER_MS = 560;
/** Where the scene will not run, how long after the page is idle the headline builds anyway. */
export const FALLBACK_MS = 2600;

/** The headline's text in words and the spaces between them, as the split will lay them out. */
export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** The flat shadow a pressed letter has: the same shadows as its depth, with no offset, so they interpolate. */
export function flatShadow(depth: string): string {
  return depth
    .split(/,(?![^(]*\))/)
    .map((shadow) => shadow.trim().replace(/-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px/, "0px 0px"))
    .join(", ");
}

/**
 * Splits the heading into letters (each word kept whole, so lines break where they did) and runs the
 * light through them. Returns the animations, or none when the split would move the text.
 */
export function buildHeadline(h1: HTMLElement, win: Window = window): Animation[] {
  if (win.matchMedia(REDUCED).matches || typeof h1.animate !== "function") return [];
  const text = (h1.textContent ?? "").trim();
  if (text === "" || h1.dataset["built"] === "true") return [];
  const before = h1.getBoundingClientRect();
  const original = Array.from(h1.childNodes);

  const letters: HTMLElement[] = [];
  const holder = document.createElement("span");
  holder.setAttribute("aria-hidden", "true");
  for (const part of splitWords(text)) {
    if (/^\s+$/.test(part)) {
      holder.append(" ");
      continue;
    }
    const word = document.createElement("span");
    word.style.whiteSpace = "nowrap";
    for (const ch of part) {
      const letter = document.createElement("span");
      letter.textContent = ch;
      word.append(letter);
      letters.push(letter);
    }
    holder.append(word);
  }
  h1.replaceChildren(holder);
  const after = h1.getBoundingClientRect();
  if (Math.abs(after.height - before.height) > 0.5 || Math.abs(after.width - before.width) > 0.5) {
    h1.replaceChildren(...original); // it would rewrap: leave the heading as it was, before any paint
    return [];
  }
  h1.setAttribute("aria-label", text);
  h1.dataset["built"] = "true";

  const style = win.getComputedStyle(h1);
  const depth = style.textShadow && style.textShadow !== "none" ? style.textShadow : "0px 0px 0px transparent";
  const flat = flatShadow(depth);
  const ink = style.color;
  const root = win.getComputedStyle(win.document.documentElement);
  const keys = KEY_TOKENS.map((t) => root.getPropertyValue(t).trim()).filter((c) => c !== "");
  return letters.map((letter, i) =>
    letter.animate(
      [
        { color: ink, textShadow: depth },
        { color: keys[i % Math.max(1, keys.length)] ?? ink, textShadow: flat, offset: 0.35 },
        { color: ink, textShadow: depth },
      ],
      { duration: LETTER_MS, delay: i * LETTER_STAGGER_MS, easing: "steps(6, jump-none)" },
    ),
  );
}

/**
 * Calls `run` once: when the scene starts running (its canvas fading in), or FALLBACK_MS after the page is
 * idle if it has not by then. Never with reduced motion.
 */
export function startWhenAlive(scene: HTMLElement, run: () => void, win: Window = window): void {
  if (win.matchMedia(REDUCED).matches) return;
  let done = false;
  const go = () => {
    if (done || win.matchMedia(REDUCED).matches) return;
    done = true;
    observer.disconnect();
    void (win.document.fonts?.ready ?? Promise.resolve()).then(run);
  };
  const observer = new MutationObserver(() => {
    if (scene.dataset["sceneState"] === "running") win.setTimeout(go, 250);
  });
  observer.observe(scene, { attributes: true, attributeFilter: ["data-scene-state"] });
  const idle = () => {
    const later = () => win.setTimeout(go, FALLBACK_MS);
    if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(later, { timeout: 3000 });
    else later();
  };
  if (win.document.readyState === "complete") idle();
  else win.addEventListener("load", idle, { once: true });
}
