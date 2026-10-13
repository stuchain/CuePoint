/**
 * G6 T3 guard: a dropdown is the shared `Select`, not a raw `<select>`.
 *
 * `Select` hides the native arrow (`appearance: none`) and draws a pixel chevron, so a raw
 * `<select>` is the one control that still looks different. The files below are the owners'
 * pages that still use one; the list only shrinks, and the final G6 step makes it empty.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  ["/src/**/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.stories.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

export const RAW_SELECT_ALLOWLIST: readonly string[] = [
  "screens/AudioSettingsPanel.tsx",
  "screens/library/EditValuesDialog.tsx",
  "screens/library/RekordboxExportDialog.tsx",
  "screens/library/WriteTagsDialog.tsx",
  "screens/prepare/NewSetDialogs.tsx",
  "screens/prepare/SetEntryZone.tsx",
  "screens/prepare/SourcePanel.tsx",
];

function usesRawSelect(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  return /<select[\s>]/.test(code);
}

function offenders(): string[] {
  return Object.entries(sources)
    .filter(([path, source]) => !path.endsWith("/src/components/Select.tsx") && usesRawSelect(source))
    .map(([path]) => path.replace(/^\/src\//, ""))
    .sort();
}

describe("raw select guard (T3)", () => {
  it("has no <select> outside Select.tsx except the allowlist", () => {
    const fresh = offenders().filter((path) => !RAW_SELECT_ALLOWLIST.includes(path));
    expect(fresh, `use components/Select in: ${fresh.join(", ")}`).toEqual([]);
  });

  it("keeps the allowlist honest: every listed file still has a raw select", () => {
    const stale = RAW_SELECT_ALLOWLIST.filter((path) => !offenders().includes(path));
    expect(stale, `remove from the allowlist: ${stale.join(", ")}`).toEqual([]);
  });

  it("still finds the shared Select", () => {
    expect(Object.keys(sources)).toContain("/src/components/Select.tsx");
  });
});
