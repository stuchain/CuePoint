import { describe, expect, it } from "vitest";
import { withXDefault } from "./sitemap";

const links = [
  { url: "https://x.test/faq/", lang: "en" },
  { url: "https://x.test/de/faq/", lang: "de" },
];

describe("withXDefault", () => {
  it("adds the English address as x-default to a page that has alternates", () => {
    expect(withXDefault({ url: "https://x.test/faq/", links }).links).toEqual([...links, { url: "https://x.test/faq/", lang: "x-default" }]);
  });

  it("leaves a page with no alternates, and one that has x-default already, as it is", () => {
    const plain = { url: "https://x.test/guide/" };
    expect(withXDefault(plain)).toBe(plain);
    const done = { url: "https://x.test/faq/", links: [...links, { url: "https://x.test/faq/", lang: "x-default" }] };
    expect(withXDefault(done)).toBe(done);
  });
});
