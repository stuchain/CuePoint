/**
 * A track's cue points and beat grid in the Inspector's imported record (WAVE-04).
 *
 * Read-only, like everything Rekordbox sent (DEC-118): nothing here edits a
 * mark, and the export never writes one. Each cue is one line in the order the
 * track plays them, with Rekordbox's own colour beside it when it gave one; the
 * grid is one line. Drawn on the waveform from WAVE-06, and listed here still,
 * so no mark is only a picture.
 */
import type { TrackMarksSummary } from "../../api/cuepointBridge.types";
import {
  MARKS_NOT_READ,
  VARIABLE_GRID_HINT,
  beatGridLine,
  cueLine,
  cuesInTrackOrder,
} from "./trackMarks";

interface TrackMarksSectionProps {
  /** Absent from an engine older than WAVE-04, which draws nothing. */
  marks: TrackMarksSummary | undefined;
}

export function TrackMarksSection({ marks }: TrackMarksSectionProps) {
  if (!marks) return null;
  const grid = beatGridLine(marks.beat_grid, marks.read);
  const cues = cuesInTrackOrder(marks.cues);
  return (
    <div className="cp-track-detail__marks">
      {!marks.read && marks.cues.length === 0 && (
        <p className="cp-track-detail__marks-note">{MARKS_NOT_READ}</p>
      )}
      {cues.length > 0 && (
        <ul className="cp-track-detail__cues">
          {cues.map((cue, index) => (
            <li key={`${cue.start_ms}-${cue.hot_cue ?? "m"}-${index}`} className="cp-track-detail__cue">
              <span
                className="cp-track-detail__cue-colour"
                aria-hidden="true"
                data-colour={cue.color ?? undefined}
                style={cue.color ? { backgroundColor: cue.color } : undefined}
              />
              {cueLine(cue)}
            </li>
          ))}
        </ul>
      )}
      {grid && (
        <p
          className="cp-track-detail__grid"
          title={marks.beat_grid?.variable ? VARIABLE_GRID_HINT : undefined}
        >
          {grid}
        </p>
      )}
    </div>
  );
}
