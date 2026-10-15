import { shortcutLabel } from "./shell/platformKeys";

/**
 * A keyboard shortcut drawn as a key cap, in the words of this platform (Ctrl+K, or the Command
 * sign on a Mac). Write the shortcut with `Mod` for the platform's modifier:
 * `<Kbd keys="Mod+Shift+A" />`.
 */
export function Kbd({ keys, className = "" }: { keys: string; className?: string }) {
  return <kbd className={`cp-kbd ${className}`.trim()}>{shortcutLabel(keys)}</kbd>;
}
