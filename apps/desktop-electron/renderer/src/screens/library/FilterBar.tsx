/**
 * Narrowing the library (LIBUI-08, DEC-043), and saving what was narrowed
 * (ORG-12, DEC-016).
 *
 * "Deep house, 122–126 BPM, rated 4 or more" — as clauses a user can see, and
 * remove one at a time. Each is a rule in the same model a Smart Collection
 * saves, which is why this component takes a rule set and hands one back: it
 * holds no query and issues no request. What it gained in ORG-12 is the other
 * half of DEC-016 — a button that saves the rules as they are, and the
 * distinction between rules that are still what a Collection saved and rules
 * that are not.
 *
 * The vocabulary — fields, operators, arity, and what a field's numbers mean —
 * is the engine's answer, not a table here. A control that offered a clause the
 * engine refuses would be a bug a user cannot work around, and a bar that
 * offered *fewer* fields than the engine describes would be a feature nobody
 * can reach. Both are asserted against the vocabulary rather than reviewed.
 */
import { useEffect, useState } from "react";

import { Button } from "../../components/Button";
import { Select } from "../../components/Select";
import { TextField } from "../../components/TextField";
import type {
  FilterRuleSet,
  LibraryFacet,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";
import {
  RATING_STARS,
  addRule,
  arityOf,
  buildRule,
  buildableFields,
  describeRule,
  emptyDraft,
  fieldOf,
  isMembership,
  isStars,
  operatorLabel,
  removeRule,
  ruleCount,
  selectedIds,
  starsFor,
  toggleId,
  withField,
  type DraftRule,
  type ValueNames,
} from "./filterText";
import { isModified, smartStatus, type SmartAttachment } from "./smartFilter";
import "./FilterBar.css";

/** One Collection a membership clause can name. Folders are drawn, not chosen. */
export interface FilterCollectionOption {
  id: number;
  name: string;
  depth: number;
  selectable: boolean;
}

export interface FilterBarProps {
  vocabulary: LibraryFilterVocabulary | null;
  filters: FilterRuleSet | null;
  onFiltersChange: (filters: FilterRuleSet | null) => void;

  /** The text query, which is the same `q` global search uses (DEC-023). */
  query: string;
  onQueryChange: (query: string) => void;

  /** Rows the query matches, from the engine — never counted from a window. */
  total: number;

  /** The values of the field being added, when one has been asked for. */
  facet?: LibraryFacet | null;
  onRequestFacet?: (field: string) => void;

  /** The Collections a membership clause can name; the tree, flattened. */
  collections?: readonly FilterCollectionOption[];

  /** The names behind the ids in the chips (ORG-12). */
  names?: ValueNames;

  /** The Smart Collection these rules came from, when they came from one. */
  smart?: SmartAttachment | null;
  onSaveSmart?: () => void;
  onUpdateSmart?: () => void;
  /** Let go of the Collection and keep the rules as a plain filter. */
  onDetachSmart?: () => void;

  /** Open the tag manager — the vocabulary, tended where it is used. */
  onManageTags?: () => void;

  /**
   * Why the engine refused this question, when it did.
   *
   * Shown here rather than only beside the table, because the clause it names
   * is one of the chips above it. A refusal that reaches a user as an empty
   * table is a refusal they will read as "no tracks match".
   */
  problem?: string | null;
  onRetry?: () => void;
}

export function FilterBar({
  vocabulary,
  filters,
  onFiltersChange,
  query,
  onQueryChange,
  total,
  facet = null,
  onRequestFacet,
  collections = [],
  names,
  smart = null,
  onSaveSmart,
  onUpdateSmart,
  onDetachSmart,
  onManageTags,
  problem: refusal = null,
  onRetry,
}: FilterBarProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(() => emptyDraft(vocabulary));
  const [problem, setProblem] = useState<string | null>(null);

  // The vocabulary arrives after the first render; a draft built before it can
  // name no field at all.
  useEffect(() => {
    setDraft((previous) => (previous.field ? previous : emptyDraft(vocabulary)));
  }, [vocabulary]);

  // The values a field takes are worth fetching when a field is chosen, not
  // when the bar is drawn: a facet is a pass over the library.
  //
  // And only for a control that has somewhere to put them. A favorite is
  // facetable — "how many tracks are starred" is a real question — but its
  // control is yes or no, so asking would buy a pass over the library and
  // throw the answer away.
  useEffect(() => {
    if (!adding || !draft.field) return;
    const spec = fieldOf(vocabulary, draft.field);
    if (spec?.facetable && spec.type !== "bool") onRequestFacet?.(draft.field);
  }, [adding, draft.field, vocabulary, onRequestFacet]);

  const field = fieldOf(vocabulary, draft.field);
  const arity = arityOf(vocabulary, draft.operator);
  const rules = filters?.rules ?? [];
  const status = smartStatus(smart, filters);
  /** The Collection whose rules have been changed, when there is one. */
  const modified = smart && isModified(smart, filters) ? smart : null;

  const submit = () => {
    const built = buildRule(vocabulary, draft);
    if (!built.ok) {
      setProblem(built.reason);
      return;
    }
    onFiltersChange(addRule(filters, built.rule));
    setDraft(emptyDraft(vocabulary));
    setProblem(null);
    setAdding(false);
  };

  const suggestions = facet && facet.field === draft.field ? facet.values : [];
  const chosen = selectedIds(draft);

  /** The value control this field's kind needs, or nothing when it needs none. */
  const valueControl = () => {
    if (!field || arity === "none") return null;

    if (field.type === "bool") {
      return (
        <Select
          label={field.label}
          value={draft.value}
          options={[
            { value: "", label: "Choose…" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
          onChange={(event) =>
            setDraft((previous) => ({ ...previous, value: event.target.value }))
          }
        />
      );
    }

    if (field.type === "collection") {
      return (
        <Select
          label={field.label}
          value={draft.value}
          options={[
            { value: "", label: "Choose…" },
            ...collections.map((node) => ({
              value: String(node.id),
              // A folder is drawn and cannot be chosen, for the same reason
              // ORG-11's picker draws them: a tree with its folders taken out
              // is a list whose indentation lies.
              label: `${"　".repeat(node.depth)}${node.name}`,
              disabled: !node.selectable,
            })),
          ]}
          onChange={(event) =>
            setDraft((previous) => ({ ...previous, value: event.target.value }))
          }
        />
      );
    }

    if (field.type === "tag") {
      // Chips rather than a list of ids: a tag's value is its id because a
      // rule has to survive a rename (ORG-05), and no one has ever known one.
      return (
        <div
          className="cp-filter-bar__tags"
          role="group"
          aria-label={arity === "list" ? "Tags — choose any" : "Tags"}
        >
          {suggestions.length === 0 && (
            <span className="cp-filter-bar__hint">No tags here yet.</span>
          )}
          {suggestions.map((value) => {
            const id = Number(value.value);
            if (!Number.isFinite(id) || value.value === null) return null;
            const on = chosen.includes(id);
            return (
              <button
                key={value.value}
                type="button"
                aria-pressed={on}
                className={`cp-filter-bar__tag${on ? " cp-filter-bar__tag--on" : ""}`}
                onClick={() => setDraft((previous) => toggleId(previous, id, arity))}
              >
                {value.label ?? value.value}
                <span className="cp-filter-bar__tag-count">
                  {value.count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    if (isStars(field) && arity === "single") {
      // Stars because the engine says this field's numbers are stars — which
      // is what gives all three rating layers one control without the bar
      // holding a list of their names (DEC-057, DEC-043).
      return (
        <div className="cp-filter-bar__stars" role="group" aria-label={field.label}>
          {Array.from({ length: RATING_STARS + 1 }, (_, star) => (
            <button
              key={star}
              type="button"
              aria-pressed={draft.value === String(star)}
              aria-label={star === 0 ? "unrated" : starsFor(star)}
              className={`cp-filter-bar__star${
                draft.value === String(star) ? " cp-filter-bar__star--on" : ""
              }`}
              onClick={() =>
                setDraft((previous) => ({ ...previous, value: String(star) }))
              }
            >
              {star === 0 ? "0" : "★".repeat(star)}
            </button>
          ))}
        </div>
      );
    }

    return (
      <TextField
        label={arity === "pair" ? "From" : arity === "list" ? "Values" : "Value"}
        value={draft.value}
        list={suggestions.length > 0 ? "cp-filter-values" : undefined}
        placeholder={arity === "list" ? "One, another, a third" : field.label}
        onChange={(event) =>
          setDraft((previous) => ({ ...previous, value: event.target.value }))
        }
      />
    );
  };

  const textSuggestions = field && !isMembership(field) && suggestions.length > 0;

  return (
    <div className="cp-filter-bar">
      <div className="cp-filter-bar__row">
        <TextField
          label="Search"
          value={query}
          placeholder="Search these tracks…"
          onChange={(event) => onQueryChange(event.target.value)}
        />

        <Button
          variant="secondary"
          onClick={() => {
            setProblem(null);
            setAdding((open) => !open);
          }}
        >
          {adding ? "Cancel" : "Add filter"}
        </Button>

        {ruleCount(filters) > 0 && (
          <Button variant="secondary" onClick={() => onFiltersChange(null)}>
            Clear all
          </Button>
        )}

        {onManageTags && (
          <Button variant="secondary" onClick={onManageTags}>
            Tags…
          </Button>
        )}

        <span className="cp-filter-bar__count" role="status">
          {total.toLocaleString()} {total === 1 ? "track" : "tracks"}
        </span>
      </div>

      {adding && (
        <div className="cp-filter-bar__builder">
          <Select
            label="Field"
            value={draft.field}
            options={buildableFields(vocabulary).map((entry) => ({
              value: entry.name,
              label: entry.label,
            }))}
            onChange={(event) =>
              setDraft((previous) => withField(vocabulary, previous, event.target.value))
            }
          />

          <Select
            label="Condition"
            value={draft.operator}
            options={(field?.operators ?? []).map((operator) => ({
              value: operator,
              label: operatorLabel(operator),
            }))}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, operator: event.target.value }))
            }
          />

          {valueControl()}

          {arity === "pair" && (
            <TextField
              label="To"
              value={draft.secondValue}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  secondValue: event.target.value,
                }))
              }
            />
          )}

          {textSuggestions && (
            <datalist id="cp-filter-values">
              {suggestions.map((value) => (
                <option
                  key={String(value.value)}
                  value={value.value ?? ""}
                  // The count is what makes a facet worth showing: it is the
                  // difference between guessing a genre and knowing there are
                  // 1,204 tracks in it.
                  label={`${value.value ?? "(none)"} — ${value.count.toLocaleString()}`}
                />
              ))}
            </datalist>
          )}

          {facet?.range && facet.field === draft.field && facet.range.min !== null && (
            <span className="cp-filter-bar__hint">
              {facet.range.min} – {facet.range.max}
            </span>
          )}

          <Button onClick={submit}>Add</Button>

          {problem && (
            <span className="cp-filter-bar__problem" role="alert">
              {problem}
            </span>
          )}
        </div>
      )}

      {rules.length > 0 && (
        <ul className="cp-filter-bar__chips" aria-label="Active filters">
          {rules.map((rule, index) => (
            <li key={`${rule.field}-${rule.operator}-${index}`} className="cp-filter-bar__chip">
              <span>{describeRule(vocabulary, rule, names)}</span>
              <button
                type="button"
                aria-label={`Remove filter: ${describeRule(vocabulary, rule, names)}`}
                onClick={() => onFiltersChange(removeRule(filters, index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {(status || (rules.length > 0 && onSaveSmart)) && (
        <div className="cp-filter-bar__saved">
          {status && (
            <span
              className={`cp-filter-bar__status${
                modified ? " cp-filter-bar__status--modified" : ""
              }`}
              role="status"
            >
              {status}
            </span>
          )}

          {/* Saving is offered for rules that are not already a Collection's.
              A modified one is offered both ways instead, because "make a
              second Collection out of this" and "change the one I opened" are
              different intentions and neither is the obvious default. */}
          {onSaveSmart && rules.length > 0 && (
            <Button variant="secondary" onClick={onSaveSmart}>
              {smart ? "Save as a new Smart Collection…" : "Save as Smart Collection…"}
            </Button>
          )}

          {modified && onUpdateSmart && (
            <Button variant="secondary" onClick={onUpdateSmart}>
              Update “{modified.name}”
            </Button>
          )}

          {modified && onDetachSmart && (
            <Button variant="secondary" onClick={onDetachSmart}>
              Keep as a filter
            </Button>
          )}
        </div>
      )}

      {refusal && (
        <div className="cp-filter-bar__refusal" role="alert">
          <span>{refusal}</span>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
