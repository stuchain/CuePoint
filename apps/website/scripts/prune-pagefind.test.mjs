import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prunePagefind } from "./prune-pagefind.mjs";

const made = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("prunePagefind", () => {
  it("removes the unused UI and keeps what search needs", () => {
    const dist = mkdtempSync(join(tmpdir(), "prune-"));
    made.push(dist);
    const dir = join(dist, "pagefind");
    mkdirSync(join(dir, "index"), { recursive: true });
    const unused = ["pagefind-ui.js", "pagefind-component-ui.js", "pagefind-modular-ui.js", "pagefind-highlight.js", "pagefind-ui.css", "pagefind-modular-ui.css", "wasm.unknown.pagefind"];
    const kept = ["pagefind.js", "pagefind-worker.js", "pagefind-entry.json", "wasm.en.pagefind", "pagefind.en_x.pf_meta"];
    for (const n of [...unused, ...kept]) writeFileSync(join(dir, n), "x");
    expect(prunePagefind(dist).sort()).toEqual([...unused].sort());
    for (const n of unused) expect(existsSync(join(dir, n)), n).toBe(false);
    for (const n of kept) expect(existsSync(join(dir, n)), n).toBe(true);
    expect(existsSync(join(dir, "index"))).toBe(true);
  });

  it("fails when pagefind has not run", () => {
    expect(() => prunePagefind(join(tmpdir(), "no-such-dist"))).toThrow(/run pagefind first/);
  });
});
