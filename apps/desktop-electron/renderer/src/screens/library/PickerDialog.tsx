/**
 * Choosing one thing out of a list, by typing (ORG-11).
 *
 * "Add to Collection…" over a submenu works with three Collections and is
 * unusable with two hundred; the same is true of a tag vocabulary, which grows
 * faster. So both go through one dialog with a filter box, and the list is
 * what the typing leaves.
 *
 * One component for both because the difference between them is data: a tree
 * indents and marks the rows that cannot be chosen, a vocabulary does not, and
 * a tag can be made here while a Collection cannot. Two dialogs would be two
 * keyboard implementations, and the second one would be the worse one.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "../../components/Modal";
import { PixelIcon } from "../../components/PixelIcon";
import type { PixelIconName } from "../../components/pixelIcons";
import "./PickerDialog.css";

export interface PickerItem {
  id: number;
  label: string;
  /** How deep in a tree, for indentation. Flat lists leave it out. */
  depth?: number;
  /**
   * Shown but not choosable — a folder, which holds nodes rather than tracks.
   *
   * Drawn rather than hidden, because a tree with its folders removed is a
   * list whose indentation means nothing.
   */
  disabled?: boolean;
  /** A count or a category, to the right. */
  hint?: string;
  icon?: PixelIconName;
}

export interface PickerDialogProps {
  open: boolean;
  title: string;
  items: readonly PickerItem[];
  onChoose: (item: PickerItem) => void;
  onClose: () => void;
  /**
   * Make one instead, from whatever was typed.
   *
   * Offered for tags, where the engine's `create_or_get` makes typing a name
   * the whole gesture, and not for Collections, where a new one needs a place
   * in the tree that this dialog has no way to ask about.
   */
  onCreate?: (name: string) => void;
  placeholder?: string;
  emptyText?: string;
}

/** Matches on a substring, ignoring case — what a filter box is expected to do. */
function matches(item: PickerItem, needle: string): boolean {
  return item.label.toLocaleLowerCase().includes(needle);
}

export function PickerDialog({
  open,
  title,
  items,
  onChoose,
  onClose,
  onCreate,
  placeholder = "Type to narrow the list",
  emptyText = "Nothing matches.",
}: PickerDialogProps) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setActive(0);
    // The filter box, not the dialog: typing is the whole point of this one,
    // and a user who has to Tab to it first will not type.
    inputRef.current?.focus();
  }, [open]);

  const shown = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase();
    if (needle === "") return [...items];
    return items.filter((item) => matches(item, needle));
  }, [items, text]);

  /** The rows the keyboard can land on. A folder is drawn and skipped. */
  const choosable = useMemo(() => shown.filter((item) => !item.disabled), [shown]);

  const typed = text.trim();
  const exists = choosable.some(
    (item) => item.label.toLocaleLowerCase() === typed.toLocaleLowerCase(),
  );
  const canCreate = Boolean(onCreate) && typed !== "" && !exists;

  const commit = () => {
    const item = choosable[active];
    if (item) {
      onChoose(item);
      return;
    }
    if (canCreate) onCreate!(typed);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => {
        const next = current + (event.key === "ArrowDown" ? 1 : -1);
        if (choosable.length === 0) return 0;
        if (next < 0) return choosable.length - 1;
        if (next >= choosable.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="cp-picker" onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          type="text"
          className="cp-picker__filter"
          aria-label={placeholder}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
        />

        <ul className="cp-picker__list" role="listbox" aria-label={title}>
          {shown.map((item) => {
            const index = choosable.indexOf(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index >= 0 && index === active}
                  disabled={item.disabled}
                  className={`cp-picker__item${
                    index >= 0 && index === active ? " cp-picker__item--active" : ""
                  }`}
                  style={{ paddingLeft: `calc(var(--space-sm) + ${(item.depth ?? 0) * 12}px)` }}
                  onMouseEnter={() => index >= 0 && setActive(index)}
                  onClick={() => onChoose(item)}
                >
                  {item.icon && <PixelIcon name={item.icon} className="cp-picker__icon" />}
                  <span className="cp-picker__label">{item.label}</span>
                  {item.hint && <span className="cp-picker__hint">{item.hint}</span>}
                </button>
              </li>
            );
          })}
          {shown.length === 0 && !canCreate && (
            <li className="cp-picker__empty">{emptyText}</li>
          )}
        </ul>

        {canCreate && (
          <button
            type="button"
            className="cp-picker__create"
            onClick={() => onCreate!(typed)}
          >
            Create “{typed}”
          </button>
        )}
      </div>
    </Modal>
  );
}
