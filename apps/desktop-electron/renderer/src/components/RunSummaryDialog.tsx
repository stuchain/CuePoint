import { Modal } from "./Modal";
import type { RunSummaryView } from "../api/runSummaryUtils";
import { formatRunSummaryStats } from "../api/runSummaryUtils";
import "./RunSummaryDialog.css";

interface RunSummaryDialogProps {
  open: boolean;
  summary: RunSummaryView | null;
  onClose: () => void;
  onViewResults?: () => void;
}

export function RunSummaryDialog({
  open,
  summary,
  onClose,
  onViewResults,
}: RunSummaryDialogProps) {
  if (!summary) return null;

  return (
    <Modal
      open={open}
      title="Run Summary"
      onClose={onClose}
      secondaryAction={{ label: "Close", onClick: onClose }}
      primaryAction={
        onViewResults
          ? { label: "View Results", onClick: onViewResults }
          : undefined
      }
    >
      <div className="run-summary-dialog">
        <p className="run-summary-dialog__stats">{formatRunSummaryStats(summary)}</p>
        <p className="run-summary-dialog__playlist">
          {summary.isBatch
            ? `Batch: ${summary.playlistCount ?? 0} playlists`
            : `Playlist: ${summary.playlist}`}
        </p>
        <p className="run-summary-dialog__hint">
          Review matches on the Results screen, then export or sync tags with Rekordbox.
        </p>
      </div>
    </Modal>
  );
}
