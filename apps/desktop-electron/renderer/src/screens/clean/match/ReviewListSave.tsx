/**
 * Save a search's review list as a file (CLN-11, K12).
 *
 * It lives beside each run in Past searches: it saves that run's own list, not
 * whatever the Table happens to show. The native save dialog has already asked
 * about replacing a file that is there, so the engine is told the answer
 * rather than asking again.
 */
import { useCallback, useState } from "react";

import type { MatchRun, ReviewExportFormat } from "../../../api/cuepointBridge.types";
import { Modal, useToast } from "../../../components";
import { Select } from "../../../components/Select";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { reportUnexpected } from "../../../reporting/reporting";
import { exportedLine } from "../cleanFormat";
import { runSelection } from "./matchScope";
import { whatLine } from "./pastSearchWords";

const EXPORT_FORMATS: Array<{ value: ReviewExportFormat; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel" },
  { value: "json", label: "JSON" },
];

/** `review-list-<what>-<YYYY-MM-DD>.<ext>`, safe on every file system. */
function reviewListFileName(run: MatchRun, extension: string): string {
  const what = whatLine(run)
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60);
  const created = new Date(run.created_at);
  const day = (Number.isNaN(created.getTime()) ? new Date() : created).toLocaleDateString("en-CA");
  return ["review-list", what, day].filter(Boolean).join("-") + `.${extension}`;
}

interface ReviewListSaveProps {
  /** The run to save; kept after closing so the window can play its exit as it was. */
  run: MatchRun | null;
  open: boolean;
  onClose: () => void;
}

export function ReviewListSave({ run, open, onClose }: ReviewListSaveProps) {
  const { push } = useToast();
  const [format, setFormat] = useState<ReviewExportFormat>("csv");
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!run) return;
    const pick = window.cuepoint?.saveExportFileDialog;
    const write = window.cuepoint?.exportReviewList;
    if (!pick || !write) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    const extension = format === "excel" ? "xlsx" : format;
    setSaving(true);
    try {
      const picked = await pick({ defaultPath: reviewListFileName(run, extension), format: extension });
      if (picked.canceled) return;
      const written = await write({
        selection: runSelection(run.job_id),
        format,
        file_path: picked.filePath,
        overwrite: true,
      });
      onClose();
      push(exportedLine(written.count, written.file_path), "success");
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause), "warning");
    } finally {
      setSaving(false);
    }
  }, [format, onClose, push, run]);

  return (
    <Modal
      open={open && run !== null}
      title="Save review list as a file"
      onClose={onClose}
      primaryAction={{ label: "Choose where to save…", onClick: () => void save(), loading: saving }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <p className="cp-modal__lead">
        Saves the tracks of this search - with their match state and Beatport link - as a
        spreadsheet you can share or check by hand.
      </p>
      <Select
        label="Format"
        id="match-export-format"
        value={format}
        onChange={(event) => setFormat(event.target.value as ReviewExportFormat)}
        options={EXPORT_FORMATS}
      />
    </Modal>
  );
}
