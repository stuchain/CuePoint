/**
 * Round 3, P2: the shared controls and the state language (DEC-302). jsdom has no layout, so these
 * hold the rules themselves, one test per item.
 */
import { describe, expect, it } from "vitest";
import { parseRules, selectorList, stripComments } from "../test/cssRules";
import badge from "./Badge.css?raw";
import button from "./Button.css?raw";
import card from "./Card.css?raw";
import closeButton from "./CloseButton.css?raw";
import hint from "./Hint.css?raw";
import playButton from "./PlayButton.css?raw";
import savedTick from "./SavedTick.css?raw";
import searchField from "./SearchField.css?raw";
import select from "./Select.css?raw";
import tabs from "./Tabs.css?raw";
import textField from "./TextField.css?raw";
import textarea from "./Textarea.css?raw";
import index from "../index.css?raw";

/** The body of every rule whose selector list names `selector` exactly, joined. */
function body(css: string, selector: string): string {
  return parseRules(stripComments(css))
    .filter(
      (r) =>
        selectorList(r.selector).map((s) => s.trim().replace(/\s+/g, " ")).includes(selector) ||
        r.selector.replace(/\s+/g, " ").replace(/ ?, ?/g, ", ").trim() === selector,
    )
    .map((r) => r.body)
    .join("\n");
}

describe("one label role (D1: M1, M2, M10, M13)", () => {
  it.each([
    ["legend", index, "legend"],
    [".cp-text-label", index, ".cp-text-label"],
    [".cp-facts dt", index, ".cp-facts dt"],
    [".cp-field__label", textField, ".cp-field__label"],
    [".cp-select__label", select, ".cp-select__label"],
    [".cp-select__inline-label", select, ".cp-select__inline-label"],
  ])("%s is pixel, muted, at the label size and the control weight", (_n, css, selector) => {
    const b = body(css, selector);
    expect(b).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(b).toMatch(/font-size:\s*var\(--font-size-label\)/);
    expect(b).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
    expect(b).toMatch(/color:\s*var\(--fg-muted\)/);
  });

  it("asks the pixel face for no 500, 600 or 700 weight in these sheets (M2)", () => {
    for (const css of [badge, select, textField, index.slice(0, index.indexOf(".cp-prose"))]) {
      const code = stripComments(css);
      expect(code).not.toMatch(/font-weight:\s*var\(--font-weight-(medium|semibold)\)/);
    }
    expect(body(badge, ".cp-badge")).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
  });

  it("draws a key cap in the control face at the control weight (M10)", () => {
    const b = body(index, ".cp-kbd");
    expect(b).toMatch(/font-family:\s*var\(--font-control\)/);
    expect(b).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
  });

  it("draws the sub-heading in the pixel face with its own space (M13)", () => {
    const b = body(index, ".cp-text-subhead");
    expect(b).toMatch(/font-family:\s*var\(--font-voice\)/);
    expect(b).toMatch(/font-weight:\s*var\(--control-font-weight\)/);
    expect(b).toMatch(/margin:\s*0 0 var\(--space-md\)/);
    expect(body(index, ".cp-text-subhead:not(:first-child)")).toMatch(/margin-top:\s*var\(--space-xl\)/);
  });

  it("makes a check's words Inter on one row height, the column picker excepted (M11, M78)", () => {
    const b = body(index, ".cp-check");
    expect(b).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(b).toMatch(/min-height:\s*var\(--row-height\)/);
    expect(body(index, ".cp-check--pixel")).toMatch(/font-family:\s*var\(--font-control\)/);
  });

  it("makes a select's value Inter like a text field's (M23)", () => {
    expect(body(select, ".cp-select__control")).toMatch(/font-family:\s*var\(--font-data\)/);
  });

  it("makes a card's unit the extra-small muted size (M17)", () => {
    expect(body(card, ".cp-card__unit")).toMatch(/font-size:\s*var\(--font-size-xs\)/);
  });
});

describe("fields on the page ground (D8, M46)", () => {
  it("sets --field-fill once, on the page ground and the header, and gives cards the input tone back", () => {
    expect(body(index, ".screen:not(.library-screen), .cp-screen-header")).toMatch(/--field-fill:\s*var\(--bg-panel\)/);
    expect(body(index, ".cp-card, .cp-panel")).toMatch(/--field-fill:\s*var\(--bg-input\)/);
  });

  it.each([
    ["TextField", textField, ".cp-field__input"],
    ["Select", select, ".cp-select__control"],
    ["Select inline", select, ".cp-select--inline .cp-select__field"],
    ["SearchField", searchField, ".cp-search-field__input"],
  ])("%s reads it", (_n, css, selector) => {
    expect(body(css, selector)).toMatch(/background:\s*var\(--field-fill, var\(--bg-input\)\)/);
  });
});

describe("one focus rule for fields (M344)", () => {
  it("turns the line violet on any :focus, and draws the ring over it, inside", () => {
    expect(textField).toMatch(/\.cp-field__input:focus:not\(:disabled\)/);
    expect(select).toMatch(/\.cp-select__control:focus:not\(:disabled\)/);
    expect(searchField).toMatch(/\.cp-search-field:focus-within/);
    for (const css of [textField, select]) {
      expect(css).toMatch(/outline-offset:\s*var\(--focus-ring-offset-inset\)/);
    }
    expect(body(searchField, ".cp-search-field__input:focus-visible")).toMatch(
      /outline-offset:\s*var\(--focus-ring-offset-inset\)/,
    );
  });
});

describe("the state language (D30, D31, D29)", () => {
  it("shows the arrow on buttons, tabs, selects and boxes, and for every disabled control (M339)", () => {
    for (const [css, selector] of [
      [button, ".cp-btn"],
      [tabs, ".cp-tabs__tab"],
      [select, ".cp-select__control"],
      [playButton, ".cp-play-btn"],
    ] as const) {
      expect(body(css, selector), selector).toMatch(/cursor:\s*default/);
    }
    expect(body(index, ":where(input[type=\"checkbox\"], input[type=\"radio\"])")).toMatch(/cursor:\s*default/);
    expect(stripComments(index)).not.toMatch(/not-allowed/);
  });

  it("makes quiet mean frameless, not grey, with the one hover of fill and frame (M342)", () => {
    expect(body(button, ".cp-btn--quiet")).toMatch(/color:\s*var\(--fg-primary\)/);
    const hover = body(button, '.cp-btn--quiet:hover:not(:disabled):not([aria-disabled="true"])');
    expect(hover).toMatch(/background:\s*var\(--hover-fill\)/);
    expect(hover).toMatch(/border-color:\s*var\(--border-control\)/);
    expect(hover).not.toMatch(/underline/);
  });

  it("gives a framed button the border step a field has on hover (M343)", () => {
    expect(body(button, '.cp-btn--secondary:hover:not(:disabled):not([aria-disabled="true"]):not(.cp-btn--loading)')).toMatch(
      /border-color:\s*var\(--hover-border\)/,
    );
  });

  it("marks a button with an open menu like a pressed toggle (M340, M341)", () => {
    expect(button).toMatch(/\.cp-btn\[aria-pressed="true"\],\s*\.cp-btn\[aria-expanded="true"\]\[aria-haspopup\]/);
  });

  it("stands a filled button's ring off its edge (M328)", () => {
    const b = body(
      button,
      ".cp-btn--primary:focus-visible, .cp-btn--write:focus-visible, .cp-btn--danger-confirm:focus-visible",
    );
    expect(b).toMatch(/outline-offset:\s*var\(--focus-ring-offset-filled\)/);
    expect(body(index, ":root")).toMatch(/--focus-ring-offset-filled:\s*var\(--focus-ring-width\)/);
  });

  it("mixes a disabled write button's green into the panel (M345)", () => {
    const b = body(
      button,
      '.cp-btn--write:disabled:not(.cp-btn--loading), .cp-btn--write[aria-disabled="true"]:not(.cp-btn--loading)',
    );
    expect(b).toMatch(/background:\s*color-mix\(in srgb, var\(--accent-write\) 22%, var\(--bg-panel\)\)/);
  });

  it("keeps a loading button its size: no press offset, content hidden, spinner overlaid (M346)", () => {
    expect(button).not.toMatch(/\.cp-btn--loading\s*\{[^}]*transform/);
    expect(body(button, ".cp-btn--loading > :not(.cp-btn__spinner)")).toMatch(/visibility:\s*hidden/);
    expect(body(button, ".cp-btn__spinner")).toMatch(/position:\s*absolute/);
    expect(body(button, ".cp-btn--primary .cp-btn__spinner")).toMatch(/color:\s*var\(--fg-on-accent\)/);
  });

  it("goes transparent with the faint line for a disabled box (M354)", () => {
    const b = body(index, ':where(input[type="checkbox"], input[type="radio"]):disabled');
    expect(b).toMatch(/background:\s*transparent/);
    expect(b).toMatch(/border-color:\s*var\(--border-disabled\)/);
  });

  it("uses one violet for a checked box and a checked radio (M334)", () => {
    expect(body(index, ':where(input[type="radio"]):checked')).toMatch(/border-color:\s*var\(--accent-fill\)/);
    expect(body(index, ':where(input[type="checkbox"], input[type="radio"]):checked, :where(input[type="checkbox"]:indeterminate)')).toMatch(
      /border-color:\s*var\(--accent-fill\)/,
    );
  });
});

describe("all good is quiet (D14, M325)", () => {
  it("draws done, success, the success chip and the saved tick in neutral tones", () => {
    expect(body(index, ".cp-status--done")).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(body(index, ".cp-status--success")).toMatch(/color:\s*var\(--fg-muted\)/);
    expect(body(badge, ".cp-badge--success")).toMatch(/--chip-tone:\s*var\(--fg-muted\)/);
    expect(body(savedTick, ".cp-saved-tick")).toMatch(/color:\s*var\(--fg-muted\)/);
  });
});

describe("tabs (M355, M52, M48)", () => {
  it("leaves the active tab out of the hover fill and greys an aria-disabled one", () => {
    expect(tabs).toMatch(
      /\.cp-tabs__tab:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\):not\(\.cp-tabs__tab--active\)/,
    );
    expect(body(tabs, '.cp-tabs__tab:disabled, .cp-tabs__tab[aria-disabled="true"]')).toMatch(/color:\s*var\(--fg-disabled\)/);
  });

  it("draws the underline under the label only, inside the tab's padding (M52)", () => {
    expect(body(tabs, ".cp-tabs:not(.cp-tabs--sub) .cp-tabs__tab::after")).toMatch(/inset-inline:\s*var\(--space-md\)/);
    expect(body(tabs, ".cp-tabs__tab--active")).not.toMatch(/border-bottom-color/);
  });

  it("makes a sub-tab as tall as the field beside it (M48)", () => {
    expect(body(tabs, ".cp-tabs--sub .cp-tabs__tab")).toMatch(
      /min-height:\s*calc\(var\(--control-height\) - 2 \* var\(--space-2xs\)\)/,
    );
  });
});

describe("shapes and sizes (D5, D10, D7)", () => {
  it("draws the row play button square at the small control size, and keeps its violet frame on hover (M34, M79, M356)", () => {
    const b = body(playButton, ".cp-play-btn");
    expect(b).toMatch(/border-radius:\s*0/);
    expect(b).toMatch(/--play-size:\s*var\(--control-height-sm\)/);
    expect(playButton).toMatch(/\.cp-play-btn--playing:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  });

  it("hangs the close × by its inset (M53) and reaches 24 px with an invisible hit area (M477)", () => {
    expect(body(closeButton, ".cp-close")).toMatch(/margin-inline-end:\s*calc\(-1 \* /);
    expect(body(button, ".cp-btn--icon.cp-btn--sm::after")).toMatch(/--hit-target/);
  });

  it("takes the textarea's grip away and lets it grow (D7, M40)", () => {
    const b = body(textarea, ".cp-textarea");
    expect(b).toMatch(/resize:\s*none/);
    expect(b).toMatch(/field-sizing:\s*content/);
  });

  it("hides the native date indicator (D7)", () => {
    expect(body(textField, '.cp-field__input[type="date"]::-webkit-calendar-picker-indicator')).toMatch(/display:\s*none/);
  });

  it("drops the toolbar's inline padding unless it has a ground (M49)", () => {
    expect(body(index, ".cp-toolbar")).toMatch(/padding-inline:\s*0;/);
    expect(stripComments(index)).toMatch(/\.cp-toolbar--ground,[^{]*\{[^}]*padding-inline:\s*var\(--space-md\)/);
  });
});

describe("search and tips (M357, M386)", () => {
  it("greys the magnifier when the field is disabled and uses the shared close button", () => {
    expect(searchField).toMatch(/:has\(> \.cp-search-field__input:is\(:disabled, \[aria-disabled="true"\]\)\) > \.cp-search-field__icon/);
    expect(searchField).not.toMatch(/cp-search-field__clear/);
  });

  it("fades a tip in without the slide (M386)", () => {
    expect(body(hint, ":root[data-motion-entrance] body .cp-hint__tip")).toMatch(/animation:\s*cp-fade-in/);
  });
});
