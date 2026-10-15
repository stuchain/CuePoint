import type { ButtonHTMLAttributes } from "react";
import { PixelIcon } from "./PixelIcon";
import "./PlayButton.css";

interface PlayButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  /** Whether this row is the one playing now: the button then shows pause. */
  playing?: boolean;
  /** What it plays, for a screen reader: "Play Title", "Pause Title". */
  "aria-label": string;
}

/**
 * The one row play button: a 16px round outline button with a pixel play (or pause) mark. Put it
 * at the right end of a row (the table's `rowEnd`), never as the first column, and never a
 * second look for it.
 */
export function PlayButton({ playing = false, className = "", ...rest }: PlayButtonProps) {
  return (
    <button type="button" className={`cp-play-btn${playing ? " cp-play-btn--playing" : ""} ${className}`.trim()} {...rest}>
      <PixelIcon name={playing ? "pause" : "play"} />
    </button>
  );
}
