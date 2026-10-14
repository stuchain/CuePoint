/**
 * One of New dig's two scope fields: every artist (or label) in the library, a
 * saved list of them, or none.
 *
 * A saved list is picked from a drop-down that says how many names each holds;
 * **Edit…** changes the one shown and **+ New list** makes another, both in
 * the same chooser. Which list is chosen is the form's, what is in it is the
 * engine's, so the field only draws them and says what was asked.
 */
import type { DiscoverFacet, DiscoverList } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import { formatCount } from "../library/libraryFormat";
import type { ScopeMode } from "./newRun";

interface SavedListFieldProps {
  /** "artist" or "label". */
  noun: "artist" | "label";
  facet: DiscoverFacet;
  mode: ScopeMode;
  /** The saved lists of this kind, by name. */
  lists: readonly DiscoverList[];
  /** Why the lists could not be read; the field then says so instead of "none yet". */
  readError?: string | null;
  /** The list a "saved list" scope reads, or null. */
  listId: number | null;
  onMode: (mode: ScopeMode) => void;
  onPickList: (id: number) => void;
  onEdit: () => void;
  onNew: () => void;
}

export function SavedListField({
  noun,
  facet,
  mode,
  lists,
  readError = null,
  listId,
  onMode,
  onPickList,
  onEdit,
  onNew,
}: SavedListFieldProps) {
  const name = `discover-scope-mode-${noun}`;
  const chosen = lists.find((list) => list.id === listId) ?? null;
  return (
    <fieldset className="discover-new__scope">
      <legend className="cp-field__label">{noun === "artist" ? "Artists" : "Labels"}</legend>
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "all"} onChange={() => onMode("all")} />
        Every {noun} in your library ({formatCount(facet.total_values)})
      </label>
      <div className="discover-new__saved">
        <label className="discover-new__choice">
          <input
            type="radio"
            name={name}
            checked={mode === "list"}
            onChange={() => onMode("list")}
          />
          A saved list:
        </label>
        <Select
          label={`Saved ${noun} list`}
          hideLabel
          id={`discover-list-${noun}`}
          className="discover-new__list-select"
          value={chosen ? String(chosen.id) : ""}
          disabled={lists.length === 0}
          aria-invalid={readError ? true : undefined}
          onChange={(event) => onPickList(Number(event.target.value))}
          options={
            lists.length === 0
              ? [
                  {
                    value: "",
                    label: readError ? "Saved lists could not be read" : "No saved lists yet",
                    disabled: true,
                  },
                ]
              : [
                  ...(chosen ? [] : [{ value: "", label: "Choose a list", disabled: true }]),
                  ...lists.map((list) => ({
                    value: String(list.id),
                    label: `${list.name} · ${formatCount(list.members.length)}`,
                  })),
                ]
          }
        />
        <Button
          variant="secondary"
          aria-label={`Edit ${noun} list`}
          disabled={chosen === null}
          onClick={onEdit}
        >
          Edit…
        </Button>
      </div>
      {readError && (
        <p className="discover-dialog__refusal" role="alert">
          {readError}
        </p>
      )}
      <button
        type="button"
        className="discover-new__new-list"
        aria-label={`New ${noun} list`}
        onClick={onNew}
      >
        + New list
      </button>
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "none"} onChange={() => onMode("none")} />
        No {noun}s
      </label>
    </fieldset>
  );
}
