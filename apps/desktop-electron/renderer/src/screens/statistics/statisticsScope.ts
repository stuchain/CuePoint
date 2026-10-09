/**
 * The scope the Statistics page counts over (STATS-04, DEC-162).
 *
 * The whole library, a Rekordbox playlist or folder, or one of CuePoint's
 * Collections, Smart Collections and Sets. The page speaks the route's own
 * words: `library`, `playlist:<id>` or `collection:<id>` (a Smart Collection
 * and a Set are Collections to the route). The choice is remembered under
 * `cuepoint-statistics-scope`, read and written the way `keysSources.ts` does:
 * a store that is missing or throws only means the page opens on the whole
 * library. A playlist is remembered by its path, not its id, because every
 * import and refresh gives the playlists new ids.
 */
import type { CollectionNode, LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import type { SelectOption } from "../../components/Select";
import { WHOLE_LIBRARY, scopeOptions } from "../clean/cleanRules";

export const STATISTICS_SCOPE_STORAGE_KEY = "cuepoint-statistics-scope";

/** The scope the route takes when nothing narrows it. */
export const WHOLE_LIBRARY_SCOPE = WHOLE_LIBRARY;

/** The remembered form of a playlist: its path. */
const PATH_PREFIX = "path:";

/** What the broken Smart Collections are called in the picker. */
const BROKEN_NOTE = " (rules need fixing)";

/** The remembered scope, or null when there is none that reads. */
export function loadScope(): string | null {
  try {
    return window.localStorage.getItem(STATISTICS_SCOPE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveScope(scope: string): void {
  try {
    window.localStorage.setItem(STATISTICS_SCOPE_STORAGE_KEY, scope);
  } catch {
    // Remembering is a convenience: a blocked store only means the next visit starts over.
  }
}

/**
 * What the picker offers: the whole library, a "Rekordbox playlists" header over the
 * playlists in the Library's tree order (deliberately first, as the Library lists them), then
 * the Collections, Smart Collections and Sets. A Collection folder is drawn and cannot be
 * chosen, since it holds no tracks, and a Smart Collection whose saved rules no longer run is
 * drawn disabled and says so. A Smart Collection is asked for as a Collection, which is how
 * the route reads it.
 */
export function statisticsScopeOptions(
  playlists: readonly LibraryPlaylistNode[],
  collections: readonly CollectionNode[],
): SelectOption[] {
  const broken = new Set(collections.filter((node) => node.broken).map((node) => node.id));
  const all = scopeOptions(playlists, collections).map((option): SelectOption => {
    if (option.value === WHOLE_LIBRARY) return { ...option, label: "Whole library" };
    if (!option.value.startsWith("smart:")) return option;
    const id = Number(option.value.slice("smart:".length));
    return {
      ...option,
      value: `collection:${id}`,
      ...(broken.has(id) ? { label: option.label + BROKEN_NOTE, disabled: true } : {}),
    };
  });
  if (playlists.length === 0) return all;
  return [
    ...all.slice(0, 1),
    { value: "header:playlists", label: "Rekordbox playlists", disabled: true },
    ...all.slice(1),
  ];
}

/**
 * What to remember for a choice: a playlist by its path, anything else as the route spells it.
 * A path is not guaranteed unique, but it is what the Library's own pane remembers.
 */
export function rememberedForm(scope: string, playlists: readonly LibraryPlaylistNode[]): string {
  if (!scope.startsWith("playlist:")) return scope;
  const id = Number(scope.slice("playlist:".length));
  const node = playlists.find((candidate) => candidate.id === id);
  return node ? PATH_PREFIX + node.path : scope;
}

/**
 * The scope to read: the remembered one while it is still on offer (a remembered playlist
 * path is resolved to the playlist's id now), otherwise the whole library. Nothing is written
 * back, so a Collection that is only briefly unreadable is not forgotten.
 */
export function effectiveScope(
  remembered: string | null,
  options: readonly SelectOption[],
  playlists: readonly LibraryPlaylistNode[] = [],
): string {
  if (remembered === null || remembered === WHOLE_LIBRARY_SCOPE) return WHOLE_LIBRARY_SCOPE;
  let scope = remembered;
  if (remembered.startsWith(PATH_PREFIX)) {
    const path = remembered.slice(PATH_PREFIX.length);
    const node = playlists.find((candidate) => candidate.path === path);
    scope = node ? `playlist:${node.id}` : "";
  }
  const found = options.find((option) => option.value === scope);
  return found && !found.disabled ? scope : WHOLE_LIBRARY_SCOPE;
}
