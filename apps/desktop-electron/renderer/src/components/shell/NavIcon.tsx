import { PIXEL_GRID_SIZE, toPixelRuns } from "../pixelIcons";
import { PixelIcon } from "../PixelIcon";
import type { NavDestination } from "./navRegistry";

/**
 * Discover's own icon (C229). The registry's `discover` art is a magnifier, which is also what
 * the Search field wears, so in the rail the two read as one. Discover is drawn here as a gem
 * instead: a diamond with a spark inside, "something to find". It lives beside the sidebar until
 * the shared icon set takes it as its own entry.
 */
const DISCOVER_ART = [
  "............",
  ".....##.....",
  "....####....",
  "...##..##...",
  "..##....##..",
  ".##..##..##.",
  ".##..##..##.",
  "..##....##..",
  "...##..##...",
  "....####....",
  ".....##.....",
  "............",
] as const;

const DISCOVER_RUNS = toPixelRuns(DISCOVER_ART);

/** The icon a destination wears in the rail: its registry icon, or the local art for Discover. */
export function NavIcon({ destination }: { destination: NavDestination }) {
  if (destination.id === "discover") {
    return (
      <svg
        className="cp-pixel-icon"
        viewBox={`0 0 ${PIXEL_GRID_SIZE} ${PIXEL_GRID_SIZE}`}
        shapeRendering="crispEdges"
        data-size="lg"
        focusable="false"
        role="presentation"
        aria-hidden={true}
        data-icon="discover-gem"
      >
        {DISCOVER_RUNS.map((run) => (
          <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} fill="currentColor" />
        ))}
      </svg>
    );
  }
  return destination.icon ? <PixelIcon name={destination.icon} /> : <span className="cp-sidebar__glyph">{destination.glyph}</span>;
}
