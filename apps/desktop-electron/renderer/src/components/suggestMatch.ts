import type { Suggestion } from "./SuggestInput";

/** The suggestions a typed text leaves: every one it appears in, any case, as a native list did. */
export function matchSuggestions(
  suggestions: readonly Suggestion[],
  typed: string,
): Suggestion[] {
  const needle = typed.trim().toLowerCase();
  const found = suggestions.filter(
    (item) =>
      item.value !== "" &&
      (needle === "" ||
        item.value.toLowerCase().includes(needle) ||
        (item.label ?? "").toLowerCase().includes(needle)),
  );
  // Only the text itself left: nothing more to offer, and no list over what is below.
  if (found.length === 1 && found[0]!.value.toLowerCase() === needle) return [];
  return found;
}
