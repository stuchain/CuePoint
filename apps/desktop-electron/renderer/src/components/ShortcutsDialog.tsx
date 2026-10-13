import { useMemo, useState } from "react";
import { Modal, TextField } from "./index";
import { filterShortcuts, KEYBOARD_SHORTCUTS, type KeyboardShortcutEntry } from "../api/keyboardShortcuts";
import "./ShortcutsDialog.css";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const [query, setQuery] = useState("");

  // Grouped by context in list order; a context with no row left after filtering is not shown.
  const groups = useMemo(() => {
    const byContext = new Map<string, KeyboardShortcutEntry[]>();
    for (const row of filterShortcuts(KEYBOARD_SHORTCUTS, query)) {
      byContext.set(row.context, [...(byContext.get(row.context) ?? []), row]);
    }
    return [...byContext].map(([context, rows]) => ({ context, rows }));
  }, [query]);

  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose} secondaryAction={{ label: "Close", onClick: onClose }}>
      <div className="shortcuts-dialog">
        <TextField
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter shortcuts…"
        />
        <p className="shortcuts-dialog__note">On a Mac, use Cmd where a shortcut says Ctrl.</p>
        <div className="shortcuts-dialog__table-wrap">
          <table className="shortcuts-dialog__table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Shortcut</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.context}>
                <tr>
                  <th colSpan={2} scope="rowgroup" className="shortcuts-dialog__group">
                    <h3>{group.context}</h3>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={`${row.context}-${row.action}`}>
                    <td>{row.action}</td>
                    <td>
                      <kbd className="shortcuts-dialog__key">{row.shortcut}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </Modal>
  );
}
