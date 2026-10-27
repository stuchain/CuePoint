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
import { Modal, Notice } from "../../components";
import type { RefreshDiff } from "../../api/cuepointBridge.types";
import { countNoun } from "../../format/counts";
import {
  applyLabel,
  diffLines,
  fileName,
  formatCount,
  needsReferenceConfirmation,
  referenceWarning,
  removalWarning,
} from "./libraryFormat";
import "./library.css";

interface RefreshPreviewDialogProps {
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
      size="large"
      // A refresh that removes tracks cannot be undone, so its main button is red (M275); one that
      // only adds and changes keeps the violet.
      variant={removed.count > 0 && !diff.is_empty ? "danger" : "default"}
      onClose={onCancel}
      // Nothing changed: an info-only dialog ends in one grey Close. Otherwise this is a decision,
      // and declining it is "Cancel", not "Close": declining changes nothing.
      closeLabel={diff.is_empty ? "Close" : undefined}
      secondaryAction={diff.is_empty ? undefined : { label: "Cancel", onClick: onCancel }}
      primaryAction={
        diff.is_empty
          ? undefined
          : {
              label: applyLabel(diff),
              onClick: () => onApply({ confirmReferences: acknowledged }),
              loading: applying,
              disabled: blocked,
              disabledReason: blocked ? "Tick the box above to continue." : undefined,
            }
      }
    >
      <div className="library-preview">
        <p className="library-preview__source">
          Compared against <strong>{fileName(diff.xml_path)}</strong>
        </p>

        {diff.is_empty ? (
          <p className="library-preview__empty">
            Your library already matches this file. Nothing would be added, changed
            or removed.
          </p>
        ) : (
          <>
            {removalNote && (
              <Notice kind="warning">{removalNote}</Notice>
            )}

            {referenceNote && (
              <Notice kind="danger">{referenceNote}</Notice>
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
                    and {countNoun(removed.count - Math.min(removed.items.length, SAMPLE_LIMIT), "more track")}
                  </p>
                )}
              </section>
            )}

            {mustAcknowledge && (
              <label className="library-preview__acknowledge cp-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>I understand this removes my own work on these tracks too</span>
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
