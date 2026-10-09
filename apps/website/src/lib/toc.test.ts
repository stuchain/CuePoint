import { describe, expect, it } from "vitest";
import { needsToc, tocEntries } from "./toc";

describe("tocEntries", () => {
  it("lists h2s in order and nests each h3 under the h2 before it; the h1 and deeper headings are left out", () => {
    const toc = tocEntries([
      { depth: 1, slug: "title", text: "Title" },
      { depth: 2, slug: "install", text: "Install" },
      { depth: 2, slug: "first-run", text: "First run" },
      { depth: 3, slug: "import", text: "Import it" },
      { depth: 4, slug: "deep", text: "Deep" },
      { depth: 3, slug: "match", text: "Match" },
      { depth: 2, slug: "next", text: "Next steps" },
    ]);
    expect(toc.map((e) => e.slug)).toEqual(["install", "first-run", "next"]);
    expect(toc[1]!.children.map((c) => c.slug)).toEqual(["import", "match"]);
    expect(toc[0]!.children).toEqual([]);
  });
  it("keeps an h3 that comes before any h2", () => {
    expect(tocEntries([{ depth: 3, slug: "a", text: "A" }]).map((e) => e.slug)).toEqual(["a"]);
  });
  it("shows the list only with two sections or more", () => {
    expect(needsToc(tocEntries([{ depth: 2, slug: "a", text: "A" }]))).toBe(false);
    expect(needsToc(tocEntries([{ depth: 2, slug: "a", text: "A" }, { depth: 2, slug: "b", text: "B" }]))).toBe(true);
  });
});
