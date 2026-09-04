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
import { Button } from "../Button";
import { Modal } from "../Modal";
import { canMove, isLastVisible, type ColumnLayout } from "./columnLayout";
import type { TrackColumnDef } from "./trackTableLayout";
import "./ColumnPicker.css";

export interface ColumnPickerProps<Row> {
  open: boolean;
  onClose: () => void;
  columns: readonly TrackColumnDef<Row>[];
  layout: ColumnLayout;
  onToggle: (id: string) => void;
  onNudge: (id: string, delta: -1 | 1) => void;
  onReset: () => void;
}

export function ColumnPicker<Row>({
  open,
  onClose,
  columns,
  layout,
  onToggle,
  onNudge,
  onReset,
}: ColumnPickerProps<Row>) {
  if (!open) return null;

  const byId = new Map(columns.map((column) => [column.id, column]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Columns"
      primaryAction={{ label: "Done", onClick: onClose }}
      secondaryAction={{ label: "Reset columns", onClick: onReset }}
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
                  <span className="cp-column-picker__pinned" title="Pinned to the left">
                    pinned
                  </span>
                )}
              </label>
              <span className="cp-column-picker__moves">
                <Button
                  variant="secondary"
                  aria-label={`Move ${column.header} left`}
                  disabled={!canMove(columns, layout, entry.id, -1)}
                  onClick={() => onNudge(entry.id, -1)}
                >
                  ◀
                </Button>
                <Button
                  variant="secondary"
                  aria-label={`Move ${column.header} right`}
                  disabled={!canMove(columns, layout, entry.id, 1)}
                  onClick={() => onNudge(entry.id, 1)}
                >
                  ▶
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
