import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Button from "./Button.astro";

async function render(props: Record<string, unknown>, label = "Go") {
  const container = await AstroContainer.create();
  return container.renderToString(Button, { props, slots: { default: label } });
}

describe("Button", () => {
  it("renders a real <a> when given an href", async () => {
    const html = await render({ href: "https://example.com/x" });
    expect(html).toMatch(/<a [^>]*href="https:\/\/example.com\/x"/);
    expect(html).not.toContain("<button");
  });

  it('renders <button type="button"> without an href', async () => {
    const html = await render({});
    expect(html).toMatch(/<button [^>]*type="button"/);
    expect(html).not.toMatch(/<a[ >]/);
  });

  it("keeps a submit type when asked", async () => {
    expect(await render({ type: "submit" })).toMatch(/<button [^>]*type="submit"/);
  });

  it("marks the variant", async () => {
    expect(await render({ variant: "secondary" })).toContain('data-variant="secondary"');
    expect(await render({})).toContain('data-variant="primary"');
  });

  it("opens an external link safely", async () => {
    const html = await render({ href: "https://example.com/", external: true });
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
