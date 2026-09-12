/**
 * Turning filter rules into words, and words into filter rules (LIBUI-08).
 *
 * The vocabulary — which fields exist, which operators each allows, and how
 * many values each operator takes — comes from the engine (DEC-043). What
 * lives here is only what a *screen* needs on top of it: what to call an
 * operator, how to read a clause back, and how to assemble one from what was
 * typed.
 *
 * The split matters because of what it rules out. A renderer that decided for
 * itself which operators a field allows could offer a clause the engine
 * refuses; a renderer that decided how many values "between" takes could send
 * one. Both are impossible here: those answers arrive with the field list.
 *
 * **ORG-12 finished the list.** ORG-05 taught the engine to filter by tag, by
 * Collection membership and by favorite, and the bar answered by offering only
 * the three kinds it had controls for. It now offers all six, which is what
 * makes the acceptance test — the bar offers exactly the fields the engine
 * describes, and no others — something other than a tautology.
 */
import type {
  FilterRule,
  FilterRuleSet,
  LibraryFilterField,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";

export type OperatorArity = "none" | "single" | "pair" | "list";

/** How many stars a rating has. The engine stores 0–5; nothing converts. */
export const RATING_STARS = 5;

/**
 * The unit the engine gives a rating, and the only one this build draws a
 * control for.
 *
 * Compared against what the field list says rather than against a list of
 * field names, so all three rating layers — the effective value and each side
 * of DEC-057 — get stars because the engine calls them stars.
 */
export const UNIT_STARS = "stars";

/** What an operator is called on screen. The engine speaks identifiers. */
const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  any_of: "is any of",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  between: "is between",
  before: "is before",
  after: "is after",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  // Membership (ORG-05). Spelled for what they ask rather than as another
  // "is": a track has as many tags as it was given, so "Tag is Peak-time"
  // would read as a claim that it has exactly one.
  has_tag: "has",
  not_has_tag: "does not have",
  in_collection: "is in",
  not_in_collection: "is not in",
};

export function operatorLabel(operator: string): string {
  return OPERATOR_LABELS[operator] ?? operator;
}

/** How many values an operator takes, as the engine described it. */
export function arityOf(
  vocabulary: LibraryFilterVocabulary | null,
  operator: string,
): OperatorArity {
  const arity = vocabulary?.operators?.[operator]?.arity;
  // "single" is the safe default: it asks for a value, and a clause with a
  // value the operator does not want is refused with a message, while one
  // missing a value it does want cannot even be built.
  return (arity as OperatorArity) ?? "single";
}

export function fieldOf(
  vocabulary: LibraryFilterVocabulary | null,
  name: string,
): LibraryFilterField | null {
  return vocabulary?.fields.find((field) => field.name === name) ?? null;
}

/** True when a field's value is a row id — a tag or a Collection (ORG-05). */
export function isMembership(field: LibraryFilterField | null): boolean {
  return field?.type === "tag" || field?.type === "collection";
}

/** True when a field's numbers are stars, because the engine said so. */
export function isStars(field: LibraryFilterField | null): boolean {
  return field?.unit === UNIT_STARS;
}

/**
 * Every field the engine describes, in its order.
 *
 * All of them, now that every kind has a control. The function stays because
 * it is what the bar's field list is built from, and a filter that silently
 * dropped a field is exactly the failure DEC-043 exists to make impossible —
 * so it is asserted against the vocabulary rather than removed.
 */
export function buildableFields(
  vocabulary: LibraryFilterVocabulary | null,
): LibraryFilterField[] {
  return [...(vocabulary?.fields ?? [])];
}

/** Stars, for a rating. The engine stores 0–5; nothing needs converting. */
export function starsFor(value: number): string {
  const count = Math.max(0, Math.min(RATING_STARS, Math.round(value)));
  return count === 0 ? "unrated" : "★".repeat(count);
}

/**
 * The names behind the ids a membership rule carries.
 *
 * A rule names a tag and a Collection by id, because both can be renamed and a
 * saved rule that changed meaning when someone fixed a spelling would be worse
 * than one that kept it. A chip still has to *read* as the name, so the screen
 * that has the vocabulary hands the lookup in.
 */
export interface ValueNames {
  tag?: ReadonlyMap<number, string>;
  collection?: ReadonlyMap<number, string>;
}

/** What is shown for an id whose row is gone — deleted between saves. */
export const MISSING_NAME = "(no longer there)";

/**
 * What is shown before the vocabulary has arrived.
 *
 * Not `MISSING_NAME`: "no longer there" about a tag that is perfectly
 * fine, for the second before the names load, is a lie a user would act on.
 * The absence of a lookup and the absence of a row are different facts.
 */
export const UNKNOWN_NAME = "…";

function nameFor(
  field: LibraryFilterField | null,
  value: unknown,
  names: ValueNames | undefined,
): string {
  const lookup = field?.type === "tag" ? names?.tag : names?.collection;
  const id = Number(value);
  if (!Number.isFinite(id)) return String(value);
  if (!lookup) return UNKNOWN_NAME;
  return lookup.get(id) ?? MISSING_NAME;
}

function valueText(
  field: LibraryFilterField | null,
  value: unknown,
  names?: ValueNames,
): string {
  if (Array.isArray(value)) {
    return value.map((item) => valueText(field, item, names)).join(", ");
  }
  if (isMembership(field)) return nameFor(field, value, names);
  if (value === null || value === undefined || value === "") return "(none)";
  if (field?.type === "bool") return value === true || value === "true" ? "yes" : "no";
  if (isStars(field) && typeof value === "number") return starsFor(value);
  return String(value);
}

/**
 * A clause in words: "Genre is House", "BPM is between 120 and 128".
 *
 * What a chip says, and therefore what a user checks their filter against.
 */
export function describeRule(
  vocabulary: LibraryFilterVocabulary | null,
  rule: FilterRule,
  names?: ValueNames,
): string {
  const field = fieldOf(vocabulary, rule.field);
  const label = field?.label ?? rule.field;
  const operator = operatorLabel(rule.operator);
  const arity = arityOf(vocabulary, rule.operator);

  if (arity === "none") return `${label} ${operator}`;
  if (arity === "pair" && Array.isArray(rule.value)) {
    const [low, high] = rule.value;
    return `${label} ${operator} ${valueText(field, low, names)} and ${valueText(field, high, names)}`;
  }
  return `${label} ${operator} ${valueText(field, rule.value, names)}`;
}

export interface DraftRule {
  field: string;
  operator: string;
  /** What was typed. One box, two for a range, comma-separated for a list. */
  value: string;
  secondValue: string;
}

export function emptyDraft(vocabulary: LibraryFilterVocabulary | null): DraftRule {
  const field = buildableFields(vocabulary)[0];
  return {
    field: field?.name ?? "",
    operator: field?.operators[0] ?? "",
    value: "",
    secondValue: "",
  };
}

/** The operators a draft's field allows, straight from the engine's answer. */
export function operatorsFor(
  vocabulary: LibraryFilterVocabulary | null,
  fieldName: string,
): string[] {
  return fieldOf(vocabulary, fieldName)?.operators ?? [];
}

/**
 * Change the field a draft is about, keeping its operator only if the new
 * field allows it.
 *
 * Switching from Genre to BPM with "contains" selected would otherwise leave a
 * clause the engine refuses, offered by a control that looks fine. The values
 * go with it: "Deep House" typed against Genre is not a tag id, and carrying
 * it across would offer a clause that can only be refused.
 */
export function withField(
  vocabulary: LibraryFilterVocabulary | null,
  draft: DraftRule,
  fieldName: string,
): DraftRule {
  const operators = operatorsFor(vocabulary, fieldName);
  const operator = operators.includes(draft.operator)
    ? draft.operator
    : (operators[0] ?? "");
  const before = fieldOf(vocabulary, draft.field);
  const after = fieldOf(vocabulary, fieldName);
  const keep = before?.type === after?.type;
  return {
    field: fieldName,
    operator,
    value: keep ? draft.value : "",
    secondValue: keep ? draft.secondValue : "",
  };
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export type BuildResult =
  | { ok: true; rule: FilterRule }
  | { ok: false; reason: string };

type ValueResult = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * Coerce one typed value the way the engine coerces it.
 *
 * Deliberately the same dispatch the engine's `_coerce_one` makes, on the same
 * field types, so a clause the bar assembles is one the engine accepts. It is
 * not a second validation: the engine still refuses what it refuses, and the
 * point of doing it here is that a user learns what is wrong from the control
 * they typed into rather than from an empty table.
 */
function coerceValue(field: LibraryFilterField, raw: string): ValueResult {
  const text = raw.trim();

  if (field.type === "bool") {
    if (text === "true") return { ok: true, value: true };
    if (text === "false") return { ok: true, value: false };
    // Covers the empty case too: a control on "Choose…" has not been answered,
    // and "yes or no" is what it is asking for.
    return { ok: false, reason: `${field.label} is yes or no` };
  }

  if (isMembership(field)) {
    const value = parseNumber(text);
    // Ids come from a chip or a picker, never from typing, so a value that is
    // not one is a control nobody answered rather than a user who mistyped —
    // said in the words of the control instead of as a missing value.
    if (value === null || !Number.isInteger(value) || value <= 0) {
      return { ok: false, reason: `Choose a ${field.label.toLocaleLowerCase()}` };
    }
    return { ok: true, value };
  }

  if (text === "") return { ok: false, reason: `Give a value for ${field.label}` };

  if (field.type === "number") {
    const value = parseNumber(text);
    if (value === null) return { ok: false, reason: `${field.label} takes numbers` };
    return { ok: true, value };
  }

  return { ok: true, value: text };
}

/**
 * Assemble a rule from a draft, or say why it cannot be.
 *
 * The reason is shown, not swallowed: a disabled "Add" button with no
 * explanation is a control a user cannot learn from.
 */
export function buildRule(
  vocabulary: LibraryFilterVocabulary | null,
  draft: DraftRule,
): BuildResult {
  const field = fieldOf(vocabulary, draft.field);
  if (!field) return { ok: false, reason: "Choose a field" };
  if (!field.operators.includes(draft.operator)) {
    return { ok: false, reason: `${field.label} cannot be filtered that way` };
  }

  const arity = arityOf(vocabulary, draft.operator);

  if (arity === "none") {
    return { ok: true, rule: { field: field.name, operator: draft.operator } };
  }

  if (arity === "pair") {
    if (draft.value.trim() === "" || draft.secondValue.trim() === "") {
      return { ok: false, reason: "Give both ends of the range" };
    }
    const low = coerceValue(field, draft.value);
    if (!low.ok) return low;
    const high = coerceValue(field, draft.secondValue);
    if (!high.ok) return high;
    return {
      ok: true,
      rule: {
        field: field.name,
        operator: draft.operator,
        value: [low.value, high.value],
      },
    };
  }

  if (arity === "list") {
    const parts = draft.value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (parts.length === 0) return { ok: false, reason: "Give at least one value" };
    const values: unknown[] = [];
    for (const part of parts) {
      const one = coerceValue(field, part);
      if (!one.ok) return one;
      values.push(one.value);
    }
    return {
      ok: true,
      rule: { field: field.name, operator: draft.operator, value: values },
    };
  }

  const single = coerceValue(field, draft.value);
  if (!single.ok) return single;
  return {
    ok: true,
    rule: { field: field.name, operator: draft.operator, value: single.value },
  };
}

/** A rule set with one more rule. Flat and AND-only for v1 (DEC-016). */
export function addRule(rules: FilterRuleSet | null, rule: FilterRule): FilterRuleSet {
  return { match: "all", rules: [...(rules?.rules ?? []), rule] };
}

/** A rule set with the rule at an index removed; null once it is empty. */
export function removeRule(
  rules: FilterRuleSet | null,
  index: number,
): FilterRuleSet | null {
  const remaining = (rules?.rules ?? []).filter((_, i) => i !== index);
  return remaining.length === 0 ? null : { match: "all", rules: remaining };
}

export function ruleCount(rules: FilterRuleSet | null): number {
  return rules?.rules.length ?? 0;
}

/** The ids a draft has selected, for a control that toggles them. */
export function selectedIds(draft: DraftRule): number[] {
  return draft.value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/**
 * Add or remove one id from a draft's value.
 *
 * `single` keeps one at a time — "has tag" asks about one tag — while a list
 * operator collects them, which is the only difference between "has" and
 * "is any of" as far as a chip row is concerned.
 */
export function toggleId(draft: DraftRule, id: number, arity: OperatorArity): DraftRule {
  const current = selectedIds(draft);
  if (arity !== "list") {
    return { ...draft, value: current.includes(id) ? "" : String(id) };
  }
  const next = current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
  return { ...draft, value: next.join(",") };
}
