/**
 * DEC-032's preview, which is the whole reason a refresh has two steps.
 *
 * DEC-003 deletes tracks that have left Rekordbox and takes their ratings, tags
 * and history with them, and nothing brings those back. This dialog is where a
 * user finds that out *before* it happens, so its job is not to summarise
 * neutrally — it is to make the irreversible number the hardest thing on screen
 * to miss, and to let someone walk away without having changed anything.
 */
import { useEffect, useState } from "react";
import { Modal } from "../../components";
import type { RefreshDiff } from "../../api/cuepointBridge.types";
import {
  applyLabel,
  diffLines,
  fileName,
  formatCount,
  needsReferenceConfirmation,
  pluralize,
  referenceWarning,
  removalWarning,
} from "./libraryFormat";
import "./library.css";

export interface RefreshPreviewDialogProps {
  open: boolean;
  diff: RefreshDiff | null;
  applying: boolean;
  onCancel: () => void;
  onApply: (options: { confirmReferences: boolean }) => void;
}

/** How many examples to show under a category before saying "and N more". */
const SAMPLE_LIMIT = 8;

export function RefreshPreviewDialog({
  open,
  diff,
  applying,
  onCancel,
  onApply,
}: RefreshPreviewDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // A fresh preview is a fresh decision. Carrying the tick over from a previous
  // dialog would mean a second refresh applied against references nobody looked
  // at this time.
  useEffect(() => {
    setAcknowledged(false);
  }, [diff?.diff_id]);

  if (!diff) return null;

  const removed = diff.tracks.removed;
  const removalNote = removalWarning(diff);
  const referenceNote = referenceWarning(diff);
  const mustAcknowledge = needsReferenceConfirmation(diff);
  const blocked = mustAcknowledge && !acknowledged;

  return (
    <Modal
      open={open}
      title={diff.is_empty ? "Nothing has changed" : "Review this refresh"}
      size="wide"
      onClose={onCancel}
      secondaryAction={
        diff.is_empty
          ? undefined
          : // "Cancel", not "Close": this is a decision being declined, and the
            // acceptance criterion is that declining changes nothing.
            { label: "Cancel", onClick: onCancel }
      }
      primaryAction={
        diff.is_empty
          ? { label: "Close", onClick: onCancel }
          : {
              label: applyLabel(diff),
              onClick: () => onApply({ confirmReferences: acknowledged }),
              loading: applying,
              disabled: blocked,
            }
      }
    >
      <div className="library-preview">
        <p className="library-preview__source">
          Compared against <strong>{fileName(diff.xml_path)}</strong>
        </p>

        {diff.is_empty ? (
          <p className="library-preview__empty">
            Your library already matches this export. Nothing would be added, changed
            or removed.
          </p>
        ) : (
          <>
            {removalNote && (
              <p className="library-preview__warning" role="alert">
                {removalNote}
              </p>
            )}

            {referenceNote && (
              <p className="library-preview__warning library-preview__warning--refs" role="alert">
                {referenceNote}
              </p>
            )}

            <dl className="library-preview__counts">
              {diffLines(diff).map((line) => (
                <div
                  key={line.key}
                  className={
                    line.destructive && line.count > 0
                      ? "library-preview__count library-preview__count--destructive"
                      : "library-preview__count"
                  }
                >
                  <dt>{line.label}</dt>
                  <dd data-testid={`count-${line.key}`}>{formatCount(line.count)}</dd>
                </div>
              ))}
            </dl>

            {removed.count > 0 && (
              <section className="library-preview__samples">
                <h3 className="library-preview__samples-title">
                  Tracks that would be deleted
                </h3>
                <ul>
                  {removed.items.slice(0, SAMPLE_LIMIT).map((track) => (
                    <li key={track.rekordbox_track_id}>
                      <span className="library-preview__track-title">{track.title}</span>
                      <span className="library-preview__track-artist">{track.artist}</span>
                    </li>
                  ))}
                </ul>
                {removed.count > Math.min(removed.items.length, SAMPLE_LIMIT) && (
                  <p className="library-preview__more">
                    and {pluralize(removed.count - Math.min(removed.items.length, SAMPLE_LIMIT), "more track")}
                  </p>
                )}
              </section>
            )}

            {mustAcknowledge && (
              <label className="library-preview__acknowledge">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>I understand this changes my Collections and Sets too</span>
              </label>
            )}

            {blocked && (
              <p className="library-preview__blocked">
                Tick the box above to continue.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
