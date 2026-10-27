import { Fragment, useMemo, useState } from "react";
import { Modal } from "./index";
import { SearchField } from "./SearchField";
import { Kbd } from "./Kbd";
import { filterShortcuts, KEYBOARD_SHORTCUTS, type KeyboardShortcutEntry } from "../api/keyboardShortcuts";
import { countNoun } from "../format/counts";
import "./table/DataTable.css";
import "./ShortcutsDialog.css";

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A listed shortcut as caps: the list says Ctrl, and a Mac shows its Command sign (Kbd's `Mod`).
 * Two ways to do one thing are written "A / B": each is its own run of caps with "or" between.
 */
function Shortcut({ shortcut }: { shortcut: string }) {
  const ways = shortcut.split(" / ");
  return (
    <>
      {ways.map((way, index) => (
        <Fragment key={way}>
          {index > 0 ? <span className="shortcuts-dialog__or">or</span> : null}
          <Kbd
            apart
            className="shortcuts-dialog__key"
            keys={way
              .split("+")
              .map((part) => (part === "Ctrl" ? "Mod" : part))
              .join("+")}
          />
        </Fragment>
      ))}
    </>
  );
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

  const shown = groups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <Modal size="medium" open={open} title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcuts-dialog">
        {/* The search and the count stay put; only the list below scrolls (C119). */}
        <div className="shortcuts-dialog__head">
          <SearchField thing="shortcuts" label="Search" value={query} onValueChange={setQuery} />
          <span className="cp-count" data-testid="shortcuts-count" role="status">
            {shown === 0 ? "No shortcuts" : countNoun(shown, "shortcut")}
          </span>
        </div>
        <div className="shortcuts-dialog__table-wrap">
          <table className="cp-data-table shortcuts-dialog__table">
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
                    <h3 className="cp-text-subhead">{group.context}</h3>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={`${row.context}-${row.action}`}>
                    <td>{row.action}</td>
                    <td className="shortcuts-dialog__keys">
                      <Shortcut shortcut={row.shortcut} />
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
