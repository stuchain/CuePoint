/**
 * The header's language switch (DEC-311). The list is a <details>, so it opens and closes on a click without
 * this script; the script adds what a <details> does not do: close on a click anywhere else, close on Escape
 * (and give the focus back to the button), and close when the focus leaves the list by keyboard.
 */
export function initLangSwitch(root: Document = document): void {
  const switches = Array.from(root.querySelectorAll<HTMLDetailsElement>("details[data-lang-switch]"));
  if (switches.length === 0) return;

  const close = (el: HTMLDetailsElement) => {
    el.open = false;
  };

  root.addEventListener("click", (event) => {
    for (const el of switches) {
      if (el.open && !el.contains(event.target as Node)) close(el);
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const el of switches) {
      if (!el.open) continue;
      close(el);
      el.querySelector<HTMLElement>("summary")?.focus();
    }
  });

  for (const el of switches) {
    el.addEventListener("focusout", (event) => {
      const next = (event as FocusEvent).relatedTarget as Node | null;
      if (el.open && next && !el.contains(next)) close(el);
    });
  }
}

initLangSwitch();
