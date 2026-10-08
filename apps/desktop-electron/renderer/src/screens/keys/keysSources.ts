/**
 * The sources the Keys page counts (PAGES-16).
 *
 * Nothing ticked is the whole library; otherwise any mix of Rekordbox playlists,
 * Collections and Sets. A playlist's id and a Collection's can be the same number, so a
 * source is its kind and its id together, as the "In playlist" rule has it (FLW-7).
 * The ticks are remembered under `cuepoint-keys-sources`, read and written the way
 * `scale.ts` does: a store that is missing or throws just means the page opens on the
 * whole library.
 */
import type { KeySource } from "../../api/cuepointBridge.types";

export const KEYS_SOURCES_STORAGE_KEY = "cuepoint-keys-sources";

/** A playlist, Collection or Set that is ticked. */
export interface PickedSource {
  kind: "playlist" | "collection" | "set";
  id: number;
}

const KINDS: readonly string[] = ["playlist", "collection", "set"];

export function sameSource(a: PickedSource, b: PickedSource): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** A source with its kind: the key a checkbox is found by. */
export function sourceKey(source: PickedSource): string {
  return `${source.kind}:${source.id}`;
}

function asSource(value: unknown): PickedSource | null {
  if (!value || typeof value !== "object") return null;
  const { kind, id } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.includes(kind)) return null;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  return { kind: kind as PickedSource["kind"], id };
}

/** The remembered sources, or none (the whole library) when there are none that read. */
export function loadSources(): PickedSource[] {
  try {
    const raw = window.localStorage.getItem(KEYS_SOURCES_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const source = asSource(item);
      return source ? [source] : [];
    });
  } catch {
    return [];
  }
}

export function saveSources(sources: readonly PickedSource[]): void {
  try {
    window.localStorage.setItem(KEYS_SOURCES_STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // Remembering is a convenience: a blocked store only means the next visit starts over.
  }
}

/** The sources with one ticked or unticked, the rest kept in the order they were ticked. */
export function toggleSource(
  sources: readonly PickedSource[],
  source: PickedSource,
): PickedSource[] {
  return sources.some((item) => sameSource(item, source))
    ? sources.filter((item) => !sameSource(item, source))
    : [...sources, source];
}

/** The sources that still exist: a playlist a refresh removed is dropped, not counted. */
export function keepExisting(
  sources: readonly PickedSource[],
  available: readonly PickedSource[],
): PickedSource[] {
  return sources.filter((source) => available.some((item) => sameSource(item, source)));
}

/** What the engine is asked to count: the whole library when nothing is ticked. */
export function requestSources(sources: readonly PickedSource[]): KeySource[] {
  return sources.length === 0
    ? [{ kind: "all" }]
    : sources.map((source) => ({ kind: source.kind, id: source.id }));
}

/** The sources in words for the summary line: "the whole library", "2 playlists and 1 Set". */
export function sourcesWords(sources: readonly PickedSource[]): string {
  if (sources.length === 0) return "the whole library";
  const count = (kind: PickedSource["kind"]) => sources.filter((item) => item.kind === kind).length;
  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    count("playlist") > 0 ? noun(count("playlist"), "playlist", "playlists") : null,
    count("collection") > 0 ? noun(count("collection"), "Collection", "Collections") : null,
    count("set") > 0 ? noun(count("set"), "Set", "Sets") : null,
  ].filter((part): part is string => part !== null);
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The source the engine names in a `SOURCE_NOT_FOUND` message ("No playlist with id 3"), or
 * null when the words are not that shape.
 */
export function goneSource(message: string): PickedSource | null {
  const found = /^No (playlist|collection|set) with id (\d+)/i.exec(message.trim());
  if (!found) return null;
  return { kind: found[1]!.toLowerCase() as PickedSource["kind"], id: Number(found[2]) };
}
