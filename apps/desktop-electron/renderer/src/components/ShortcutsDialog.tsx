import { useMemo, useState } from "react";
import { Modal, TextField } from "./index";
import { filterShortcuts, KEYBOARD_SHORTCUTS } from "../api/keyboardShortcuts";
import "./ShortcutsDialog.css";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => filterShortcuts(KEYBOARD_SHORTCUTS, query), [query]);

  return (
    <Modal open={open} title="Keyboard Shortcuts" onClose={onClose} secondaryAction={{ label: "Close", onClick: onClose }}>
      <div className="shortcuts-dialog">
        <TextField
          label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter shortcuts…"
        />
        <div className="shortcuts-dialog__table-wrap">
          <table className="shortcuts-dialog__table">
            <thead>
              <tr>
                <th>Context</th>
                <th>Action</th>
                <th>Shortcut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.context}-${row.action}`}>
                  <td>{row.context}</td>
                  <td>{row.action}</td>
                  <td>
                    <kbd>{row.shortcut}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
