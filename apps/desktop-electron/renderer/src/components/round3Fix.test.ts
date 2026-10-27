/**
 * Round 3 fix round, P1 (FIX-PLAN.md): the shared controls, tokens and motion items that the
 * verification found not, or not fully, applied. jsdom has no layout, so these hold the winning
 * rules themselves, read from the stylesheets, one test per item.
 */
import { describe, expect, it } from "vitest";
import { parseRules, selectorList, stripComments } from "../test/cssRules";
import dataTable from "./table/DataTable.css?raw";
import modal from "./Modal.css?raw";
import notice from "./Notice.css?raw";
import playButton from "./PlayButton.css?raw";
import savedTick from "./SavedTick.css?raw";
import tabs from "./Tabs.css?raw";
import trackMenu from "./TrackContextMenu.css?raw";
import app from "../App.css?raw";
import index from "../index.css?raw";
import motion from "../motion.css?raw";

const SHEETS = import.meta.glob<string>("../**/*.css", { query: "?raw", import: "default", eager: true });

/** The body of every rule whose selector list names `selector` exactly, joined. */
function body(css: string, selector: string): string {
  return parseRules(stripComments(css))
    .filter((r) => selectorList(r.selector).map((s) => s.trim().replace(/\s+/g, " ")).includes(selector))
    .map((r) => r.body)
    .join("\n");
}

describe("the tab underline sits under the label only, with motion on too (M52)", () => {
  const MOTION_UNDERLINE = ":root[data-motion-state] .cp-tabs:not(.cp-tabs--sub) .cp-tabs__tab--active::after";

  it("is inset by the tab's padding in motion.css, as in Tabs.css", () => {
    const moving = body(motion, MOTION_UNDERLINE);
    expect(moving).toMatch(/inset-inline:\s*var\(--space-md\)/);
    expect(moving).not.toMatch(/(^|[\s;])(left|right):/);
    expect(body(tabs, ".cp-tabs:not(.cp-tabs--sub) .cp-tabs__tab::after")).toMatch(/inset-inline:\s*var\(--space-md\)/);
  });

  it("is not widened by any other rule that reaches the active tab's ::after", () => {
    // The cascade check: every sheet's rule on the underline pseudo-element, motion on or off.
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(SHEETS)) {
      for (const rule of parseRules(stripComments(css))) {
        if (!/cp-tabs__tab[^,]*::after/.test(rule.selector)) continue;
        if (/(^|[\s;])(left|right|inset|inset-inline|width):/.test(rule.body) && !/inset-inline:\s*var\(--space-md\)/.test(rule.body)) {
          offenders.push(`${file}: ${rule.selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Forced colours draw a border on the tab instead; they do not move the underline.
    expect(stripComments(app)).not.toMatch(/cp-tabs__tab[^{]*::after/);
  });
});

describe("a count beside a tab's label is the label's face (M8)", () => {
  it("sets the tab count in the pixel face with data-face figures, tabular", () => {
    const detail = body(tabs, ".cp-tabs__detail");
    expect(detail).toMatch(/font-family:\s*var\(--font-pixel-digits\)/);
    expect(detail).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(detail).not.toMatch(/var\(--font-data\)/);
  });
});

describe("bars and cells use one inline padding (M51)", () => {
  it("sets the filter bar and the Keys tracks bar in by the cell padding", () => {
    for (const selector of [".cp-filter-bar__row.cp-toolbar", ".keys-tracks__toolbar.cp-toolbar"]) {
      expect(body(index, selector), selector).toMatch(/padding-inline:\s*var\(--space-sm\)/);
      expect(body(index, selector), selector).not.toMatch(/padding-inline:\s*var\(--space-md\)/);
    }
  });
});

describe("the control weight for pixel words (M2)", () => {
  it.each([
    [notice, ".cp-notice__title"],
    [trackMenu, ".cp-track-menu__heading"],
    [dataTable, ".cp-data-table thead th"],
    [dataTable, ".cp-data-grid__head"],
  ] as const)("%#: %s", (css, selector) => {
    const b = body(css, selector);
    expect(b).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
    expect(b).not.toMatch(/font-weight-(medium|semibold)/);
  });
});

describe("rows, menus and lists (M216, M339 part, M89)", () => {
  it("draws the data-grid row line inside the row, in the soft line (M216)", () => {
    const item = body(dataTable, ".cp-data-grid__item");
    expect(item).toMatch(/box-shadow:\s*inset 0 calc\(-1 \* var\(--hairline\)\) 0 var\(--row-line\)/);
    expect(item).not.toMatch(/border-bottom/);
  });

  it("shows the arrow on a menu entry and a data-grid row (M339)", () => {
    expect(body(trackMenu, ".cp-track-menu__item")).toMatch(/cursor:\s*default/);
    expect(body(dataTable, ".cp-data-grid__row")).toMatch(/cursor:\s*default/);
  });

  it("draws the sub-tabs' more chevron on the strip's colour with a hard edge, no fade (M89)", () => {
    const more = body(tabs, ".cp-tabs__more");
    expect(more).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(more).toMatch(/box-shadow:\s*inset var\(--hairline\) 0 0 0 var\(--row-line\)/);
    expect(more).not.toMatch(/gradient/);
  });
});

describe("icon sizes (M29)", () => {
  it("draws the row play mark at the small icon size, no local third size", () => {
    const icon = body(playButton, ".cp-play-btn .cp-pixel-icon");
    expect(icon).toMatch(/width:\s*var\(--icon-size-sm\)/);
    expect(icon).toMatch(/height:\s*var\(--icon-size-sm\)/);
  });
});

describe("dialog paragraphs (M63)", () => {
  it("takes the browser's margin off the lead and every body paragraph", () => {
    expect(body(modal, ".cp-modal__lead")).toMatch(/margin:\s*0/);
    expect(body(modal, ".cp-modal__body p")).toMatch(/margin:\s*0/);
  });
});

describe("links in rows are a full target (M477)", () => {
  it("gives a link in a table row the 24 px target height", () => {
    expect(body(index, ":where(.track-table, .cp-data-table, .cp-data-grid) .cp-link")).toMatch(
      /min-block-size:\s*var\(--hit-target\)/,
    );
  });
});

describe("motion (M373, M380, M381, M387)", () => {
  it("breathes the skeleton slowly (M373)", () => {
    expect(body(motion, ":root[data-motion-loading] .track-table__skeleton")).toMatch(/cp-skeleton 1200ms/);
  });

  it("has no dead .cp-popover selector (M387)", () => {
    expect(stripComments(motion)).not.toMatch(/\.cp-popover/);
  });

  it("draws the row's hover edge bar at once, with no step in (M387)", () => {
    const rule = parseRules(stripComments(motion)).find((r) => /\.track-table__row[^,]*:hover::before/.test(r.selector))!;
    expect(rule.body).toMatch(/animation:\s*none/);
  });

  it("keeps the Saved slot one line tall and fades the words out (M387, M380)", () => {
    expect(body(savedTick, ".cp-saved-tick")).toMatch(/min-height:\s*1lh/);
    expect(body(motion, ":root[data-motion-micro] .cp-saved-tick__body[data-leaving]")).toMatch(/cp-fade-out/);
  });

  it("leaves the hint tip out of the popover motion: it fades only (M380, V6 M386 note)", () => {
    expect(stripComments(motion)).not.toMatch(/cp-hint__tip/);
  });

  it("does not replay a returning page's one-shot motion (M381)", () => {
    const rule = parseRules(stripComments(motion)).find((r) => r.selector.includes("[data-returned]"))!;
    const selectors = selectorList(rule.selector).map((s) => s.trim());
    expect(selectors).toEqual(
      expect.arrayContaining([
        ":root[data-motion-entrance] [data-returned] .cp-side-panel:not([data-leaving])",
        ":root[data-motion-state] [data-returned] .cp-tabs:not(.cp-tabs--sub) .cp-tabs__tab--active::after",
      ]),
    );
    expect(rule.body).toMatch(/animation:\s*none/);
  });

  it("slides the closing queue out to its edge, as the Inspector, not the generic lift-out (F3)", () => {
    // The queue's leaving copy is [data-ghost] and [data-leaving]; the generic ghost rule (0,4,0) would win.
    expect(body(motion, ":root[data-motion-entrance] .cp-queue[data-ghost][data-ghost]")).toMatch(/cp-to-edge/);
    expect(body(motion, ":root[data-motion-entrance] .cp-inspector[data-ghost][data-ghost]")).toMatch(/cp-to-edge/);
  });
});
