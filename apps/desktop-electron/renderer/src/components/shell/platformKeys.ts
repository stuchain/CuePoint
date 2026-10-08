/** Whether this renderer runs on macOS, where the shortcut modifier is Cmd (not Ctrl). */
export function onMac(): boolean {
  return typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? "");
}

/** The name of the shortcut modifier on this platform, as shown to the user. */
export function modifierName(): "Cmd" | "Ctrl" {
  return onMac() ? "Cmd" : "Ctrl";
}

/**
 * Whether the shortcut modifier is down: Ctrl everywhere, and Cmd as well on macOS (the
 * Shortcuts list says Cmd stands in for Ctrl there). Other platforms' Meta key is the
 * system's and is left alone.
 */
export function hasShortcutModifier(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || (event.metaKey && onMac());
}
