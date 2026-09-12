/**
 * The bar's rules, and the Smart Collection they came from (ORG-12, DEC-043).
 *
 * DEC-016 said a Smart Collection is a saved rule set in the same model the
 * filter bar builds, and LIBUI-02 said Phase 6 would inherit that model rather
 * than translate it. This module is where that stops being a claim: opening a
 * Smart Collection puts its rules in the bar, and saving the bar's rules sends
 * them **as they are**. There is no conversion in either direction, and the
 * absence of one is the point — a translation step is a second definition of
 * what a rule means, and the two would drift.
 *
 * What it adds is one distinction the bar cannot make on its own: whether the
 * rules on screen are still the rules on disk.
 *
 * - **Attached and unchanged** — the table asks for the Collection by id
 *   (`scope: "smart"`), which is the path ORG-08 built. The engine resolves the
 *   saved rules, so what the table shows is what the Smart Collection *is*,
 *   not what a copy of its rules happens to match.
 * - **Attached and modified** — the table asks for the rules on screen instead.
 *   A user who takes a clause out and sees the same rows has been told nothing.
 *   The Smart Collection is untouched until they say to touch it, and the bar
 *   says so in as many words: silently rewriting a saved rule set because
 *   somebody narrowed a view is the quiet mutation this project keeps refusing.
 */
import type { FilterRule, FilterRuleSet } from "../../api/cuepointBridge.types";
import type { LibraryQuery } from "./libraryQuery";

/** A Smart Collection the bar is editing, and the rules it has on disk. */
export interface SmartAttachment {
  id: number;
  name: string;
  /** What was saved. Null for a Smart Collection saved with no rules at all. */
  saved: FilterRuleSet | null;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }
  return left === right;
}

function sameRule(left: FilterRule, right: FilterRule): boolean {
  return (
    left.field === right.field &&
    left.operator === right.operator &&
    sameValue(left.value ?? null, right.value ?? null)
  );
}

/**
 * Whether two rule sets ask the same question.
 *
 * In order, because the rules are a list a user arranged and two lists with
 * the same clauses in a different order are the same question asked
 * differently — but "modified" is about what is on screen, and reordering is
 * something a user did. Treating a reorder as no change would leave them
 * unable to save it.
 */
export function sameRuleSet(
  left: FilterRuleSet | null,
  right: FilterRuleSet | null,
): boolean {
  const ours = left?.rules ?? [];
  const theirs = right?.rules ?? [];
  if (ours.length !== theirs.length) return false;
  // `match` is compared too, even though v1 only ever writes "all" (DEC-016).
  // MATCH_ANY is declared and reserved in the engine, and the day it arrives
  // "all of these" and "any of these" must not read as the same question.
  if ((left?.match ?? "all") !== (right?.match ?? "all")) return false;
  return ours.every((rule, index) => sameRule(rule, theirs[index]));
}

/** True when the bar holds something other than what the Collection saved. */
export function isModified(
  attached: SmartAttachment | null,
  rules: FilterRuleSet | null,
): boolean {
  if (!attached) return false;
  return !sameRuleSet(attached.saved, rules);
}

/** The part of the query the bar owns: what to ask, and what to ask it of. */
export type SmartQuery = Pick<LibraryQuery, "filters" | "scope" | "collectionId">;

/**
 * What the table should be showing, given the bar's rules and its attachment.
 *
 * The three cases are the whole of the model. Nothing else in the page needs
 * to know which one it is in.
 */
export function smartQuery(
  attached: SmartAttachment | null,
  rules: FilterRuleSet | null,
): Partial<SmartQuery> {
  if (!attached) {
    // No Collection in play: the bar's rules are the whole question, and the
    // scope is whatever else the page set — a playlist, a Collection, nothing.
    return { filters: rules };
  }
  if (!isModified(attached, rules)) {
    // The saved rules resolve on the engine's side, so they are not sent
    // twice and a Smart Collection opens as itself rather than as a copy.
    return { filters: null, scope: "smart", collectionId: attached.id };
  }
  // Editing detaches the *view* without detaching the editor: the table shows
  // what is on screen while the Collection keeps what it saved.
  return { filters: rules, scope: null, collectionId: null };
}

/** What the bar says about the Collection it is editing. */
export function smartStatus(
  attached: SmartAttachment | null,
  rules: FilterRuleSet | null,
): string | null {
  if (!attached) return null;
  return isModified(attached, rules)
    ? `Smart Collection “${attached.name}” — modified, not saved`
    : `Smart Collection “${attached.name}”`;
}

/** How long a Smart Collection's name may be. The engine's limit, mirrored. */
export const SMART_NAME_MAX_LENGTH = 120;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/**
 * A name for a new Smart Collection, or why it is not one.
 *
 * Checked here so the dialog can say so before it writes. The engine checks
 * the same things and is still the one that refuses a duplicate, which it
 * knows about and this does not.
 */
export function checkSmartName(raw: string): NameCheck {
  const name = raw.trim();
  if (name === "") return { ok: false, reason: "Give it a name" };
  if (name.length > SMART_NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `A name is at most ${SMART_NAME_MAX_LENGTH} characters`,
    };
  }
  return { ok: true, name };
}

/**
 * What saving would write, and why it cannot be written.
 *
 * A Smart Collection with no rules matches the whole library, which is not a
 * collection of anything. It is refused here rather than saved and wondered
 * about later.
 */
export function canSaveSmart(rules: FilterRuleSet | null): {
  ok: boolean;
  why: string;
} {
  if ((rules?.rules.length ?? 0) === 0) {
    return { ok: false, why: "Add a filter first — a Smart Collection is its rules." };
  }
  return { ok: true, why: "" };
}
