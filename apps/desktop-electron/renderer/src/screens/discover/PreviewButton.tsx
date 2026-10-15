/**
 * The play button of a Beatport table's row (DEC-269): the app's one round row button
 * (`PlayButton`), at the right end of the row, playing the track's 2-minute sample. One
 * sound at a time across the app (`useBeatportPreview`).
 *
 * A click here is the button's alone: it must not select the row it is in. When Beatport
 * has no sample (or cannot be reached) the button says so and waits (still focusable),
 * and the answer is remembered for a while.
 */
import { Hint } from "../../components/Hint";
import { PlayButton } from "../../components/PlayButton";
import { useBeatportPreview } from "../../components/preview/useBeatportPreview";

interface PreviewButtonProps {
  /** A Beatport track's id. */
  beatportTrackId: number;
  title: string;
}

export function PreviewButton({ beatportTrackId, title }: PreviewButtonProps) {
  // The row scrolls out of a virtualised table while its sample plays; the
  // table, not the button, ends the sound (BeatportTable).
  const { state, toggle, canPreview } = useBeatportPreview(
    { kind: "catalog", id: beatportTrackId },
    { stopOnUnmount: false },
  );
  if (!canPreview) return null;

  const sounding = state === "playing" || state === "loading";
  const none = state === "none";
  return (
    <Hint text={none ? "No preview" : sounding ? "Stop" : "Play the preview"} portal>
      <PlayButton
        playing={sounding}
        aria-label={
          none
            ? `No preview for ${title}`
            : sounding
              ? `Stop preview of ${title}`
              : `Play preview of ${title}`
        }
        aria-busy={state === "loading" ? true : undefined}
        aria-disabled={none ? true : undefined}
        data-state={state}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (!none) toggle();
        }}
      />
    </Hint>
  );
}
