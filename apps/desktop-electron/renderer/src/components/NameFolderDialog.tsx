import { useId, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { TextField } from "./TextField";
import { SMART_NAME_MAX_LENGTH, checkSmartName } from "../screens/library/smartFilter";
import "./NameFolderDialog.css";

/** A folder the new node can go in. The top level is always offered. */
export interface FolderOption {
  id: number;
  name: string;
  depth: number;
}

/**
 * A ref to the element with this id, found when the dialog takes focus (its layout effect runs
 * after the field is in the page). Lets a dialog name its first field for `initialFocus`
 * without the field having to hand out a ref.
 */
export function focusById(id: string): RefObject<HTMLElement | null> {
  return {
    get current() {
      return document.getElementById(id);
    },
    set current(_value) {
      // Read-only: the element is whatever the page holds under that id.
    },
  };
}

interface NameFolderDialogProps {
  open: boolean;
  title: string;
  /** A message that blocks the dialog, above everything (a Notice). */
  banner?: ReactNode;
  /** What the dialog is for, in one muted line above the fields (`.cp-modal__lead`). */
  lead?: ReactNode;
  /** The name the field starts with; the dialog starts again when it opens or this changes. */
  initialName?: string;
  /** The folder chosen when it opens; null is the top level. */
  initialParentId?: number | null;
  folders: readonly FolderOption[];
  /** The main button: "Save", "Create the Set". */
  submitLabel: string;
  busy?: boolean;
  /** Why the engine refused the last attempt, shown under the name field. */
  error?: string | null;
  /** Callers still pass it; the refusal is now the field's own error, linked by aria-describedby. */
  errorKey?: number;
  placeholder?: string;
  /** The fields and the main button are greyed (there is nothing to name yet). */
  disabled?: boolean;
  /** One line saying why the main button is greyed. */
  disabledReason?: string;
  /** Anything that belongs between the fields and the footer (the rules being saved). */
  children?: ReactNode;
  onSubmit: (name: string, parentId: number | null) => void;
  onClose: () => void;
}

/**
 * The one dialog that names a new node and gives it a place in the tree (C109): Save as Smart
 * Collection, New Set and New Set from…. Medium width, blocks 12 apart and a field with its
 * message 8, the Modal footer for Cancel and the main button, and a refusal under the name
 * field. Enter in the name presses the main button.
 */
export function NameFolderDialog({
  open,
  title,
  banner,
  lead,
  initialName = "",
  initialParentId = null,
  folders,
  submitLabel,
  busy = false,
  error = null,
  placeholder,
  disabled = false,
  disabledReason,
  children,
  onSubmit,
  onClose,
}: NameFolderDialogProps) {
  const [name, setName] = useState(initialName);
  const [parent, setParent] = useState(initialParentId == null ? "" : String(initialParentId));
  const [problem, setProblem] = useState<string | null>(null);
  const nameId = useId();
  const focus = useMemo(() => focusById(nameId), [nameId]);

  // In the commit that opens it, so a name typed as the dialog appeared is kept.
  useLayoutEffect(() => {
    if (!open) return;
    setName(initialName);
    setParent(initialParentId == null ? "" : String(initialParentId));
    setProblem(null);
  }, [open, initialName, initialParentId]);

  const submit = () => {
    // The same rule every node's name follows: the engine's 120 characters.
    const checked = checkSmartName(name);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    onSubmit(checked.name, parent === "" ? null : Number(parent));
  };

  const refusal = problem ?? error;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      initialFocus={focus}
      primaryAction={{ label: submitLabel, onClick: submit, loading: busy, disabled, disabledReason }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      {banner}
      {lead ? <p className="cp-modal__lead">{lead}</p> : null}
      <div className="cp-name-folder__field">
        <TextField
          id={nameId}
          label="Name"
          value={name}
          maxLength={SMART_NAME_MAX_LENGTH}
          placeholder={placeholder}
          disabled={disabled}
          error={refusal ?? undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Select
        label="In"
        value={parent}
        disabled={disabled}
        options={[
          { value: "", label: "Top level" },
          ...folders.map((folder) => ({
            value: String(folder.id),
            label: `${"　".repeat(folder.depth)}${folder.name}`,
          })),
        ]}
        onChange={(event) => setParent(event.target.value)}
      />
      {children}
    </Modal>
  );
}
