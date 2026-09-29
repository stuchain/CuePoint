/**
 * "New Set" and the first step of "New Set from…" on the Prepare page
 * (PREP-10, DEC-104).
 *
 * "New Set" asks what a new node always asks, a name and a place in the tree.
 * "New Set from…" first asks what to copy, then hands over to PREP-09's own
 * dialog, which says what a copy of that source means before anything is
 * written. One dialog per question, so neither grows a mode.
 */
import { useEffect, useId, useState } from "react";

import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
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

export interface NewSetDialogProps {
  open: boolean;
  folders: readonly FolderOption[];
  busy?: boolean;
  error?: string | null;
  onCreate: (name: string, parentId: number | null) => void;
  onClose: () => void;
}

export function NewSetDialog({ open, folders, busy = false, error = null, onCreate, onClose }: NewSetDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
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
    <Modal open={open} title="New Set" onClose={onClose}>
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
          <p className="prepare-dialog__problem" role="alert">
            {problem ?? error}
          </p>
        )}
        <div className="prepare-dialog__actions">
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

export interface SetSourceDialogProps {
  open: boolean;
  groups: readonly SourceGroup[];
  onChoose: (source: NewSetSource) => void;
  onClose: () => void;
}

export function SetSourceDialog({ open, groups, onChoose, onClose }: SetSourceDialogProps) {
  const [chosen, setChosen] = useState("");
  const ids = useId();
  const all = groups.flatMap((group) => group.sources);

  useEffect(() => {
    if (open) setChosen(all[0] ? sourceKey(all[0]) : "");
    // Only on opening: the first source is a default, not a rule.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const source = all.find((candidate) => sourceKey(candidate) === chosen) ?? null;

  return (
    <Modal open={open} title="New Set from…" onClose={onClose}>
      <div className="prepare-dialog">
        {all.length === 0 ? (
          <p className="prepare-dialog__note">
            There is nothing to copy yet: make a Collection in the Library, or import a
            Rekordbox collection with playlists.
          </p>
        ) : (
          <label className="cp-select" htmlFor={`${ids}-source`}>
            <span className="cp-select__label">Copy the tracks of</span>
            <select
              id={`${ids}-source`}
              className="cp-select__control"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              {groups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.sources.map((candidate) => (
                    <option key={sourceKey(candidate)} value={sourceKey(candidate)}>
                      {candidate.kind === "smart" ? `${candidate.name} (Smart)` : candidate.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <div className="prepare-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => source && onChoose(source)} disabled={!source}>
            Continue…
          </Button>
        </div>
      </div>
    </Modal>
  );
}
