/**
 * Keeping where a Smart Collection came from (FLW-7).
 *
 * A Smart Collection is a rule set, and a playlist, a Collection or a Set is a
 * scope the table opens on, not a rule. Saving "8A" while "Warm-up" was open
 * used to save "8A" alone, and the playlist was dropped without a word. The
 * place is now a rule too — "In playlist is any of Warm-up" — added to what is
 * saved, so "8A in Warm-up" stays that.
 */
import type { FilterRule, FilterRuleSet } from "../../api/cuepointBridge.types";
import type { RuleSource } from "./filterText";

/** The rule field the places are saved under. */
export const IN_PLAYLIST_FIELD = "in_playlist";

/** The place the table is open on, as a rule source, or null for the library. */
export function openSource(
  playlistId: number | null,
  scoped: { id: number; kind: string } | null,
): RuleSource | null {
  // A Rekordbox playlist and a Collection can both be named by one query (the
  // engine narrows by both); the pane only ever selects one.
  if (playlistId != null) return { kind: "playlist", id: playlistId };
  if (scoped?.kind === "set") return { kind: "set", id: scoped.id };
  if (scoped?.kind === "collection") return { kind: "collection", id: scoped.id };
  return null;
}

/**
 * The rules with a place added: a new "In playlist" rule, or the place joined
 * to the one already there. Nothing changes when the place is already named.
 */
export function withSource(
  rules: FilterRuleSet | null,
  source: RuleSource | null,
): FilterRuleSet | null {
  if (!source) return rules;
  const all = rules?.rules ?? [];
  const at = all.findIndex(
    (rule) => rule.field === IN_PLAYLIST_FIELD && rule.operator === "any_of",
  );
  const named = (list: unknown): RuleSource[] => (Array.isArray(list) ? (list as RuleSource[]) : []);
  if (at === -1) {
    const rule: FilterRule = { field: IN_PLAYLIST_FIELD, operator: "any_of", value: [source] };
    return { match: "all", rules: [...all, rule] };
  }
  const existing = named(all[at]!.value);
  if (existing.some((item) => item.kind === source.kind && item.id === source.id)) return rules;
  const joined: FilterRule = { ...all[at]!, value: [...existing, source] };
  return { match: "all", rules: all.map((rule, index) => (index === at ? joined : rule)) };
}
