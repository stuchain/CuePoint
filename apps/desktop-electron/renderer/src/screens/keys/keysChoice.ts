/**
 * Which keys are chosen on the Keys page, and the rules that choice makes (PAGES-16).
 *
 * A click chooses one key; Ctrl (Command on a Mac) adds or removes one; Shift chooses the run
 * from the last key clicked. The same functions answer the wheel and the list, so the two
 * cannot disagree. "No Beatport key" stands alone: a track cannot be both keyless and in 8A.
 * The tracks beneath are an ordinary rule set — "Key is any of …" and "In playlist is any of
 * …" (PAGES-05's fields) — so Open in Library and Save as Smart Collection are the Library's own.
 */
import type { FilterRule, FilterRuleSet } from "../../api/cuepointBridge.types";
import type { PickedSource } from "./keysSources";

export interface KeyChoice {
  /** The chosen keys, in Camelot order. */
  keys: string[];
  /** "No Beatport key" is chosen. */
  none: boolean;
  /** The key last clicked: where Shift starts from, and what "mix with" is about. */
  anchor: string | null;
}

export const EMPTY_CHOICE: KeyChoice = { keys: [], none: false, anchor: null };

export type ChoiceMode = "only" | "toggle" | "range";

/** How a click chooses: Ctrl or Command toggles, Shift takes a run, a plain click is alone. */
export function modeFromEvent(event: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): ChoiceMode {
  if (event.shiftKey) return "range";
  if (event.ctrlKey || event.metaKey) return "toggle";
  return "only";
}

/** `codes` in the order of `order`; anything `order` does not know goes last. */
function inOrder(codes: readonly string[], order: readonly string[]): string[] {
  const rank = (code: string) => {
    const at = order.indexOf(code);
    return at === -1 ? order.length : at;
  };
  return [...codes].sort((a, b) => rank(a) - rank(b));
}

/**
 * The choice after `code` was clicked. `order` is the keys that can be chosen, in the order
 * the list shows them: what a Shift run is a run of.
 */
export function chooseKey(
  choice: KeyChoice,
  code: string,
  order: readonly string[],
  mode: ChoiceMode,
): KeyChoice {
  const held = choice.keys.includes(code);
  if (mode === "toggle") {
    const keys = held ? choice.keys.filter((key) => key !== code) : [...choice.keys, code];
    return {
      keys: inOrder(keys, order),
      none: false,
      anchor: held ? (keys.at(-1) ?? null) : code,
    };
  }
  if (mode === "range" && choice.anchor !== null) {
    const from = order.indexOf(choice.anchor);
    const to = order.indexOf(code);
    if (from !== -1 && to !== -1) {
      const run = order.slice(Math.min(from, to), Math.max(from, to) + 1);
      return { keys: [...run], none: false, anchor: code };
    }
  }
  if (mode === "only" && held && choice.keys.length === 1) return EMPTY_CHOICE;
  return { keys: [code], none: false, anchor: code };
}

/** "No Beatport key" chosen or let go; choosing it lets go of the keys. */
export function chooseNone(choice: KeyChoice): KeyChoice {
  return choice.none ? EMPTY_CHOICE : { keys: [], none: true, anchor: null };
}

/** True when something is chosen. */
export function hasChoice(choice: KeyChoice): boolean {
  return choice.none || choice.keys.length > 0;
}

/**
 * The rules the choice and the ticked sources make, or null before a key is chosen. A source
 * is "In playlist", whatever kind it is (FLW-7).
 */
export function choiceRules(
  choice: KeyChoice,
  sources: readonly PickedSource[],
): FilterRuleSet | null {
  if (!hasChoice(choice)) return null;
  const rules: FilterRule[] = [];
  if (choice.none) {
    rules.push({ field: "key", operator: "is_empty" });
  } else if (choice.keys.length === 1) {
    rules.push({ field: "key", operator: "is", value: choice.keys[0] });
  } else {
    rules.push({ field: "key", operator: "any_of", value: [...choice.keys] });
  }
  if (sources.length > 0) {
    rules.push({
      field: "in_playlist",
      operator: "any_of",
      value: sources.map((source) => ({ kind: source.kind, id: source.id })),
    });
  }
  return { match: "all", rules };
}

/** The choice in words: "8A", "8A and 9A", "1A, 8A and 9A". */
export function choiceWords(choice: KeyChoice): string {
  if (choice.none) return "No Beatport key";
  const keys = choice.keys;
  if (keys.length <= 1) return keys.join("");
  return `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}
