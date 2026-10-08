import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ogDefault from "../assets/og/default.png";
import Img from "./Img.astro";

async function render(props: Record<string, unknown>) {
  const container = await AstroContainer.create();
  return container.renderToString(Img, { props: { src: ogDefault, width: 600, ...props } });
}

describe("Img", () => {
  it("renders the alt text it was given", async () => {
    const html = await render({ alt: "The CuePoint mark" });
    expect(html).toContain('alt="The CuePoint mark"');
  });

  it('renders alt="" only for a decorative image', async () => {
    const html = await render({ alt: "", decorative: true });
    // the serializer writes an empty attribute as a bare `alt`
    expect(html).toMatch(/\salt(\s|>|="")/);
    expect(html).not.toMatch(/\salt="[^"]/);
  });

  it("throws at build time on an empty alt that is not marked decorative", async () => {
    await expect(render({ alt: "" })).rejects.toThrow(/alt/i);
  });
});
