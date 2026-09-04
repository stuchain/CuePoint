/**
 * Narrowing the library (LIBUI-08, DEC-043).
 *
 * "Deep house, 122–126 BPM, rated 4 or more" — as clauses a user can see, and
 * remove one at a time. Each is a rule in the same model Phase 6 will save as
 * a Smart Collection (DEC-016), which is why this component takes a rule set
 * and hands one back and does nothing else: it holds no query, issues no
 * request, and knows nothing about the table it narrows. That is what makes it
 * reusable by an editor that saves rules instead of applying them.
 *
 * The vocabulary — fields, operators, arity — is the engine's answer, not a
 * table here. A control that offered a clause the engine refuses would be a
 * bug a user cannot work around.
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
  addRule,
  arityOf,
  buildRule,
  describeRule,
  emptyDraft,
  fieldOf,
  operatorLabel,
  removeRule,
  ruleCount,
  starsFor,
  withField,
  type DraftRule,
} from "./filterText";
import "./FilterBar.css";

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
  useEffect(() => {
    if (!adding || !draft.field) return;
    const spec = fieldOf(vocabulary, draft.field);
    if (spec?.facetable) onRequestFacet?.(draft.field);
  }, [adding, draft.field, vocabulary, onRequestFacet]);

  const field = fieldOf(vocabulary, draft.field);
  const arity = arityOf(vocabulary, draft.operator);
  const rules = filters?.rules ?? [];

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

        <span className="cp-filter-bar__count" role="status">
          {total.toLocaleString()} {total === 1 ? "track" : "tracks"}
        </span>
      </div>

      {adding && (
        <div className="cp-filter-bar__builder">
          <Select
            label="Field"
            value={draft.field}
            options={(vocabulary?.fields ?? []).map((entry) => ({
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

          {arity !== "none" && (
            <TextField
              label={arity === "pair" ? "From" : arity === "list" ? "Values" : "Value"}
              value={draft.value}
              list={suggestions.length > 0 ? "cp-filter-values" : undefined}
              placeholder={
                arity === "list" ? "One, another, a third" : field?.label ?? "Value"
              }
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, value: event.target.value }))
              }
            />
          )}

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

          {suggestions.length > 0 && (
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

          {field?.name === "rating" && (
            <span className="cp-filter-bar__hint">{starsFor(Number(draft.value) || 0)}</span>
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
              <span>{describeRule(vocabulary, rule)}</span>
              <button
                type="button"
                aria-label={`Remove filter: ${describeRule(vocabulary, rule)}`}
                onClick={() => onFiltersChange(removeRule(filters, index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
