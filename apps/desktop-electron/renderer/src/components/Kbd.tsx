import { Fragment } from "react";
import { shortcutLabel } from "./shell/platformKeys";

/**
 * Whether a shortcut is written as keys that can each be a cap: no spaces ("Menu key",
 * "Enter (while typing)" and "Play/Pause, Next, Previous" are one cap of words).
 */
function isKeyChord(keys: string): boolean {
  return !/\s/.test(keys);
}

/**
 * A keyboard shortcut drawn as a key cap, in the words of this platform (Ctrl+K, or the Command
 * sign on a Mac). Write the shortcut with `Mod` for the platform's modifier:
 * `<Kbd keys="Mod+Shift+A" />`.
 *
 * With `apart` (the Keyboard shortcuts list) each key of a chord is a cap of its own,
 * "Ctrl" "Shift" "A", the way a keyboard has them (M265); without it the chord is one cap,
 * as in a button's hint, where it must stay one small thing.
 */
export function Kbd({ keys, className = "", apart = false }: { keys: string; className?: string; apart?: boolean }) {
  if (!apart || !isKeyChord(keys)) {
    return <kbd className={`cp-kbd ${className}`.trim()}>{shortcutLabel(keys)}</kbd>;
  }
  const parts = keys.split("+").filter(Boolean);
  const mac = shortcutLabel("Mod") !== "Ctrl";
  return (
    <span className="cp-kbd-chord">
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          <kbd className={`cp-kbd ${className}`.trim()}>{shortcutLabel(part)}</kbd>
          {/* A "+" between caps is how a chord is read aloud; a Mac's glyph caps need none. */}
          {mac || index === parts.length - 1 ? null : (
            <span className="cp-kbd-chord__plus" aria-hidden="true">
              +
            </span>
          )}
        </Fragment>
      ))}
    </span>
  );
}
