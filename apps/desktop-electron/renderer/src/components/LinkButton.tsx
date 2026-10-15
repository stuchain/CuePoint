import type { ButtonHTMLAttributes } from "react";

interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** A "go to" link: it ends in the arrow › ("Open Keys ›"). Leave it off for a link that acts here. */
  go?: boolean;
}

/** A link that is a button (it acts, it does not navigate the URL): the one link look, underlined on hover only. */
export function LinkButton({ go = false, className = "", type = "button", ...rest }: LinkButtonProps) {
  return <button type={type} className={`cp-link${go ? " cp-link--go" : ""} ${className}`.trim()} {...rest} />;
}
