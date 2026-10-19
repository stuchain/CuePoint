import type { ComponentPropsWithRef } from "react";
import { Button } from "./Button";
import { Hint } from "./Hint";
import "./CloseButton.css";

interface CloseButtonProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** What it closes, for a screen reader and the hover tip: "Close" by default, "Close message" on a toast. */
  "aria-label"?: string;
  /** The button's shortcut ("Mod+I"), shown in its tip and its title. */
  shortcut?: string;
}

/**
 * The one close button: a small bordered square with a pixel ×, top right of every dialog, toast,
 * side panel and inspector. × only closes; taking a row or an entry out of a list is `RemoveButton`.
 * Its hover tip is its `aria-label`, so the words are written once.
 */
export function CloseButton({ className = "", "aria-label": label = "Close", shortcut, ...rest }: CloseButtonProps) {
  const button = (
    <Button
      variant="secondary"
      size="sm"
      iconOnly
      icon="close"
      aria-label={label}
      className={`cp-close ${className}`.trim()}
      {...rest}
    />
  );
  return (
    <Hint text={label} shortcut={shortcut}>
      {button}
    </Hint>
  );
}

/**
 * Takes one entry out of a list (a recent folder, a tag, a queue row). It is not a close button:
 * it uses the `remove` icon, so a row's × and a dialog's × never look the same.
 */
export function RemoveButton({ className = "", "aria-label": label = "Remove", shortcut, ...rest }: CloseButtonProps) {
  return (
    <Hint text={label} shortcut={shortcut}>
      <Button
        variant="secondary"
        size="sm"
        iconOnly
        icon="remove"
        aria-label={label}
        className={`cp-close cp-remove ${className}`.trim()}
        {...rest}
      />
    </Hint>
  );
}
