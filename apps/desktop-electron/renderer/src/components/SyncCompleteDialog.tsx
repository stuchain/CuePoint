import { Modal } from "./Modal";
import type { SyncTagsResponse } from "../api/syncTagsUtils";
import "./SyncCompleteDialog.css";

export interface SyncCompleteDialogProps {
  open: boolean;
  result: SyncTagsResponse | null;
  onClose: () => void;
}

export function SyncCompleteDialog({ open, result, onClose }: SyncCompleteDialogProps) {
  if (!open || !result) return null;

  const hasErrors = result.errors.length > 0;
  const hasWavSkipped = (result.wav_skipped_count ?? result.wav_skipped.length) > 0;

  return (
    <Modal open={open} title="Sync with Rekordbox" onClose={onClose} primaryAction={{ label: "OK", onClick: onClose }}>
      <div className="sync-complete-dialog">
        <p>
          {result.written} written, {result.failed} failed.
        </p>
        <p className="sync-complete-dialog__hint">
          Go back to Rekordbox, select the processed tracks, right-click, and choose Reload Tags.
        </p>
        {hasWavSkipped && (
          <div className="sync-complete-dialog__section">
            <p className="sync-complete-dialog__label">
              WAV tracks skipped (Rekordbox cannot read tags from WAV):
            </p>
            <ul className="sync-complete-dialog__list">
              {result.wav_skipped.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
            {(result.wav_skipped_count ?? 0) > result.wav_skipped.length && (
              <p className="sync-complete-dialog__muted">
                …and {(result.wav_skipped_count ?? 0) - result.wav_skipped.length} more
              </p>
            )}
          </div>
        )}
        {hasErrors && (
          <div className="sync-complete-dialog__section">
            <p className="sync-complete-dialog__label">Failed tracks:</p>
            <ul className="sync-complete-dialog__list">
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
            {result.errors_truncated && (
              <p className="sync-complete-dialog__muted">Additional errors were truncated.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
