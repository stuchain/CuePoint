import { describe, expect, it } from "vitest";
import { fmt, placeholdersOf } from "./format";
import { plain, rich } from "./rich";

describe("fmt", () => {
  it("fills placeholders, numbers included", () => {
    expect(fmt("{a} by {b}", { a: 1280, b: "800" })).toBe("1280 by 800");
    expect(fmt("no placeholders")).toBe("no placeholders");
  });

  it("throws for a placeholder with no value", () => {
    expect(() => fmt("{missing}", {})).toThrow(/missing/);
  });

  it("lists a template's placeholders once each, sorted", () => {
    expect(placeholdersOf("{b} {a} {b}")).toEqual(["a", "b"]);
  });
});

describe("rich", () => {
  it("draws bold and links, and escapes everything else", () => {
    expect(rich("Press **Run** & <go> [here](x)", { x: "#a" })).toBe('Press <strong>Run</strong> &amp; &lt;go&gt; <a href="#a">here</a>');
  });

  it("adds the attributes a link names", () => {
    expect(rich("[a](k)", { k: { href: "https://e.test/", external: true, hreflang: "en", alt: true } })).toBe(
      '<a data-alt href="https://e.test/" rel="noopener noreferrer" hreflang="en">a</a>',
    );
  });

  it("throws for a link that is not given, so a string cannot point at nothing", () => {
    expect(() => rich("[a](nope)", {})).toThrow(/nope/);
  });

  it("fills placeholders before drawing", () => {
    expect(rich("**{n}** files", {}, { n: 3 })).toBe("<strong>3</strong> files");
  });

  it("plain takes the markup off", () => {
    expect(plain("**Run** [here](x) {n}", { n: 2 })).toBe("Run here 2");
  });
});
