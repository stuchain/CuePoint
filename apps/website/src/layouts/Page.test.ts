import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { PUBLIC, SITE_URL } from "../../site.config";
import { CSP } from "../lib/csp";
import { canonicalFor } from "../lib/url";
import Page from "./Page.astro";

async function render(props: Record<string, unknown>) {
  const container = await AstroContainer.create();
  return container.renderToString(Page, {
    props: { title: "Test page", description: "A test page.", path: "download/", ...props },
    slots: { default: "<p>body</p>" },
  });
}

function meta(html: string, attr: "name" | "property", key: string): string | undefined {
  const m = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`).exec(html);
  return m?.[1];
}

describe("canonicalFor", () => {
  it("is the address plus the path", () => {
    expect(canonicalFor("")).toBe(SITE_URL);
    expect(canonicalFor("download/")).toBe(`${SITE_URL}download/`);
    expect(canonicalFor("/download/")).toBe(`${SITE_URL}download/`);
    expect(canonicalFor("a/", "https://example.com")).toBe("https://example.com/a/");
  });

  it("always ends a page path with a slash, but not a file", () => {
    expect(canonicalFor("download")).toBe(`${SITE_URL}download/`);
    expect(canonicalFor("a/b")).toBe(`${SITE_URL}a/b/`);
    expect(canonicalFor("rss.xml")).toBe(`${SITE_URL}rss.xml`);
    expect(canonicalFor("feeds/rss.xml")).toBe(`${SITE_URL}feeds/rss.xml`);
  });

  it("rejects .. segments and absolute addresses", () => {
    expect(() => canonicalFor("../x/")).toThrow();
    expect(() => canonicalFor("a/../../x")).toThrow();
    expect(() => canonicalFor("https://evil.example/")).toThrow();
    expect(() => canonicalFor("//evil.example/")).toThrow();
  });
});

describe("Page", () => {
  it("writes the title, description, lang and the main landmark", async () => {
    const html = await render({});
    expect(html).toContain('<html lang="en"');
    expect(html).toContain("<title>Test page</title>");
    expect(meta(html, "name", "description")).toBe("A test page.");
    expect(html).toContain('<main id="main"');
    expect(html).toContain('href="#main"');
  });

  it("links the blog's RSS feed from the head of every page", async () => {
    const html = await render({});
    expect(html).toMatch(/<link rel="alternate" type="application\/rss\+xml"[^>]*href="[^"]*blog\/rss\.xml"/);
  });

  it("is og:type website by default and article with its time and tags when asked", async () => {
    expect(meta(await render({}), "property", "og:type")).toBe("website");
    expect(await render({})).not.toContain("article:published_time");
    const html = await render({ ogType: "article", publishedTime: "2026-10-08T00:00:00.000Z", tags: ["a", "b"] });
    expect(meta(html, "property", "og:type")).toBe("article");
    expect(meta(html, "property", "article:published_time")).toBe("2026-10-08T00:00:00.000Z");
    expect(html.match(/property="article:tag"/g)).toHaveLength(2);
  });

  it("makes the canonical the address plus the path, and og:url the same", async () => {
    const html = await render({});
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    expect(canonical).toBe(`${SITE_URL}download/`);
    expect(meta(html, "property", "og:url")).toBe(canonical);
  });

  it("writes Open Graph and the X card", async () => {
    const html = await render({});
    expect(meta(html, "property", "og:title")).toBe("Test page");
    expect(meta(html, "property", "og:description")).toBe("A test page.");
    expect(meta(html, "property", "og:type")).toBe("website");
    expect(meta(html, "property", "og:image")).toBe(`${SITE_URL}og/download.png`);
    expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
  });

  it("emits JSON-LD as given", async () => {
    const schema = [
      { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "CuePoint <b>" },
      { "@context": "https://schema.org", "@type": "WebSite", url: SITE_URL },
    ];
    const html = await render({ schema });
    const found = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1] ?? ""),
    );
    expect(found).toEqual(schema);
  });

  it("never lets a string in the JSON-LD close the script tag", async () => {
    const schema = [{ "@context": "https://schema.org", "@type": "WebSite", name: "x</script><script>alert(1)</script>" }];
    const html = await render({ schema });
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(m?.[1]).toBeDefined();
    expect(m?.[1]).not.toContain("</script>");
    expect(m?.[1]).not.toContain("<");
    expect(JSON.parse(m?.[1] ?? "")).toEqual(schema[0]);
    expect(html).not.toContain("<script>alert(1)");
  });

  it("adds a BreadcrumbList when breadcrumbs are given", async () => {
    const html = await render({
      breadcrumbs: [
        { label: "Home", path: "" },
        { label: "Download", path: "download/" },
      ],
    });
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? ""));
    expect(ld).toHaveLength(1);
    expect(ld[0]["@type"]).toBe("BreadcrumbList");
    expect(ld[0].itemListElement[1].item).toBe(`${SITE_URL}download/`);
  });

  it("carries noindex while the site is not public", async () => {
    expect(PUBLIC).toBe(false);
    expect(meta(await render({}), "name", "robots")).toContain("noindex");
  });

  it("carries noindex for the pages allowed it", async () => {
    expect(meta(await render({ noindex: "404" }), "name", "robots")).toContain("noindex");
  });

  it("carries the Content-Security-Policy meta from the one constant", async () => {
    const html = await render({});
    const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html);
    expect(m?.[1]?.replaceAll("&#39;", "'")).toBe(CSP);
    expect(CSP).toContain("default-src 'self'");
    expect(CSP).toContain("form-action 'self' https://api.web3forms.com");
    expect(CSP).not.toContain("frame-ancestors");
  });

  it("wears Neo Dark, the one theme, and never applies a theme remembered from before", async () => {
    const html = await render({});
    expect(html).toContain('data-theme="neoDark"');
    expect(html).not.toContain("cuepoint-site-theme");
  });

  it("never asks Google for fonts", async () => {
    const html = await render({});
    expect(html).not.toMatch(/googleapis|gstatic/);
  });
});

describe("Page head (SITE-11)", () => {
  it("names the toolbar color as the theme color and the favicon with sizes=any", async () => {
    const html = await render({});
    expect(meta(html, "name", "theme-color")).toBe("#1f1f23");
    expect(html).toMatch(/<link rel="icon" sizes="any" href="[^"]*favicon\.ico"/);
  });

  it("gives the 404 no canonical and no og:url", async () => {
    const html = await render({ noindex: "404", path: "404.html" });
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
  });

  it("points og:image at the page's own picture and marks an app picture for the build", async () => {
    const html = await render({ path: "blog/a/", ogPicture: { src: "/_astro/pic.png", width: 10, height: 10, format: "png" } });
    expect(meta(html, "property", "og:image")).toBe(`${SITE_URL}og/blog/a.png`);
    expect(meta(html, "name", "og-picture")).toBe("/_astro/pic.png");
  });
});
