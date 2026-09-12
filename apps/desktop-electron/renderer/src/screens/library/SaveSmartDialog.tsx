/**
 * Naming a filter and putting it in the tree (ORG-12, DEC-016).
 *
 * The whole of "Save as Smart Collection": a name, a folder, and the rules
 * exactly as the bar has them. The rules are shown rather than summarized,
 * because what is being saved is a question that will keep answering itself —
 * and the difference between "rated at least 4" and "rated 4" is the kind of
 * thing a user wants to see before it becomes a Collection they trust.
 *
 * Unlike ORG-11's tag picker, this one asks where the new node goes. A
 * Collection lives somewhere in a tree, and a dialog that did not ask would be
 * choosing for them.
 */
import { useEffect, useState } from "react";

import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import type { FilterRuleSet, LibraryFilterVocabulary } from "../../api/cuepointBridge.types";
import { describeRule, type ValueNames } from "./filterText";
import { canSaveSmart, checkSmartName, SMART_NAME_MAX_LENGTH } from "./smartFilter";
import "./SaveSmartDialog.css";

/** A folder the new Collection can go in. The top level is always offered. */
export interface FolderOption {
  id: number;
  name: string;
  depth: number;
}

export interface SaveSmartDialogProps {
  open: boolean;
  rules: FilterRuleSet | null;
  vocabulary: LibraryFilterVocabulary | null;
  names?: ValueNames;
  folders: readonly FolderOption[];
  /** Where the tree is pointing, so the obvious folder is already chosen. */
  defaultParentId?: number | null;
  busy?: boolean;
  /** Why the engine refused the last attempt — a name already taken, usually. */
  error?: string | null;
  onSave: (name: string, parentId: number | null) => void;
  onClose: () => void;
}

export function SaveSmartDialog({
  open,
  rules,
  vocabulary,
  names,
  folders,
  defaultParentId = null,
  busy = false,
  error = null,
  onSave,
  onClose,
}: SaveSmartDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setParent(defaultParentId == null ? "" : String(defaultParentId));
    setProblem(null);
  }, [open, defaultParentId]);

  const savable = canSaveSmart(rules);

  const submit = () => {
    const checked = checkSmartName(name);
    if (!checked.ok) {
      setProblem(checked.reason);
      return;
    }
    setProblem(null);
    onSave(checked.name, parent === "" ? null : Number(parent));
  };

  return (
    <Modal open={open} title="Save as Smart Collection" onClose={onClose}>
      <div className="cp-save-smart">
        {!savable.ok && (
          <p className="cp-save-smart__problem" role="alert">
            {savable.why}
          </p>
        )}

        <TextField
          label="Name"
          value={name}
          maxLength={SMART_NAME_MAX_LENGTH}
          placeholder="Peak-time openers"
          disabled={!savable.ok}
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
          disabled={!savable.ok}
          options={[
            { value: "", label: "Top level" },
            ...folders.map((folder) => ({
              value: String(folder.id),
              label: `${"　".repeat(folder.depth)}${folder.name}`,
            })),
          ]}
          onChange={(event) => setParent(event.target.value)}
        />

        {/* What is being saved, in the words the chips use. A Collection that
            keeps answering a question is worth reading once before it does. */}
        <ul className="cp-save-smart__rules" aria-label="Rules being saved">
          {(rules?.rules ?? []).map((rule, index) => (
            <li key={`${rule.field}-${rule.operator}-${index}`}>
              {describeRule(vocabulary, rule, names)}
            </li>
          ))}
        </ul>

        <p className="cp-save-smart__note">
          It keeps answering this question. Tracks join and leave it as they
          change, and nothing is copied.
        </p>

        {(problem ?? error) && (
          <p className="cp-save-smart__problem" role="alert">
            {problem ?? error}
          </p>
        )}

        <div className="cp-save-smart__actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!savable.ok || busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
