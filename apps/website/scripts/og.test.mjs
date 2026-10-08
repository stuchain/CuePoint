// Every built page having its own 1200x630 og:image is checked after the build by check-site.mjs (the
// og-image rule, with fixtures in check-site.test.mjs). These tests cover the card itself.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cardTitle, ogImagePath, renderOgCard, titleSize } from "./og.mjs";

describe("renderOgCard", () => {
  it("makes a 1200x630 PNG from a title", async () => {
    const png = await renderOgCard({ title: "Privacy policy" });
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1200, 630]);
  });

  it("copes with a very long title and with a picture", async () => {
    const picture = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#8b5cf6" } }).png().toBuffer();
    const png = await renderOgCard({ title: "A title that goes on and on about cleaning up a Rekordbox library ".repeat(3), picture });
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
  });

  it("paints the Neo Dark app and panel colors, not a blank card", async () => {
    const png = await renderOgCard({ title: "Hi" });
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(at(2, 2)).toEqual([0x18, 0x18, 0x1b]);
    expect(at(70, 300)).toEqual([0x27, 0x27, 0x2a]);
  });

  it("shrinks the title for long text", () => {
    expect(titleSize("Hi")).toBeGreaterThan(titleSize("x".repeat(90)));
  });
});

describe("cardTitle", () => {
  it("drops the site-name suffix and keeps the rest", () => {
    expect(cardTitle("FAQ | CuePoint")).toBe("FAQ");
    expect(cardTitle("Library | CuePoint guide")).toBe("Library | CuePoint guide");
    expect(cardTitle("CuePoint")).toBe("CuePoint");
  });
});

describe("ogImagePath", () => {
  it("maps a page path to its image under og/", () => {
    expect(ogImagePath("")).toBe("og/index.png");
    expect(ogImagePath("privacy/")).toBe("og/privacy.png");
    expect(ogImagePath("blog/hello/")).toBe("og/blog/hello.png");
    expect(ogImagePath("404.html")).toBe("og/404.png");
  });
});
