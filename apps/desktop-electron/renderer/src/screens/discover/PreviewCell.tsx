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
  /** A Beatport track's id, or (with `kind: "candidate"`) a match candidate's. */
  beatportTrackId: number;
  title: string;
  /** Clean ▸ Table plays the candidate's sample (R4-7); Discover's rows are the catalog's. */
  kind?: "candidate" | "catalog";
}

export function PreviewCell({ beatportTrackId, title, kind = "catalog" }: PreviewCellProps) {
  // The row scrolls out of a virtualised table while its sample plays; the
  // table, not the cell, ends the sound (BeatportTable).
  const { state, toggle, canPreview } = useBeatportPreview(
    { kind, id: beatportTrackId },
    { stopOnUnmount: false },
  );
  if (!canPreview) return null;

  const playing = state === "playing";
  const none = state === "none";
  // Clean ▸ Table (R4-7): a candidate with no sample is a muted dash, not a button that waits.
  if (none && kind === "candidate") {
    return (
      <span className="preview-cell preview-cell--none" role="img" aria-label={`No preview for ${title}`} title="No preview">
        —
      </span>
    );
  }
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
