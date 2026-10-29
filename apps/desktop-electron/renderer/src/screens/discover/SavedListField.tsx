/**
 * One of New dig's two scope fields: every artist (or label) in the library, a
 * saved list of them, or none.
 *
 * A saved list is picked from a drop-down that says how many names each holds;
 * **Edit…** changes the one shown and **New list…** (a quiet small button) makes another.
 * With no list yet only New list… is offered. Which list is chosen is the form's, what is in it is the
 * engine's, so the field only draws them and says what was asked.
 */
import type { DiscoverFacet, DiscoverList } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Notice } from "../../components/Notice";
import { Select } from "../../components/Select";
import { opensDialog } from "../../format/words";
import { formatCount } from "../../format/counts";
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
    <Card
      className="discover-new__scope"
      bodyClassName="discover-new__card-body"
      role="group"
      aria-label={noun === "artist" ? "Artists" : "Labels"}
      title={noun === "artist" ? "Artists" : "Labels"}
    >
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "all"} onChange={() => onMode("all")} />
        Every {noun} in your library ({formatCount(facet.total_values)})
      </label>
      {/* With no saved lists there is only "New list…" (M183): the radio, the select and Edit… appear
          once a list exists (or while "a saved list" is still the scope). */}
      {(lists.length > 0 || mode === "list") && (
        <div className="discover-new__saved">
          <label className="discover-new__choice">
            <input
              type="radio"
              name={name}
              checked={mode === "list"}
              onChange={() => onMode("list")}
            />
            A saved list
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
            {opensDialog("Edit")}
          </Button>
        </div>
      )}
      {readError && <Notice kind="field-error">{readError}</Notice>}
      <Button
        variant="quiet"
        size="sm"
        className="discover-new__new-list"
        aria-label={`New list of ${noun}s`}
        onClick={onNew}
      >
        New list…
      </Button>
      <label className="discover-new__choice">
        <input type="radio" name={name} checked={mode === "none"} onChange={() => onMode("none")} />
        No {noun}s
      </label>
    </Card>
  );
}
