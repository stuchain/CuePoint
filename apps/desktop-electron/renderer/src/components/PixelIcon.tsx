import { PIXEL_GRID_SIZE, pixelRunsFor, type PixelIconName } from "./pixelIcons";
import "./PixelIcon.css";

export interface PixelIconProps {
  name: PixelIconName;
  /**
   * Accessible name. Omit when the icon sits inside an already-labelled
   * control (a button with `aria-label`, say) so screen readers do not
   * announce the same thing twice.
   */
  title?: string;
  className?: string;
}

/**
 * Renders pixel artwork as an SVG whose rectangles inherit `currentColor`.
 *
 * `shapeRendering="crispEdges"` is what keeps it pixel art: it turns off
 * antialiasing on rectangle edges, so pixels stay square at any scale rather
 * than picking up soft borders the way a scaled bitmap would.
 */
export function PixelIcon({ name, title, className = "" }: PixelIconProps) {
  const runs = pixelRunsFor(name);
  const labelled = Boolean(title);

  return (
    <svg
      className={`cp-pixel-icon ${className}`.trim()}
      viewBox={`0 0 ${PIXEL_GRID_SIZE} ${PIXEL_GRID_SIZE}`}
      shapeRendering="crispEdges"
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
