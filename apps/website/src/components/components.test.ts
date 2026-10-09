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
