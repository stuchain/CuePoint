/**
 * "New Set from…" (DEC-104, PREP-09).
 *
 * Offered on a Collection, a Smart Collection and a Rekordbox playlist. It
 * asks what a new node always asks — a name and a place in the tree, as "Save
 * as Smart Collection" does — and says, before anything is written, that the
 * Set is a copy and what that means for this source. Nothing is converted in
 * place: the source is left exactly as it was (DEC-104).
 *
 * The name starts as the source's, which is what the engine would call it
 * anyway, so accepting the dialog as it opens is the one-click path.
 */
import { useEffect, useState } from "react";

import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { newSetFromExplanation, type NewSetSource } from "./newSetFrom";
import type { FolderOption } from "./SaveSmartDialog";
import { SMART_NAME_MAX_LENGTH, checkSmartName } from "./smartFilter";
import "./NewSetFromDialog.css";

export interface NewSetFromDialogProps {
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
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    setName(source.name);
    setParent(source.parentId == null ? "" : String(source.parentId));
    setProblem(null);
  }, [source]);

  const submit = () => {
    // The same rule every node's name follows: the engine's 120 characters.
    const checked = checkSmartName(name);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    onCreate(checked.name, parent === "" ? null : Number(parent));
  };

  return (
    <Modal
      open={source !== null}
      title={source ? `New Set from “${source.name}”` : "New Set"}
      onClose={onClose}
    >
      <div className="cp-new-set-from">
        <p className="cp-new-set-from__note">{source ? newSetFromExplanation(source) : ""}</p>

        <TextField
          label="Name"
          value={name}
          maxLength={SMART_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />

        <Select
          label="In"
          value={parent}
          options={[
            { value: "", label: "Top level" },
            ...folders.map((folder) => ({
              value: String(folder.id),
              label: `${"　".repeat(folder.depth)}${folder.name}`,
            })),
          ]}
          onChange={(event) => setParent(event.target.value)}
        />

        {(problem ?? error) && (
          <p className="cp-new-set-from__problem" role="alert">
            {problem ?? error}
          </p>
        )}

        <div className="cp-new-set-from__actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Making…" : "Make the Set"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
