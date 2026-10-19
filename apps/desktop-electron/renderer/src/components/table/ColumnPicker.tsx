/**
 * Choosing which columns a table shows, and in what order (LIBUI-06, DEC-042).
 *
 * The keyboard path to reordering. Dragging a header is quicker with a mouse
 * and impossible without one, so every move available by drag is available
 * here as a button — which is also where "reset" lives, because a layout you
 * cannot get back out of is a layout worth not offering.
 *
 * It renders the *whole* list including hidden columns, in layout order, so
 * moving a column and showing it are the same list rather than two.
 */
import { UNDO } from "../../format/words";
import { Button } from "../Button";
import { Hint } from "../Hint";
import { Modal } from "../Modal";
import { useOptionalToast } from "../Toast";
import { canMove, isLastVisible, type ColumnLayout } from "./columnLayout";
import type { TrackColumnDef } from "./trackTableLayout";
import "./ColumnPicker.css";

interface ColumnPickerProps<Row> {
  open: boolean;
  onClose: () => void;
  columns: readonly TrackColumnDef<Row>[];
  layout: ColumnLayout;
  onToggle: (id: string) => void;
  onNudge: (id: string, delta: -1 | 1) => void;
  onReset: () => void;
  /** Puts a layout back; with it, a reset offers Undo on a toast rather than asking first. */
  onRestore?: (layout: ColumnLayout) => void;
  /** A line under the list: what a mark in this table's cells means (LIB-9). */
  note?: string;
}

export function ColumnPicker<Row>({
  open,
  onClose,
  columns,
  layout,
  onToggle,
  onNudge,
  onReset,
  onRestore,
  note,
}: ColumnPickerProps<Row>) {
  const toast = useOptionalToast();
  if (!open) return null;

  const byId = new Map(columns.map((column) => [column.id, column]));

  return (
    <Modal
      size="medium"
      open={open}
      onClose={onClose}
      title="Columns"
      closeLabel="Close"
      extraAction={{
        label: "Reset columns",
        onClick: () => {
          const before = layout;
          onReset();
          if (onRestore && toast) {
            toast.push("Columns reset", "info", { label: UNDO, onClick: () => onRestore(before) });
          }
        },
      }}
    >
      <ul className="cp-column-picker" role="list">
        {layout.map((entry) => {
          const column = byId.get(entry.id);
          if (!column) return null;
          const last = isLastVisible(layout, entry.id);
          return (
            <li key={entry.id} className="cp-column-picker__row">
              <label className="cp-column-picker__label">
                <input
                  type="checkbox"
                  checked={!entry.hidden}
                  // The last visible column cannot be hidden: a table with no
                  // columns shows nothing, including the way back.
                  disabled={last}
                  onChange={() => onToggle(entry.id)}
                />
                <span>{column.header}</span>
                {column.sticky && (
                  <span className="cp-column-picker__pinned">Pinned</span>
                )}
              </label>
              <span className="cp-column-picker__moves">
                <Hint text={`Move ${column.header} up`}>
                <Button
                  variant="secondary"
                  size="sm"
                  iconOnly
                  icon="arrow-up"
                  aria-label={`Move ${column.header} up`}
                  disabled={!canMove(columns, layout, entry.id, -1)}
                  onClick={() => onNudge(entry.id, -1)}
                />
                </Hint>
                <Hint text={`Move ${column.header} down`}>
                <Button
                  variant="secondary"
                  size="sm"
                  iconOnly
                  icon="arrow-down"
                  aria-label={`Move ${column.header} down`}
                  disabled={!canMove(columns, layout, entry.id, 1)}
                  onClick={() => onNudge(entry.id, 1)}
                />
                </Hint>
              </span>
            </li>
          );
        })}
      </ul>
      {note && <p className="cp-column-picker__note">{note}</p>}
    </Modal>
  );
}
