/**
 * "New Set" and the first step of "New Set from…" on the Prepare page
 * (PREP-10, DEC-104).
 *
 * "New Set" asks what a new node always asks, a name and a place in the tree.
 * "New Set from…" first asks what to copy, then hands over to PREP-09's own
 * dialog, which says what a copy of that source means before anything is
 * written. One dialog per question, so neither grows a mode.
 */
import { useId, useLayoutEffect, useState } from "react";

import { Modal } from "../../components/Modal";
import { Notice } from "../../components/Notice";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import { dialogTitle } from "../../format/words";
import type { NewSetSource } from "../library/newSetFrom";
import type { FolderOption } from "../library/SaveSmartDialog";
import { SMART_NAME_MAX_LENGTH, checkSmartName } from "../library/smartFilter";
import { sourceKey, type SourceGroup } from "./newSetSources";
import "./prepare.css";

function folderChoices(folders: readonly FolderOption[]) {
  return [
    { value: "", label: "Top level" },
    ...folders.map((folder) => ({
      value: String(folder.id),
      label: `${"　".repeat(folder.depth)}${folder.name}`,
    })),
  ];
}

interface NewSetDialogProps {
  open: boolean;
  folders: readonly FolderOption[];
  busy?: boolean;
  error?: string | null;
  /** Changes with every refusal, so the same words coming back shake again. */
  errorKey?: number;
  onCreate: (name: string, parentId: number | null) => void;
  onClose: () => void;
}

export function NewSetDialog({ open, folders, busy = false, error = null, errorKey = 0, onCreate, onClose }: NewSetDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const ids = useId();

  // In the commit that opens it, so a name typed as the dialog appeared is kept.
  useLayoutEffect(() => {
    if (!open) return;
    setName("");
    setParent("");
    setProblem(null);
  }, [open]);

  const submit = () => {
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
      open={open}
      title="New Set"
      onClose={onClose}
      primaryAction={{ label: "Make the Set", onClick: submit, loading: busy }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="prepare-dialog">
        <TextField
          id={`${ids}-name`}
          label="Name"
          value={name}
          maxLength={SMART_NAME_MAX_LENGTH}
          placeholder="Friday at the Warehouse"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Select
          id={`${ids}-folder`}
          label="In"
          value={parent}
          options={folderChoices(folders)}
          onChange={(event) => setParent(event.target.value)}
        />
        {(problem ?? error) && (
          <Notice key={problem ?? errorKey} kind="field-error">
            {problem ?? error}
          </Notice>
        )}
      </div>
    </Modal>
  );
}

interface SetSourceDialogProps {
  open: boolean;
  groups: readonly SourceGroup[];
  onChoose: (source: NewSetSource) => void;
  onClose: () => void;
}

export function SetSourceDialog({ open, groups, onChoose, onClose }: SetSourceDialogProps) {
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
    <Modal
      open={open}
      title={dialogTitle("New Set from…")}
      onClose={onClose}
      primaryAction={{ label: "Continue…", onClick: () => source && onChoose(source), disabled: !source }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="prepare-dialog">
        {all.length === 0 ? (
          <p className="prepare-dialog__note">
            There is nothing to copy yet: make a Collection in the Library, or import a
            Rekordbox file with playlists.
          </p>
        ) : (
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
      </div>
    </Modal>
  );
}
