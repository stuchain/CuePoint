import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { NAV } from "../data/nav";
import NotFound from "./404.astro";

describe("the 404 page", async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(NotFound);

  it("is noindex and has one h1", () => {
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("names no canonical address, since it is served at any address", () => {
    expect(html).not.toContain('rel="canonical"');
  });

  it("links the main pages with absolute paths", () => {
    const main = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? "";
    const hrefs = [...main.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) expect(href).toMatch(/^(\/|https:\/\/)/);
    for (const item of NAV.filter((n) => n.header)) expect(hrefs).toContain(`/${item.path}`);
  });
});
