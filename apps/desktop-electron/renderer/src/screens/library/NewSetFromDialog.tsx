/**
 * "New Set from…" (DEC-104, PREP-09).
 *
 * Offered on a Collection, a Smart Collection, a Rekordbox playlist and a
 * selection of tracks (PREP-12). It asks what a new node always asks — a name and a place in the tree, as "Save
 * as Smart Collection" does — and says, before anything is written, that the
 * Set is a copy and what that means for this source. Nothing is converted in
 * place: the source is left exactly as it was (DEC-104).
 *
 * The name starts as the source's, which is what the engine would call it
 * anyway, so accepting the dialog as it opens is the one-click path. A
 * selection has no name of its own, so it starts as "New Set".
 */
import { NameFolderDialog, type FolderOption } from "../../components/NameFolderDialog";
import { CREATE } from "../../format/words";
import { newSetFromExplanation, newSetFromTitle, type NewSetSource } from "./newSetFrom";

interface NewSetFromDialogProps {
  /** The source, or null when the dialog is closed. */
  source: NewSetSource | null;
  folders: readonly FolderOption[];
  busy?: boolean;
  /** Why the engine refused the last attempt, in its words. */
  error?: string | null;
  onCreate: (name: string, parentId: number | null) => void;
  onClose: () => void;
}

export function NewSetFromDialog({
  source,
  folders,
  busy = false,
  error = null,
  onCreate,
  onClose,
}: NewSetFromDialogProps) {
  return (
    <NameFolderDialog
      open={source !== null}
      title={source ? newSetFromTitle(source) : "New Set"}
      lead={source ? newSetFromExplanation(source) : ""}
      initialName={source?.name ?? ""}
      initialParentId={source?.parentId ?? null}
      folders={folders}
      submitLabel={CREATE}
      busy={busy}
      error={error}
      onSubmit={onCreate}
      onClose={onClose}
    />
  );
}
