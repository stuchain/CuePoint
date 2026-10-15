import type { ComponentPropsWithRef } from "react";
import { Button } from "./Button";
import "./CloseButton.css";

interface CloseButtonProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** What it closes, for a screen reader: "Close" by default, "Close message" on a toast. */
  "aria-label"?: string;
}

/**
 * The one close button: a bordered 20px square with a pixel ×, top right of every dialog, toast,
 * side panel and inspector. × only closes; removing a row or an entry has its own icon (`remove`).
 */
export function CloseButton({ className = "", "aria-label": label = "Close", ...rest }: CloseButtonProps) {
  return (
    <Button
      variant="secondary"
      iconOnly
      icon="close"
      aria-label={label}
      className={`cp-close ${className}`.trim()}
      {...rest}
    />
  );
}
