/**
 * Choosing which columns a table shows, and in what order (LIBUI-06, DEC-042, D24, M256).
 *
 * The shown columns come first, in the order the table has them, each one a row that can be dragged
 * to a new place (the grip), moved from the keyboard (Alt with Up and Down on its tick) or moved
 * with the attached up and down pair at its end. The columns that are not shown wait under them as
 * ticks alone, with nothing to move: a column is placed when it is shown. A column that is pinned
 * and shown says "always shown", since it cannot be hidden. Reset lives in the footer, because a
 * layout you cannot get back out of is a layout worth not offering.
 *
 * One list is still the whole layout, in layout order: showing a column and moving it are the same
 * model, and every move available by drag in the header is available here without a mouse.
 */
import { useState } from "react";

import { UNDO } from "../../format/words";
import { Button } from "../Button";
import { Hint } from "../Hint";
import { Modal } from "../Modal";
import { PixelIcon } from "../PixelIcon";
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
  // The column being dragged, by id: a drop on another shown row moves it there.
  const [dragging, setDragging] = useState<string | null>(null);
  if (!open) return null;

  const byId = new Map(columns.map((column) => [column.id, column]));
  const known = layout.filter((entry) => byId.has(entry.id));
  const shown = known.filter((entry) => !entry.hidden);
  const waiting = known.filter((entry) => entry.hidden);

  /** Move a column to where another one is, one step at a time so every step keeps its rules. */
  const dropOn = (targetId: string) => {
    const moved = dragging;
    setDragging(null);
    if (!moved || moved === targetId) return;
    const from = layout.findIndex((entry) => entry.id === moved);
    const to = layout.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0) return;
    const delta = to > from ? 1 : -1;
    // One step at a time: each is clamped by what is pinned, so a drop never passes a pinned column.
    for (let steps = Math.abs(to - from); steps > 0; steps -= 1) onNudge(moved, delta);
  };

  return (
    <Modal
      size="medium"
      open={open}
      onClose={onClose}
      title="Columns"
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
        {shown.map((entry) => {
          const column = byId.get(entry.id)!;
          const last = isLastVisible(layout, entry.id);
          const draggable = !column.sticky;
          return (
            <li
              key={entry.id}
              className={`cp-column-picker__row${dragging === entry.id ? " cp-column-picker__row--dragging" : ""}`}
              draggable={draggable}
              onDragStart={(event) => {
                setDragging(entry.id);
                // Some data has to be set or Firefox refuses to start a drag.
                event.dataTransfer?.setData("text/plain", entry.id);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                if (dragging) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOn(entry.id);
              }}
            >
              <span className="cp-column-picker__grip" aria-hidden>
                {draggable ? <PixelIcon name="grip" size="sm" /> : null}
              </span>
              <label className="cp-column-picker__label cp-check--pixel">
                <input
                  type="checkbox"
                  checked
                  // A pinned column is always shown, and the last visible one cannot be hidden: a
                  // table with no columns shows nothing, including the way back.
                  disabled={last || column.sticky === true}
                  onChange={() => onToggle(entry.id)}
                  onKeyDown={(event) => {
                    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                    event.preventDefault();
                    const delta = event.key === "ArrowUp" ? -1 : 1;
                    if (canMove(columns, layout, entry.id, delta)) onNudge(entry.id, delta);
                  }}
                />
                <span>{column.header}</span>
                {column.sticky && <span className="cp-column-picker__pinned">· always shown</span>}
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
      {waiting.length > 0 && (
        <>
          <p className="cp-column-picker__heading">Not shown</p>
          <ul className="cp-column-picker" role="list" aria-label="Columns not shown">
            {waiting.map((entry) => {
              const column = byId.get(entry.id)!;
              return (
                <li key={entry.id} className="cp-column-picker__row">
                  <label className="cp-column-picker__label cp-check--pixel">
                    <input type="checkbox" checked={false} onChange={() => onToggle(entry.id)} />
                    <span>{column.header}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {note && <p className="cp-column-picker__note">{note}</p>}
    </Modal>
  );
}
