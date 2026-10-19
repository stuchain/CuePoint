/**
 * C87 guard: problem text is drawn in the status text tokens (`--danger-text`, `--warning-text`,
 * `--success-text`), which hold 4.5:1 on a panel in every theme. The raw `--accent-*` colours are
 * for borders and fills only. `.cp-status--*` in index.css is the one way to colour a sentence.
 */
import { describe, expect, it } from "vitest";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/** `color:` set straight to a status accent (not `border-color`, `background-color`, `outline-color`). */
const RAW_STATUS_TEXT = /(^|[^-\w])color:\s*var\(--accent-(danger|warning|success)\)/;

describe("status text colour guard (C87)", () => {
  it("has no stylesheet that colours text with a raw status accent", () => {
    const bad = Object.entries(sheets)
      .filter(([, css]) => RAW_STATUS_TEXT.test(css.replace(/\/\*[\s\S]*?\*\//g, "")))
      .map(([path]) => path.replace(/^\/src\//, ""))
      .sort();
    expect(bad, `use var(--danger-text|--warning-text|--success-text) in: ${bad.join(", ")}`).toEqual([]);
    expect(Object.keys(sheets).length).toBeGreaterThan(40);
  });

  it("still sees a raw accent and leaves borders alone", () => {
    expect(RAW_STATUS_TEXT.test("a { color: var(--accent-danger); }")).toBe(true);
    expect(RAW_STATUS_TEXT.test("a { border-color: var(--accent-danger); }")).toBe(false);
    expect(RAW_STATUS_TEXT.test("a { color: var(--danger-text); }")).toBe(false);
  });
});
