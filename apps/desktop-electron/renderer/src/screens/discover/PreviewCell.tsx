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
  /**
   * `"round"` is Discover's tables: a small round ▶ in the accent colour named
   * "Preview {title}", and ■ with moving bars while it plays. Clean keeps the bare icon.
   */
  variant?: "round";
}

export function PreviewCell({ beatportTrackId, title, kind = "catalog", variant }: PreviewCellProps) {
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
  const round = variant === "round";
  return (
    <button
      type="button"
      className={`preview-cell${round ? " preview-cell--round" : ""}`}
      aria-label={
        none
          ? `No preview for ${title}`
          : playing || state === "loading"
            ? `Stop preview of ${title}`
            : round
              ? `Preview ${title}`
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
      {round ? (
        <>
          <span className="preview-cell__disc" aria-hidden="true">
            {playing || state === "loading" ? (
              <span className="preview-cell__stop" />
            ) : (
              <PixelIcon name="play" />
            )}
          </span>
          {playing && (
            <span className="preview-cell__bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
        </>
      ) : (
        <PixelIcon name={playing || state === "loading" ? "pause" : "play"} />
      )}
    </button>
  );
}
