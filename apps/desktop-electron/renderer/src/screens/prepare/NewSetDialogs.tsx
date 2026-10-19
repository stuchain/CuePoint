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
import { NameFolderDialog, type FolderOption } from "../../components/NameFolderDialog";
import { Select } from "../../components/Select";
import { dialogTitle } from "../../format/words";
import type { NewSetSource } from "../library/newSetFrom";
import { sourceKey, type SourceGroup } from "./newSetSources";
import "./prepare.css";

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
  return (
    <NameFolderDialog
      open={open}
      title="New Set"
      folders={folders}
      submitLabel="Create the Set"
      busy={busy}
      error={error}
      errorKey={errorKey}
      placeholder="Friday at the Warehouse"
      onSubmit={onCreate}
      onClose={onClose}
    />
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
      size="small"
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
