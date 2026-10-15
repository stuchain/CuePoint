import { PIXEL_GRID_SIZE, pixelRunsFor, type PixelIconName } from "./pixelIcons";
import "./PixelIcon.css";

interface PixelIconProps {
  name: PixelIconName;
  /**
   * Accessible name. Omit when the icon sits inside an already-labelled
   * control (a button with `aria-label`, say) so screen readers do not
   * announce the same thing twice.
   */
  title?: string;
  className?: string;
  /**
   * One of three sizes, and no other: `"sm"` 12, `"md"` 16, `"lg"` 24 (the default), each times
   * the text size and a whole multiple of the 12-unit grid, so no art pixel is fractional.
   */
  size?: PixelIconSize;
}

export type PixelIconSize = "sm" | "md" | "lg";

/**
 * Renders pixel artwork as an SVG whose rectangles inherit `currentColor`.
 *
 * `shapeRendering="crispEdges"` is what keeps it pixel art: it turns off
 * antialiasing on rectangle edges, so pixels stay square at any scale rather
 * than picking up soft borders the way a scaled bitmap would.
 */
export function PixelIcon({ name, title, className = "", size = "lg" }: PixelIconProps) {
  const runs = pixelRunsFor(name);
  const labelled = Boolean(title);

  return (
    <svg
      className={`cp-pixel-icon${size === "lg" ? "" : ` cp-pixel-icon--${size}`} ${className}`.trim()}
      viewBox={`0 0 ${PIXEL_GRID_SIZE} ${PIXEL_GRID_SIZE}`}
      shapeRendering="crispEdges"
      data-size={size}
      focusable="false"
      role={labelled ? "img" : "presentation"}
      aria-hidden={labelled ? undefined : true}
      data-icon={name}
    >
      {labelled ? <title>{title}</title> : null}
      {runs.map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
