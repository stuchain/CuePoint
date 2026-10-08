/**
 * No two modules whose names differ only in case.
 *
 * Windows and macOS file systems ignore case, and the resolver tries `.ts` before `.tsx`,
 * so `./QuickFilters` (the component) found `quickFilters.ts` (its rules) there and the
 * Library rendered nothing, while Linux, which keeps case, passed. Tests are left out:
 * nothing imports them, so `prepareSource.test.ts` beside `PrepareSource.test.tsx` is fine.
 */
import { describe, expect, it } from "vitest";

const MODULES = Object.keys(
  import.meta.glob(["./**/*.{ts,tsx,css}", "!./**/*.test.{ts,tsx}"], { eager: false }),
);

describe("module file names", () => {
  it("never differ only in case", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const path of MODULES) {
      const stem = path.replace(/\.(ts|tsx)$/, "").toLowerCase();
      const other = seen.get(stem);
      if (other !== undefined && other !== path) clashes.push(`${other} and ${path}`);
      else seen.set(stem, path);
    }
    expect(clashes).toEqual([]);
  });
});
