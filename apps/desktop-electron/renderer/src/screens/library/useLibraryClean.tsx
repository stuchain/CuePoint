/**
 * The Library's Clean operations, wired (CLEAN-13, DEC-072).
 *
 * What each entry does once chosen. Applying and editing go through ORG-11's
 * batch path — the same confirmation above the engine's threshold, the same
 * counts in the toast, the same revert — because they are batch operations.
 * Saving to the files has a window of its own, which reads the files before it can
 * save anything and announces its own library change.
 *
 * Clean's Fix values tab renders the dialogs (FLW-12); the Library's selection
 * bar opens Clean with the tracks rather than running them here (FLW-8). The file
 * check is Clean's (Clean ▸ Missing files), not an entry here.
 */
import { useCallback, useState, type ReactNode } from "react";

import type {
  BatchSelection,
  OverrideField,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { APPLY_FIELD_LABELS } from "../clean/comparison";
import { SaveToFilesDialog } from "../../components/saveToFiles/SaveToFilesDialog";
import { ApplyValuesDialog } from "./ApplyValuesDialog";
import { EditValuesDialog } from "./EditValuesDialog";
import type { CleanMenuHandlers } from "./libraryClean";
import type { OverrideEdit } from "./libraryBatch";
import { editTarget } from "./metadataEdits";
import type { LibraryBatchController } from "./useLibraryBatch";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

/** The tracks an operation applies to (DEC-045). */
interface CleanTarget {
  selection: BatchSelection;
  count: number;
  /** The one track, when the target is exactly one known track. */
  trackId?: number | null;
}

interface LibraryCleanOptions {
  batch: LibraryBatchController;
  /** Called when an edit or an applied batch has changed tracks. */
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

type Open = { kind: "apply" | "edit" | "write"; target: CleanTarget } | null;

export function useLibraryClean({ batch, onChanged }: LibraryCleanOptions): LibraryClean {
  const [open, setOpen] = useState<Open>(null);

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
      if (bridge?.previewTagWrite && bridge.startTagWrite) {
        handlers.onWriteTags = () => setOpen({ kind: "write", target });
      }
      return handlers;
    },
    [],
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

  // The same selection the apply uses, so the count is the apply's. Left out when the build's
  // engine cannot count; the dialog then says the selection's size.
  const previewApply = useCallback(
    (fields: OverrideField[]) =>
      window.cuepoint!.previewApplyMatch!({ fields, selection: open!.target.selection }),
    [open],
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
          return userMessage(cause);
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
        preview={open?.kind === "apply" && window.cuepoint?.previewApplyMatch ? previewApply : undefined}
      />
      <EditValuesDialog
        open={open?.kind === "edit"}
        count={open?.target.count ?? 0}
        onClose={close}
        onEdit={edit}
      />
      <SaveToFilesDialog
        open={open?.kind === "write"}
        selection={open?.target.selection ?? null}
        count={open?.target.count ?? 0}
        onClose={close}
        onChanged={onChanged}
      />
    </>
  );

  return { handlersFor, dialogs };
}
