/**
 * The sharing pictures (SITE-11): one 1200x630 PNG per page, drawn at build with satori (layout to
 * SVG) and resvg (SVG to PNG). The look is the app's: the page's title in Pixelify Sans on Neo Dark's
 * panel, with the black outline and the hard shadow, the pixel mark (DEC-210) and, when a page gives
 * one, its app picture. Nothing here draws a new mark.
 *
 * How a page gets its picture: Page.astro writes `og:image` as `<site>/og/<page>.png` (src/lib/og.ts
 * has the same path rule as `ogImagePath` below) and, for a page with an app picture, a
 * `<meta name="og-picture">` marker. The integration in og-integration.mjs runs once the pages are
 * built, reads every page's `og:title` and marker from dist/, and calls `renderOgCard` for each
 * image that is missing. It needs no list of pages, so a page added by another step gets its card.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import { neoDarkTokens } from "./theme-colors.mjs";

export { ogImagePath } from "./og-path.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const FONT_DIR = join(HERE, "..", "node_modules", "@fontsource", "pixelify-sans", "files");
const MARK_SVG = join(HERE, "..", "src", "assets", "mark", "mark-32.svg");

/** A page title as the card shows it: the site-name suffix ("FAQ | CuePoint") is dropped, since the card names the site. */
export function cardTitle(title) {
  return title.replace(/\s*\|\s*CuePoint\s*$/, "").trim() || title;
}

/** The title's font size in px: long titles get smaller so they fit; a picture narrows the column. */
export function titleSize(title, hasPicture = false) {
  const n = [...title].length;
  const size = n <= 18 ? 100 : n <= 32 ? 84 : n <= 54 ? 68 : n <= 80 ? 56 : 46;
  return Math.round(hasPicture ? size * 0.78 : size);
}

let fonts;
function loadFonts() {
  // latin first; latin-ext (accents, Polish, Turkish...) and cyrillic cover glyphs it lacks. Greek, CJK and
  // other scripts are not in Pixelify Sans at all and would show as blanks: the site's pages are English.
  fonts ??= [600, 700].flatMap((weight) =>
    ["latin", "latin-ext", "cyrillic"].map((subset) => ({
      name: "Pixelify Sans",
      data: readFileSync(join(FONT_DIR, `pixelify-sans-${subset}-${weight}-normal.woff`)),
      weight,
      style: "normal",
    })),
  );
  return fonts;
}

let markUri;
/** The mark at 4x (128 px), a whole multiple of its 32-cell grid so every cell stays a sharp square. */
function markDataUri() {
  if (!markUri) {
    const png = new Resvg(readFileSync(MARK_SVG), { fitTo: { mode: "width", value: 128 } }).render().asPng();
    markUri = `data:image/png;base64,${png.toString("base64")}`;
  }
  return markUri;
}

const h = (type, style, children) => ({ type, props: { style: { display: "flex", ...style }, children } });

/**
 * One card as PNG bytes.
 * @param {{ title: string, picture?: Buffer, site?: string }} options
 *   `picture` is an image file's bytes (any format sharp reads); `site` is the host shown at the foot.
 */
export async function renderOgCard({ title: pageTitle, picture, site = "" }) {
  const title = cardTitle(pageTitle);
  const t = neoDarkTokens();
  const hasPicture = Boolean(picture);

  let pictureUri;
  if (picture) {
    const png = await sharp(picture).resize(396, 396, { fit: "inside", kernel: "nearest" }).png().toBuffer();
    const meta = await sharp(png).metadata();
    pictureUri = { src: `data:image/png;base64,${png.toString("base64")}`, width: meta.width, height: meta.height };
  }

  const PANEL = { left: 50, top: 44, width: 1090, height: 520, border: 8, shadow: 16 };

  const text = h("div", { flexDirection: "column", flex: 1, justifyContent: "center", paddingRight: hasPicture ? 36 : 0 }, [
    h(
      "div",
      {
        display: "block",
        fontFamily: "Pixelify Sans",
        fontWeight: 700,
        fontSize: titleSize(title, hasPicture),
        lineHeight: 1.08,
        color: t["--fg-primary"],
        lineClamp: 4,
        textWrap: "balance",
      },
      title,
    ),
  ]);

  const body = [text];
  if (pictureUri) {
    body.push(
      h("div", { alignItems: "center", justifyContent: "center", flexShrink: 0 }, [
        h(
          "div",
          { border: `6px solid ${t["--border-outline"]}`, boxShadow: `10px 10px 0 ${t["--border-shadow"]}`, background: t["--bg-app"] },
          [{ type: "img", props: { src: pictureUri.src, width: pictureUri.width, height: pictureUri.height } }],
        ),
      ]),
    );
  }

  const tree = h(
    "div",
    { position: "relative", width: OG_WIDTH, height: OG_HEIGHT, background: t["--bg-app"], fontFamily: "Pixelify Sans" },
    [
      // the hard shadow, then the panel with its black outline
      h("div", {
        position: "absolute",
        left: PANEL.left + PANEL.shadow,
        top: PANEL.top + PANEL.shadow,
        width: PANEL.width,
        height: PANEL.height,
        background: t["--border-shadow"],
      }),
      h(
        "div",
        {
          position: "absolute",
          left: PANEL.left,
          top: PANEL.top,
          width: PANEL.width,
          height: PANEL.height,
          boxSizing: "border-box",
          flexDirection: "column",
          background: t["--bg-panel"],
          border: `${PANEL.border}px solid ${t["--border-outline"]}`,
        },
        [
          // a bevel highlight along the top edge and an accent bar, as the app's panels have
          h("div", { height: 14, background: t["--accent-primary"], borderBottom: `4px solid ${t["--border-outline"]}` }),
          h("div", { flexDirection: "column", flex: 1, padding: "30px 56px 34px" }, [
            h("div", { alignItems: "center" }, [
              { type: "img", props: { src: markDataUri(), width: 96, height: 96 } },
              h(
                "div",
                { marginLeft: 24, fontFamily: "Pixelify Sans", fontWeight: 600, fontSize: 48, color: t["--fg-muted"] },
                "CuePoint",
              ),
            ]),
            h("div", { flex: 1, marginTop: 8 }, body),
            site
              ? h("div", { fontFamily: "Pixelify Sans", fontWeight: 600, fontSize: 32, color: t["--accent-primary-hover"] }, site)
              : h("div", { height: 0 }),
          ]),
        ],
      ),
    ],
  );

  const svg = await satori(tree, { width: OG_WIDTH, height: OG_HEIGHT, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng();
}
