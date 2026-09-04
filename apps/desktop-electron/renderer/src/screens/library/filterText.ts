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
 */
import type {
  FilterRule,
  FilterRuleSet,
  LibraryFilterField,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";

export type OperatorArity = "none" | "single" | "pair" | "list";

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

/** Stars, for a rating. The engine stores 0–5; nothing needs converting. */
export function starsFor(value: number): string {
  const count = Math.max(0, Math.min(5, Math.round(value)));
  return count === 0 ? "unrated" : "★".repeat(count);
}

function valueText(field: LibraryFilterField | null, value: unknown): string {
  if (value === null || value === undefined || value === "") return "(none)";
  if (field?.name === "rating" && typeof value === "number") return starsFor(value);
  if (Array.isArray(value)) {
    return value.map((item) => valueText(field, item)).join(", ");
  }
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
): string {
  const field = fieldOf(vocabulary, rule.field);
  const label = field?.label ?? rule.field;
  const operator = operatorLabel(rule.operator);
  const arity = arityOf(vocabulary, rule.operator);

  if (arity === "none") return `${label} ${operator}`;
  if (arity === "pair" && Array.isArray(rule.value)) {
    const [low, high] = rule.value;
    return `${label} ${operator} ${valueText(field, low)} and ${valueText(field, high)}`;
  }
  return `${label} ${operator} ${valueText(field, rule.value)}`;
}

export interface DraftRule {
  field: string;
  operator: string;
  /** What was typed. One box, two for a range, comma-separated for a list. */
  value: string;
  secondValue: string;
}

export function emptyDraft(vocabulary: LibraryFilterVocabulary | null): DraftRule {
  const field = vocabulary?.fields[0];
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
 * clause the engine refuses, offered by a control that looks fine.
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
  return { ...draft, field: fieldName, operator };
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
  const numeric = field.type === "number";

  if (arity === "none") {
    return { ok: true, rule: { field: field.name, operator: draft.operator } };
  }

  if (arity === "pair") {
    if (draft.value.trim() === "" || draft.secondValue.trim() === "") {
      return { ok: false, reason: "Give both ends of the range" };
    }
    if (numeric) {
      const low = parseNumber(draft.value);
      const high = parseNumber(draft.secondValue);
      if (low === null || high === null) {
        return { ok: false, reason: `${field.label} takes numbers` };
      }
      return {
        ok: true,
        rule: { field: field.name, operator: draft.operator, value: [low, high] },
      };
    }
    return {
      ok: true,
      rule: {
        field: field.name,
        operator: draft.operator,
        value: [draft.value.trim(), draft.secondValue.trim()],
      },
    };
  }

  if (arity === "list") {
    const parts = draft.value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    if (parts.length === 0) return { ok: false, reason: "Give at least one value" };
    if (numeric) {
      const numbers = parts.map(parseNumber);
      if (numbers.some((value) => value === null)) {
        return { ok: false, reason: `${field.label} takes numbers` };
      }
      return {
        ok: true,
        rule: { field: field.name, operator: draft.operator, value: numbers },
      };
    }
    return {
      ok: true,
      rule: { field: field.name, operator: draft.operator, value: parts },
    };
  }

  if (draft.value.trim() === "") {
    return { ok: false, reason: `Give a value for ${field.label}` };
  }
  if (numeric) {
    const value = parseNumber(draft.value);
    if (value === null) return { ok: false, reason: `${field.label} takes numbers` };
    return { ok: true, rule: { field: field.name, operator: draft.operator, value } };
  }
  return {
    ok: true,
    rule: { field: field.name, operator: draft.operator, value: draft.value.trim() },
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
