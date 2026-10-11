import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makePublic } from "./make-public.mjs";

describe("make-public (SITE-13)", () => {
  it("sets PUBLIC to true in the real site.config.ts and touches nothing else", () => {
    const source = readFileSync(new URL("../site.config.ts", import.meta.url), "utf8");
    const out = makePublic(source);
    expect(out).toMatch(/^export const PUBLIC = true;$/m);
    expect(out.replace("PUBLIC = true;", "PUBLIC = false;")).toBe(source);
  });
  it("keeps a type annotation", () => {
    expect(makePublic("export const PUBLIC: boolean = false;\n")).toBe("export const PUBLIC: boolean = true;\n");
  });
  it("fails when the flag's line is missing, already true, or commented out", () => {
    expect(() => makePublic("export const PUBLIC = true;\n")).toThrow(/no "export const PUBLIC = false;"/);
    expect(() => makePublic("// export const PUBLIC = false;\n")).toThrow();
    expect(() => makePublic("")).toThrow();
  });
});
