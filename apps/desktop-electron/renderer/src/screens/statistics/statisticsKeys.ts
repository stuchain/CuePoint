/**
 * The Keys page's version of a Statistics scope (STATS-06, DEC-206). The scope is the route's own echo (`spreads.scope`),
 * never the picker's value.
 *
 * The page speaks the route's words (`library`, `playlist:<id>`, `collection:<id>`); the Keys
 * page counts sources, each a kind and an id. A Collection or a Set is a source as it is, and a
 * playlist too. A Smart Collection is not one: its rules decide its tracks. It is a source only
 * when its whole rule set is one "In playlist is any of" rule (what saving a view opened on a
 * playlist makes), since then those sources are exactly the tracks it holds. Any other Smart
 * Collection cannot be counted by Keys, and the answer says so rather than counting something
 * else.
 */
import type { CollectionNode } from "../../api/cuepointBridge.types";
import type { PickedSource } from "../keys/keysSources";
import { IN_PLAYLIST_FIELD, keysSources } from "../library/savedScope";

export type KeysScope =
  | { kind: "sources"; picked: PickedSource[] }
  | { kind: "unsupported"; reason: string };

const CANNOT = "Keys cannot count this selection, so it opens on your whole library.";

export function keysScopeFor(scope: string, collections: readonly CollectionNode[]): KeysScope {
  if (scope === "library") return { kind: "sources", picked: [] };
  const [kind, raw] = scope.split(":");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { kind: "unsupported", reason: CANNOT };
  if (kind === "playlist") return { kind: "sources", picked: [{ kind: "playlist", id }] };
  if (kind !== "collection") return { kind: "unsupported", reason: CANNOT };

  const node = collections.find((item) => item.id === id);
  if (node?.kind === "collection" || node?.kind === "set") {
    return { kind: "sources", picked: [{ kind: node.kind, id }] };
  }
  if (node?.kind === "smart") {
    const rules = node.rules?.rules ?? [];
    const onlyPlaces =
      rules.length === 1 && rules[0]!.field === IN_PLAYLIST_FIELD && rules[0]!.operator === "any_of";
    const places = onlyPlaces ? keysSources(null, null, node.rules) : [];
    if (places.length > 0) return { kind: "sources", picked: places };
    return {
      kind: "unsupported",
      reason:
        "Keys counts playlists, Collections and Sets, not a Smart Collection's rules, so it opens on your whole library.",
    };
  }
  return { kind: "unsupported", reason: CANNOT };
}
