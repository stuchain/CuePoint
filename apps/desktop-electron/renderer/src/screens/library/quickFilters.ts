/**
 * The Key, BPM and Genre quick filters (FLW-4).
 *
 * Each choice in a quick filter becomes an ordinary rule in the same flat,
 * AND-only rule set the Add filter form builds, so a chip made here reads, is
 * removed and is saved like any other. Nothing is remembered outside the rules:
 * what a dropdown shows as ticked is read back from them.
 *
 * One value of a field is "Key is 8A"; several are "Key is any of 8A, 9A" — a
 * single rule, so the chip row does not fill up with one chip per key.
 */
import type { FilterRule, FilterRuleSet } from "../../api/cuepointBridge.types";

/** The fields a quick filter writes, which are the engine's own ids. */
export const KEY_FIELD = "key";
export const BPM_FIELD = "bpm";
export const GENRE_FIELD = "genre";

const VALUE_OPERATORS: readonly string[] = ["is", "any_of"];
const RANGE_OPERATORS: readonly string[] = ["between", "gte", "lte"];

function ruleSet(rules: FilterRule[]): FilterRuleSet | null {
  return rules.length === 0 ? null : { match: "all", rules };
}

/**
 * The rules with a field's rule of some operators replaced by another, in the
 * same place so its chip does not jump to the end; appended when there was
 * none, removed when `rule` is null.
 */
function replaceFamily(
  rules: FilterRuleSet | null,
  field: string,
  operators: readonly string[],
  rule: FilterRule | null,
): FilterRuleSet | null {
  const all = rules?.rules ?? [];
  const inFamily = (entry: FilterRule) =>
    entry.field === field && operators.includes(entry.operator);
  const at = all.findIndex(inFamily);
  const result: FilterRule[] = [];
  all.forEach((entry, index) => {
    if (!inFamily(entry)) result.push(entry);
    else if (index === at && rule) result.push(rule);
  });
  if (at === -1 && rule) result.push(rule);
  return ruleSet(result);
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The values a field's "is" / "is any of" rule names; empty when it has none. */
export function chosenValues(rules: FilterRuleSet | null, field: string): string[] {
  const rule = rules?.rules.find(
    (candidate) => candidate.field === field && VALUE_OPERATORS.includes(candidate.operator),
  );
  if (!rule) return [];
  const value = rule.value;
  return (Array.isArray(value) ? value : [value]).map(String);
}

/** True when the rules ask for the tracks that have no value for a field. */
export function asksForNone(rules: FilterRuleSet | null, field: string): boolean {
  return Boolean(
    rules?.rules.some((rule) => rule.field === field && rule.operator === "is_empty"),
  );
}

/**
 * The rules with one value of a field ticked or unticked.
 *
 * Ticking a value also drops a "has none" rule for the field, since a track
 * cannot be both; unticking the last value drops the rule.
 */
export function toggleValue(
  rules: FilterRuleSet | null,
  field: string,
  value: string,
): FilterRuleSet | null {
  const current = chosenValues(rules, field);
  const next = current.some((entry) => same(entry, value))
    ? current.filter((entry) => !same(entry, value))
    : [...current, value];
  const family = [...VALUE_OPERATORS, "is_empty"];
  if (next.length === 0) return replaceFamily(rules, field, family, null);
  const rule: FilterRule =
    next.length === 1
      ? { field, operator: "is", value: next[0] }
      : { field, operator: "any_of", value: next };
  return replaceFamily(rules, field, family, rule);
}

/** The rules asking for the tracks with no value for a field, or no longer asking. */
export function toggleNone(rules: FilterRuleSet | null, field: string): FilterRuleSet | null {
  const family = [...VALUE_OPERATORS, "is_empty"];
  return replaceFamily(
    rules,
    field,
    family,
    asksForNone(rules, field) ? null : { field, operator: "is_empty" },
  );
}

/** The two ends of a BPM range rule, or nulls; blank ends are open. */
export function chosenRange(
  rules: FilterRuleSet | null,
  field: string,
): { from: number | null; to: number | null } {
  const rule = rules?.rules.find(
    (candidate) => candidate.field === field && RANGE_OPERATORS.includes(candidate.operator),
  );
  if (!rule) return { from: null, to: null };
  if (rule.operator === "between" && Array.isArray(rule.value)) {
    return { from: Number(rule.value[0]), to: Number(rule.value[1]) };
  }
  const value = Number(rule.value);
  return rule.operator === "gte" ? { from: value, to: null } : { from: null, to: value };
}

/**
 * The rules with a numeric field held to a range, replacing any range already
 * on it. Both ends are a "between"; one end alone is "at least" or "at most";
 * neither removes the range.
 */
export function applyRange(
  rules: FilterRuleSet | null,
  field: string,
  from: number | null,
  to: number | null,
): FilterRuleSet | null {
  if (from === null && to === null) return replaceFamily(rules, field, RANGE_OPERATORS, null);
  const rule: FilterRule =
    from !== null && to !== null
      ? { field, operator: "between", value: [Math.min(from, to), Math.max(from, to)] }
      : from !== null
        ? { field, operator: "gte", value: from }
        : { field, operator: "lte", value: to };
  return replaceFamily(rules, field, RANGE_OPERATORS, rule);
}

/** What a quick-filter button shows beside its name: how many choices it holds. */
export function quickCount(rules: FilterRuleSet | null, field: string): number {
  if (field === BPM_FIELD) {
    const { from, to } = chosenRange(rules, field);
    return from !== null || to !== null ? 1 : 0;
  }
  return chosenValues(rules, field).length + (asksForNone(rules, field) ? 1 : 0);
}
