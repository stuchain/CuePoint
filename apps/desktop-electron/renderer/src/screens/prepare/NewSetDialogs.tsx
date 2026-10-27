/**
 * The Prepare page's two name dialogs (PREP-10, DEC-104, D21 M408).
 *
 * "New Set" has no dialog of its own: the Set is made at once, as the Library's inline row makes
 * one, and the page then asks for its name in `RenameSetDialog`, the same dialog "Rename" opens.
 * "New Set from a list" is one dialog: the source, the name it starts with, the place in the tree,
 * and "Create". One dialog per question, so neither grows a mode.
 */
import { useId, useLayoutEffect, useState } from "react";

import { Modal } from "../../components/Modal";
import { NameFolderDialog, focusById, type FolderOption } from "../../components/NameFolderDialog";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { CREATE, dialogTitle } from "../../format/words";
import { SMART_NAME_MAX_LENGTH, checkSmartName } from "../library/smartFilter";
import { newSetFromExplanation, type NewSetSource } from "../library/newSetFrom";
import { sourceKey, type SourceGroup } from "./newSetSources";
import "./prepare.css";

interface RenameSetDialogProps {
  /** The Set's current name, or null when the dialog is closed. */
  name: string | null;
  /** The title: "Name the Set" for a new one, "Rename the Set" for an old one. */
  title: string;
  busy?: boolean;
  error?: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}

/** The one name dialog for a Set that exists: after "New Set", and "Rename…" in the title's menu. */
export function RenameSetDialog({ name, title, busy = false, error = null, onSave, onClose }: RenameSetDialogProps) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const open = name !== null;

  // In the commit that opens it, so a name typed as the dialog appeared is kept.
  useLayoutEffect(() => {
    if (!open) return;
    setText(name ?? "");
    setProblem(null);
    // Only on opening: what was typed since is the person's.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    const checked = checkSmartName(text);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    onSave(checked.name);
  };

  return (
    <Modal
      open={open}
      title={title}
      size="small"
      onClose={onClose}
      initialFocus={focusById(`${id}-name`)}
      primaryAction={{ label: "Save", onClick: submit, loading: busy }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <TextField
        id={`${id}-name`}
        label="Name"
        value={text}
        maxLength={SMART_NAME_MAX_LENGTH}
        error={problem ?? error ?? undefined}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit();
        }}
      />
    </Modal>
  );
}

interface NewSetFromListDialogProps {
  open: boolean;
  groups: readonly SourceGroup[];
  folders: readonly FolderOption[];
  busy?: boolean;
  error?: string | null;
  onCreate: (source: NewSetSource, name: string, parentId: number | null) => void;
  onClose: () => void;
}

/**
 * "New Set from a list": what to copy, what to call it and where to file it, with the sentence that
 * says what a copy of that source means (DEC-104), in one dialog (M408). Choosing another source
 * starts the name again from its name.
 */
export function NewSetFromListDialog({
  open,
  groups,
  folders,
  busy = false,
  error = null,
  onCreate,
  onClose,
}: NewSetFromListDialogProps) {
  const [chosen, setChosen] = useState("");
  const ids = useId();
  const all = groups.flatMap((group) => group.sources);

  // In the commit that opens it: a passive effect ran after the paint and could undo a
  // source chosen as the dialog appeared.
  useLayoutEffect(() => {
    if (open) setChosen(all[0] ? sourceKey(all[0]) : "");
    // Only on opening: the first source is a default, not a rule.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const source = all.find((candidate) => sourceKey(candidate) === chosen) ?? null;

  return (
    <NameFolderDialog
      open={open}
      title={dialogTitle("New Set from a list")}
      lead={source ? newSetFromExplanation(source) : undefined}
      initialName={source?.name ?? ""}
      initialParentId={source?.parentId ?? null}
      folders={folders}
      submitLabel={CREATE}
      busy={busy}
      error={error}
      disabled={all.length === 0}
      disabledReason={
        all.length === 0
          ? "There is nothing to copy yet: make a Collection in the Library, or import a Rekordbox file with playlists."
          : undefined
      }
      onSubmit={(name, parentId) => source && onCreate(source, name, parentId)}
      onClose={onClose}
    >
      {all.length > 0 && (
        <Select
          id={`${ids}-source`}
          label="Copy the tracks of"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          options={groups.flatMap((group) =>
            group.sources.map((candidate) => ({
              value: sourceKey(candidate),
              label: candidate.kind === "smart" ? `${candidate.name} (Smart)` : candidate.name,
              group: group.label,
            })),
          )}
        />
      )}
    </NameFolderDialog>
  );
}
