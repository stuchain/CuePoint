import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { PRIMARY_ACTION } from "../data/site";
import ogDefault from "../assets/og/default.png";
import AppShot from "./AppShot.astro";
import HomeAction from "./HomeAction.astro";
import SoundButton from "./SoundButton.astro";

async function render(component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown> = {}) {
  const container = await AstroContainer.create();
  return container.renderToString(component, { props });
}

describe("the home page's components", () => {
  it("AppShot: a clearly labelled placeholder of the app window's size when there is no picture", async () => {
    const html = await render(AppShot, { id: "discover", images: [] });
    expect(html).toContain("data-app-shot");
    expect(html).toContain('data-placeholder="true"');
    expect(html).toContain("aspect-ratio");
    expect(html).toMatch(/placeholder/i);
    expect(html).toContain("1280");
    expect(html).toContain("800");
    expect(html).not.toContain("<img");
    // a placeholder is a picture slot, not a fake screenshot: it says so in words a visitor can read
    expect(html).toMatch(/screenshot.{0,40}(coming|not yet|placeholder)/i);
  });

  it("AppShot: the slot's description is its caption, so a screen reader hears what will be there", async () => {
    const html = await render(AppShot, { id: "discover", images: [] });
    expect(html).toContain("<figcaption");
  });

  it("AppShot: a placeholder if and only if there is no picture", async () => {
    const none = await render(AppShot, { id: "library", images: [] });
    expect(none).toContain('data-placeholder="true"');
    expect(none).not.toContain("<img");
    const some = await render(AppShot, { id: "library", images: [{ theme: "neoDark", image: ogDefault }] });
    expect(some).not.toContain("data-placeholder");
    expect(some).not.toMatch(/placeholder/i);
    expect(some).toContain("<img");
    // the caption says what the picture shows, so the picture's own alt is empty: it is read once
    expect(some).toMatch(/\salt(\s|>|="")/);
    expect(some).not.toMatch(/\salt="[^"]/);
    expect(some).toContain("<figcaption");
  });

  it("AppShot: the copy over the scene has no caption and is hidden from screen readers", async () => {
    const html = await render(AppShot, { id: "window", bare: true });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<figcaption");
  });

  it("HomeAction: before 1.0 it is the header's 'Get notified of 1.0', the same link", async () => {
    const html = await render(HomeAction);
    expect(html).toContain(PRIMARY_ACTION.label);
    expect(html).toContain(`href="${PRIMARY_ACTION.href}"`);
    expect(html).toContain("data-primary-action");
    expect(html).not.toContain("js-download");
  });

  it("SoundButton: nothing at all until the loop file exists (DEC-191)", async () => {
    const html = await render(SoundButton);
    expect(html).not.toContain("data-sound-toggle");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<audio");
  });
});
