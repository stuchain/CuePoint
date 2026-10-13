/**
 * The ▶/■ cell of a Beatport table (DEC-269): plays the track's 2-minute
 * sample, one sound at a time across the app (`useBeatportPreview`).
 *
 * A click here is the button's alone: it must not select the row the cell is
 * in. When Beatport has no sample (or cannot be reached) the button says so and
 * waits (still focusable), and the answer is remembered for a while.
 */
import { PixelIcon } from "../../components/PixelIcon";
import { useBeatportPreview } from "../../components/preview/useBeatportPreview";
import "./PreviewCell.css";

interface PreviewCellProps {
  beatportTrackId: number;
  title: string;
}

export function PreviewCell({ beatportTrackId, title }: PreviewCellProps) {
  // The row scrolls out of a virtualised table while its sample plays; the
  // table, not the cell, ends the sound (BeatportTable).
  const { state, toggle, canPreview } = useBeatportPreview(
    { kind: "catalog", id: beatportTrackId },
    { stopOnUnmount: false },
  );
  if (!canPreview) return null;

  const playing = state === "playing";
  const none = state === "none";
  return (
    <button
      type="button"
      className="preview-cell"
      aria-label={
        none
          ? `No preview for ${title}`
          : playing || state === "loading"
            ? `Stop preview of ${title}`
            : `Play preview of ${title}`
      }
      title={none ? "No preview" : playing || state === "loading" ? "Stop" : "Preview"}
      aria-busy={state === "loading" ? true : undefined}
      aria-disabled={none ? true : undefined}
      data-state={state}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!none) toggle();
      }}
    >
      <PixelIcon name={playing || state === "loading" ? "pause" : "play"} />
    </button>
  );
}
