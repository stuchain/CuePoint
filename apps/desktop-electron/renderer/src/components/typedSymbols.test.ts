/**
 * G6 T10 guard: no typed arrow, chevron, cross or pencil glyphs standing in for icons.
 *
 * These marks (`▸▾▼▲↑↓↻×✎✕`) are drawn with `PixelIcon` / `<Button iconOnly icon=…>` so they
 * look the same in every font and theme. The pages that still type them are listed below by
 * the owners that will move them; the list only shrinks, and the final G6 step makes it empty.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/**/*.stories.tsx", "!/src/**/*.d.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const SYMBOLS = /[▸▾▼▲↑↓↻×✎✕]/;

/** Source with comments removed, and a multiplication sign after a digit ("1.5×") or a template value (`${scale}×`) left alone. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\w])\/\/[^\n]*/g, "$1")
    .replace(/([\d}])×/g, "$1x")
    .replace(/(\w) × (\w)/g, "$1 x $2");
}

/** Files that type one of the symbols today. Remove a path when its page moves to icons. */
export const TYPED_SYMBOL_ALLOWLIST: readonly string[] = [
  "components/player/PlayerBar.tsx",
  "components/player/QueuePanel.tsx",
  "components/table/TrackTable.tsx",
  "screens/clean/FixValues.tsx",
  "screens/discover/BeatportHalf.tsx",
  "screens/discover/DiscoverScreen.tsx",
  "screens/library/CollectionsPane.tsx",
  "screens/library/DisclosureSection.tsx",
  "screens/library/FilterBar.tsx",
  "screens/library/LibraryToolbar.tsx",
  "screens/library/PaneTree.tsx",
  "screens/library/QuickFilters.tsx",
  "screens/library/TrackDetailPanel.tsx",
  "screens/library/TrackYours.tsx",
  "screens/prepare/PrepareScreen.tsx",
  "screens/prepare/entryActions.ts",
  "screens/prepare/prepareColumns.tsx",
  "screens/prepare/prepareEditing.tsx",
  "screens/prepare/sourceColumns.tsx",
];

function offenders(): string[] {
  return Object.entries(sources)
    .filter(([, source]) => SYMBOLS.test(codeOf(source)))
    .map(([path]) => path.replace(/^\/src\//, ""))
    .sort();
}

describe("typed symbols guard (T10)", () => {
  it("lists no new file that types an icon glyph", () => {
    const fresh = offenders().filter((path) => !TYPED_SYMBOL_ALLOWLIST.includes(path));
    expect(fresh, `use PixelIcon instead of a typed glyph in: ${fresh.join(", ")}`).toEqual([]);
  });

  it("keeps the allowlist honest: every listed file still has a glyph", () => {
    const stale = TYPED_SYMBOL_ALLOWLIST.filter((path) => !offenders().includes(path));
    expect(stale, `remove from the allowlist: ${stale.join(", ")}`).toEqual([]);
  });

  it("covers the shared components built in G6 step 2", () => {
    const shared = ["components/Modal.tsx", "components/TrackContextMenu.tsx", "components/Select.tsx"];
    for (const path of shared) expect(offenders()).not.toContain(path);
  });
});
