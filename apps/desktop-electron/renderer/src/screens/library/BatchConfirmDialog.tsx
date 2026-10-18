/**
 * The question asked before a big batch runs (LIB-11, DEC-045).
 *
 * Above the engine's threshold a batch is a job, and starting one over 1,000
 * tracks is rarely an accident worth allowing. The title carries the
 * number, the consequence says it runs in the background, where the record of
 * it is and how to undo it. Fix values uses it; the Library's own question is
 * LIB-11's to move here.
 */
import { Modal } from "../../components";
import { batchConsequence } from "./libraryBatch";
import type { LibraryBatchController } from "./useLibraryBatch";

interface BatchConfirmDialogProps {
  batch: LibraryBatchController;
}

export function BatchConfirmDialog({ batch }: BatchConfirmDialogProps) {
  const pending = batch.pending;
  // Verb + how many: copying Beatport's values says so; every other kind changes tracks.
  const verb = pending?.action.kind === "apply_match" ? "Copy to" : "Change";
  const many = pending ? `${pending.count.toLocaleString()} ${pending.count === 1 ? "track" : "tracks"}` : "tracks";
  return (
    <Modal
      open={pending !== null}
      title={pending ? `${verb} ${many}?` : "Change tracks?"}
      onClose={batch.cancel}
      size="small"
      primaryAction={{
        label: `${verb} ${many}`,
        onClick: () => void batch.confirm(),
        loading: batch.busy,
      }}
      secondaryAction={{ label: "Cancel", onClick: batch.cancel }}
    >
      <p>{batch.question}</p>
      {pending && (
        <p>
          {batchConsequence(pending.action.kind, pending.action.holder)}
        </p>
      )}
    </Modal>
  );
}
