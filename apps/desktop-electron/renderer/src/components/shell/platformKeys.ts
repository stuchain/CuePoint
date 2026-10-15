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

/**
 * A shortcut written once with the platform-neutral names (`Mod+Shift+K`) in the words this
 * platform uses: "Ctrl+Shift+K", or the Command / Shift signs joined on a Mac. `Mod` is Ctrl or
 * the Command key, `Alt` is Alt or the Option key.
 */
export function shortcutLabel(keys: string): string {
  const parts = keys
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!onMac()) return parts.map((part) => (part === "Mod" ? "Ctrl" : part)).join("+");
  const mac: Record<string, string> = { Mod: "\u2318", Shift: "\u21E7", Alt: "\u2325", Ctrl: "\u2303" };
  return parts.map((part) => mac[part] ?? part).join("");
}
