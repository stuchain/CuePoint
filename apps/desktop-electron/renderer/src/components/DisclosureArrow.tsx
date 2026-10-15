import { PixelIcon } from "./PixelIcon";

/**
 * The one open / close arrow: a small pixel chevron, right when closed and down when open.
 * Decorative; the control that holds it carries `aria-expanded` and the name.
 */
export function DisclosureArrow({ open, className = "" }: { open: boolean; className?: string }) {
  return <PixelIcon name={open ? "chevron-down" : "chevron-right"} size="sm" className={`cp-disclosure ${className}`.trim()} />;
}
