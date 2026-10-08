/**
 * Opening the Keys page on sources from somewhere else (PAGES-16).
 *
 * The Library's Key list leads here with the open playlist or Collection ticked, and
 * Phase 15's key spread will lead here with its own sources (DEC-206). The sources
 * travel in the router's location state, as a rule set does to the Library
 * (`libraryLink.ts`): structured data, not remembered as a destination, and checked here
 * before it becomes anything, since a location can be pushed by any code in the renderer.
 */
import type { PickedSource } from "./keysSources";

const STATE_KEY = "cuepointKeysSources";

const KINDS: readonly string[] = ["playlist", "collection", "set"];

/** The location state that opens the Keys page on these sources; none is the whole library. */
export function keysState(sources: readonly PickedSource[]): Record<string, unknown> {
  return { [STATE_KEY]: sources.map((source) => ({ kind: source.kind, id: source.id })) };
}

/** What the page is asked to open with, and the navigation that asked, so it is applied once. */
export interface KeysOpening {
  sources: PickedSource[];
  token: string;
}

/** The sources a location carries, or null when it asks for nothing. */
export function keysOpening(location: { state: unknown; key: string }): KeysOpening | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[STATE_KEY];
  if (!Array.isArray(carried)) return null;
  const sources: PickedSource[] = [];
  for (const item of carried) {
    if (!item || typeof item !== "object") continue;
    const { kind, id } = item as Record<string, unknown>;
    if (typeof kind !== "string" || !KINDS.includes(kind)) continue;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    sources.push({ kind: kind as PickedSource["kind"], id });
  }
  return { sources, token: location.key };
}
