import { describe, expect, it } from "vitest";
import { addressParts, isStyleguide } from "../site.config";

describe("addressParts", () => {
  it("splits the GitHub Pages address into site and base", () => {
    expect(addressParts("https://stuchain.github.io/CuePoint/")).toEqual({
      site: "https://stuchain.github.io",
      base: "/CuePoint/",
    });
  });

  it("gives a base of / for a custom domain", () => {
    expect(addressParts("https://example.com/")).toEqual({
      site: "https://example.com",
      base: "/",
    });
  });

  it("adds the trailing slash to the base when the URL has none", () => {
    expect(addressParts("https://stuchain.github.io/CuePoint").base).toBe("/CuePoint/");
    expect(addressParts("https://example.com").base).toBe("/");
  });

  it("throws on a URL that is not https", () => {
    expect(() => addressParts("http://example.com/")).toThrow();
  });

  it("throws on a URL with a query or hash", () => {
    expect(() => addressParts("https://example.com/?a=1")).toThrow();
    expect(() => addressParts("https://example.com/#top")).toThrow();
  });
});

describe("isStyleguide", () => {
  it("matches /styleguide/ at the start of the path after the base only", () => {
    const pages = "https://stuchain.github.io/CuePoint/";
    expect(isStyleguide("/CuePoint/styleguide/", pages)).toBe(true);
    expect(isStyleguide("/CuePoint/styleguide/buttons/", pages)).toBe(true);
    expect(isStyleguide("/CuePoint/guides/styleguide/", pages)).toBe(false);
    expect(isStyleguide("/CuePoint/styleguides/", pages)).toBe(false);
    expect(isStyleguide("/CuePoint/", pages)).toBe(false);
    expect(isStyleguide("/styleguide/", pages)).toBe(false);
  });

  it("uses the site's own address by default", () => {
    expect(isStyleguide("/styleguide/")).toBe(true);
    expect(isStyleguide("/guides/styleguide/")).toBe(false);
  });
});
