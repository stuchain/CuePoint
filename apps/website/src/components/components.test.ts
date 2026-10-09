import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Badge from "./Badge.astro";
import Breadcrumbs from "./Breadcrumbs.astro";
import Callout from "./Callout.astro";
import CodeBlock from "./CodeBlock.astro";
import Footer from "./Footer.astro";
import Header from "./Header.astro";
import Kbd from "./Kbd.astro";
import Panel from "./Panel.astro";
import Section from "./Section.astro";
import { EXTERNAL_NAV, FOOTER_GROUPS, NAV } from "../data/nav";
import { PRIMARY_ACTION, PUBLISHER } from "../data/site";

async function render(component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown> = {}, slot = "x") {
  const container = await AstroContainer.create();
  return container.renderToString(component, { props, slots: { default: slot } });
}

describe("components", () => {
  it("Header: the primary action and the nav, and no theme switch (the site wears one theme)", async () => {
    const html = await render(Header, { currentPath: "" });
    expect(html).toContain(PRIMARY_ACTION.label);
    expect(html).toContain(`href="${PRIMARY_ACTION.href}"`);
    expect(html).not.toContain("data-theme-choice");
    expect(html).not.toContain("data-theme-switch");
    expect(html).toContain('aria-current="page"');
  });

  it("Footer: publisher and links", async () => {
    const html = await render(Footer);
    expect(html).toContain(PUBLISHER);
    expect(html).toContain("GitHub");
  });

  it("Footer: the links in three groups, Product, Help and Legal, and every page in one of them", async () => {
    const html = await render(Footer);
    const groups = [...html.matchAll(/data-footer-group="([a-z]+)"/g)].map((m) => m[1]);
    expect(groups).toEqual(FOOTER_GROUPS.map((g) => g.id));
    expect(FOOTER_GROUPS.map((g) => g.label)).toEqual(["Product", "Help", "Legal"]);
    // each group's links, in the order of src/data/nav.ts
    const linksOf = (id: string) => {
      const start = html.indexOf(`data-footer-group="${id}"`);
      const end = html.indexOf("</ul>", start);
      return [...html.slice(start, end).matchAll(/<a [^>]*>\s*([^<]+?)\s*<\/a>/g)].map((m) => m[1]);
    };
    expect(linksOf("legal")).toEqual(["Privacy", "Terms"]);
    expect(linksOf("help")).toEqual(expect.arrayContaining(["Guide", "FAQ", "Contact", "Report a bug", "GitHub"]));
    expect(linksOf("product")).toEqual(expect.arrayContaining(["Features", "Download", "Compare", "Changelog", "Blog"]));
    // every page but the home page (the footer's name links it) has a group, and is listed once
    for (const n of NAV) {
      if (n.path === "") expect(n.group).toBeUndefined();
      else expect(FOOTER_GROUPS.map((g) => g.id), n.label).toContain(n.group);
    }
    const all = FOOTER_GROUPS.flatMap((g) => linksOf(g.id));
    expect(all).toHaveLength(NAV.length - 1 + EXTERNAL_NAV.length);
  });

  it("Breadcrumbs: the last item is the current page", async () => {
    const html = await render(Breadcrumbs, {
      items: [
        { label: "Home", path: "" },
        { label: "Guide", path: "guide/" },
      ],
    });
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toMatch(/aria-current="page"[^>]*>\s*Guide/);
  });

  it("Callout, Kbd, Badge, Panel, Section render their content", async () => {
    expect(await render(Callout, { title: "Heads up" }, "body")).toContain("Heads up");
    expect(await render(Kbd, {}, "Ctrl")).toContain("<kbd");
    expect(await render(Badge, { variant: "success" }, "New")).toContain("New");
    expect(await render(Panel, {}, "inside")).toContain("inside");
    const section = await render(Section, { id: "s", heading: "Hello" }, "inside");
    expect(section).toContain('aria-labelledby="s-heading"');
  });

  it("CodeBlock escapes its code and is keyboard reachable", async () => {
    const html = await render(CodeBlock, { code: "<b>&</b>", label: "Example" });
    expect(html).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).toContain('tabindex="0"');
  });
});
