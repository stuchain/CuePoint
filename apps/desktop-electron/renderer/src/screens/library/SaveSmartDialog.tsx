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
import { NameFolderDialog, type FolderOption } from "../../components/NameFolderDialog";
import { Notice } from "../../components/Notice";
import type { FilterRuleSet, LibraryFilterVocabulary } from "../../api/cuepointBridge.types";
import { describeRule, type ValueNames } from "./filterText";
import { canSaveSmart } from "./smartFilter";
import "./SaveSmartDialog.css";

export type { FolderOption };

interface SaveSmartDialogProps {
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
  const savable = canSaveSmart(rules);

  return (
    <NameFolderDialog
      open={open}
      title="Save as Smart Collection"
      banner={!savable.ok ? <Notice kind="danger">{savable.why}</Notice> : null}
      lead="It keeps answering this question. Tracks join and leave it as they change, and nothing is copied."
      initialParentId={defaultParentId}
      folders={folders}
      submitLabel="Save"
      busy={busy}
      error={error}
      placeholder="Peak-time openers"
      disabled={!savable.ok}
      onSubmit={onSave}
      onClose={onClose}
    >
      {/* What is being saved, in the words the chips use. A Collection that
          keeps answering a question is worth reading once before it does. */}
      <ul className="cp-save-smart__rules" aria-label="Rules being saved">
        {(rules?.rules ?? []).map((rule, index) => (
          <li key={`${rule.field}-${rule.operator}-${index}`}>{describeRule(vocabulary, rule, names)}</li>
        ))}
      </ul>
    </NameFolderDialog>
  );
}
