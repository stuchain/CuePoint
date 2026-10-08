/**
 * The Library's Clean operations, wired (CLEAN-13, DEC-072).
 *
 * What each entry does once chosen. Applying and editing go through ORG-11's
 * batch path — the same confirmation above the engine's threshold, the same
 * counts in the toast, the same revert — because they are batch operations.
 * Checking files is a job the status strip follows. Writing tags has a dialog
 * of its own, since a preview must answer before anything is written.
 *
 * Clean's Fix values tab renders the dialogs (FLW-12); the Library's selection
 * bar opens Clean with the tracks rather than running them here (FLW-8), and
 * keeps only the file check, which has no dialog.
 */
import { useCallback, useState, type ReactNode } from "react";

import type {
  BatchSelection,
  FileCheckStarted,
  OverrideField,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { APPLY_FIELD_LABELS } from "../clean/comparison";
import { trackCount } from "../clean/cleanFormat";
import { useCleanJob } from "../clean/useCleanJob";
import { ApplyValuesDialog } from "./ApplyValuesDialog";
import { EditValuesDialog } from "./EditValuesDialog";
import type { CleanMenuHandlers } from "./libraryClean";
import type { OverrideEdit } from "./libraryBatch";
import { editTarget } from "./metadataEdits";
import type { LibraryBatchController } from "./useLibraryBatch";
import { WriteTagsDialog } from "./WriteTagsDialog";
import { reportUnexpected } from "../../reporting/reporting";

/** The tracks an operation applies to (DEC-045). */
interface CleanTarget {
  selection: BatchSelection;
  count: number;
  /** The one track, when the target is exactly one known track. */
  trackId?: number | null;
}

interface LibraryCleanOptions {
  batch: LibraryBatchController;
  onMessage: (message: string, tone: "info" | "success" | "warning") => void;
  /** Called when a job this started has ended, or a single edit was saved. */
  onChanged: () => void;
}

interface LibraryClean {
  handlersFor: (target: CleanTarget) => CleanMenuHandlers;
  /** The dialogs, to render once in the page. */
  dialogs: ReactNode;
}

/** Fields as a sentence names them: "key, BPM and genre". */
export function fieldWords(fields: readonly OverrideField[]): string {
  const words = fields.map((field) => (field === "bpm" ? "BPM" : APPLY_FIELD_LABELS[field].toLowerCase()));
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type Open = { kind: "apply" | "edit" | "write"; target: CleanTarget } | null;

export function useLibraryClean({ batch, onMessage, onChanged }: LibraryCleanOptions): LibraryClean {
  const jobs = useCleanJob(onMessage);
  const [open, setOpen] = useState<Open>(null);

  const ended = useCallback(() => {
    onChanged();
    announceLibraryChange();
  }, [onChanged]);

  const handlersFor = useCallback(
    (target: CleanTarget): CleanMenuHandlers => {
      const bridge = window.cuepoint;
      const handlers: CleanMenuHandlers = {};
      // Applying and editing run as batches, and are offered by a build whose
      // engine has Clean — which its own routes say.
      if (bridge?.applyBatch && bridge.applyMatch) {
        handlers.onApply = () => setOpen({ kind: "apply", target });
      }
      if (bridge?.setTrackOverrides && (bridge.applyBatch || target.trackId != null)) {
        handlers.onEdit = () => setOpen({ kind: "edit", target });
      }
      if (bridge?.startFileCheck) {
        const start = bridge.startFileCheck;
        handlers.onCheckFiles = () =>
          void jobs.run<FileCheckStarted>(
            "check",
            () => start({ selection: target.selection }),
            {
              started: (answer) => `Checking the files of ${trackCount(answer.tracks)}.`,
              succeeded: "File check finished.",
              onEnded: ended,
            },
          );
      }
      if (bridge?.previewTagWrite && bridge.startTagWrite) {
        handlers.onWriteTags = () => setOpen({ kind: "write", target });
      }
      return handlers;
    },
    [ended, jobs],
  );

  const close = useCallback(() => setOpen(null), []);

  const apply = useCallback(
    (fields: OverrideField[]) => {
      if (!open) return;
      void batch.start({
        action: {
          kind: "apply_match",
          value: fields,
          target: fieldWords(fields),
        },
        selection: open.target.selection,
        count: open.target.count,
      });
    },
    [batch, open],
  );

  const edit = useCallback(
    async (change: OverrideEdit): Promise<string | null> => {
      if (!open) return "Nothing to edit.";
      const { target } = open;
      const single = window.cuepoint?.setTrackOverrides;
      if (target.count === 1 && target.trackId != null && single) {
        try {
          await single({ trackId: target.trackId, [change.field]: change.value });
        } catch (cause) {
          reportUnexpected(cause);
          return messageOf(cause);
        }
        onChanged();
        announceLibraryChange();
        return null;
      }
      let refusal: string | null = null;
      await batch.run(
        {
          action: { kind: "set_override", value: change, target: editTarget(change) },
          selection: target.selection,
          count: target.count,
        },
        { onRefused: (message) => (refusal = message) },
      );
      return refusal;
    },
    [batch, onChanged, open],
  );

  const dialogs = (
    <>
      <ApplyValuesDialog
        open={open?.kind === "apply"}
        count={open?.target.count ?? 0}
        onClose={close}
        onApply={apply}
      />
      <EditValuesDialog
        open={open?.kind === "edit"}
        count={open?.target.count ?? 0}
        onClose={close}
        onEdit={edit}
      />
      <WriteTagsDialog
        open={open?.kind === "write"}
        selection={open?.target.selection ?? null}
        count={open?.target.count ?? 0}
        onClose={close}
        onChanged={ended}
      />
    </>
  );

  return { handlersFor, dialogs };
}
