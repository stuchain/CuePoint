/**
 * The verification round's Library sheet rules, read from the stylesheet sources: the menus' gap,
 * inset and fill (M69, M112, M288, M289), the chips' ring room (M362), the tree's drop marks and
 * rename field (M360, M365), the export list's whole pixels (M80), the refresh well (M275) and the
 * header's trail (M102). A jsdom render cannot resolve the cascade, so the rules are read as text.
 */
import { describe, expect, it } from "vitest";

import collectionsCss from "./CollectionsPane.css?raw";
import filterBarCss from "./FilterBar.css?raw";
import firstStepsCss from "./FirstSteps.css?raw";
import headerCss from "./LibraryHeader.css?raw";
import libraryCss from "./library.css?raw";
import pickerCss from "./PickerDialog.css?raw";
import quickCss from "./QuickFilters.css?raw";
import exportCss from "./rekordboxExport.css?raw";

/** The declarations of every rule whose selector list holds `selector` exactly, comments dropped. */
function body(css: string, selector: string): string {
  const out: string[] = [];
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1]!.split(",").map((part) => part.trim());
    if (selectors.includes(selector)) out.push(match[2]!);
  }
  return out.join("\n");
}

describe("the Library's menus (M69, M112, M288, M289)", () => {
  it("opens the quick-filter list and the first-steps popover 2xs off their trigger (M69 A)", () => {
    expect(body(quickCss, ".cp-quick__panel")).toMatch(/top:\s*calc\(100% \+ var\(--space-2xs\)\);/);
    expect(body(firstStepsCss, ".first-steps-note__popover")).toMatch(/top:\s*calc\(100% \+ var\(--space-2xs\)\);/);
  });

  it("gives the Key grid its whole width (M112)", () => {
    expect(body(quickCss, ".cp-quick__panel:has(.cp-quick__keys)")).toMatch(/max-width:\s*none;/);
  });

  it("draws the quick-filter list as a menu: inset, touching rows of a menu row's height (M288)", () => {
    expect(body(quickCss, ".cp-quick__panel")).toMatch(/padding:\s*var\(--space-xs\);/);
    expect(body(quickCss, ".cp-quick__list")).toMatch(/gap:\s*0;/);
    const choice = body(quickCss, ".cp-quick__choice");
    expect(choice).toMatch(/min-height:\s*calc\(var\(--row-height\) \+ var\(--hairline\)\);/);
    expect(choice).toMatch(/padding-inline:\s*var\(--space-md\);/);
  });

  it("uses the one menu fill for a hovered choice and the picker's active row (M289)", () => {
    expect(body(quickCss, ".cp-quick__choice:hover")).toMatch(/background:\s*var\(--menu-active-fill\);/);
    const active = body(pickerCss, ".cp-picker__item--active:not(:disabled)");
    expect(active).toMatch(/background:\s*var\(--menu-active-fill\);/);
    expect(active).not.toMatch(/accent|selected-row/);
  });

  it("lets a leaving list or popover take no click (M380)", () => {
    expect(body(quickCss, ".cp-quick__panel[data-leaving]")).toMatch(/pointer-events:\s*none;/);
    expect(body(firstStepsCss, ".first-steps-note__popover[data-leaving]")).toMatch(/pointer-events:\s*none;/);
  });
});

describe("the filter row's chips (M362)", () => {
  it("leaves the scrolled chips room for a focus ring above and below", () => {
    expect(body(filterBarCss, ".cp-filter-bar__chips-wrap .cp-filter-bar__chips")).toMatch(
      /padding-block:\s*var\(--focus-ring-width\);/,
    );
  });
});

describe("the tree's drag and rename (M365, M360, M55)", () => {
  it("tints the row a drop lands in, draws one insertion line, and never uses the focus outline", () => {
    const into = body(collectionsCss, ".cp-playlist-pane__row--drop");
    expect(into).toMatch(/background:\s*var\(--bg-selected\);/);
    expect(into).not.toMatch(/outline/);
    expect(collectionsCss).toMatch(/box-shadow:\s*inset 0 2px 0 var\(--accent-primary\);/);
    expect(collectionsCss).not.toMatch(/dashed var\(--accent-primary\)/);
  });

  it("shows a labelled top-level band, a row tall, while dragging", () => {
    const band = body(collectionsCss, ".cp-collections__root-drop--shown");
    expect(band).toMatch(/height:\s*var\(--row-height\);/);
    expect(band).toMatch(/margin-bottom:\s*calc\(-1 \* var\(--row-height\)\);/);
  });

  it("gives the rename field a field's border and an inset ring (M360)", () => {
    expect(body(collectionsCss, ".cp-playlist-pane__rename")).toMatch(/border:\s*var\(--control-border-width\) solid var\(--border-control\);/);
    expect(body(collectionsCss, ".cp-playlist-pane__rename:focus-visible")).toMatch(/outline-offset:\s*var\(--focus-ring-offset-inset\);/);
  });

  it("hangs + New by its padding, so its box ends at the pane edge (M55)", () => {
    expect(body(collectionsCss, ".cp-collections__new")).toMatch(/margin-inline-end:\s*calc\(0px - var\(--space-sm\)\);/);
  });
});

describe("dialogs and the header", () => {
  it("rounds the export list's gap to whole pixels (M80)", () => {
    expect(body(exportCss, ".rekordbox-export__playlists")).toMatch(/gap:\s*round\(nearest, calc\(2px \* var\(--scale\)\), 1px\);/);
  });

  it("draws the refresh's removed tracks in a sunken well that does not scroll on its own (M275)", () => {
    const well = body(libraryCss, ".library-preview__samples");
    expect(well).toMatch(/border:\s*0;/);
    expect(well).toMatch(/background:\s*var\(--bg-input\);/);
    expect(body(libraryCss, ".library-preview__samples ul")).not.toMatch(/max-height/);
  });

  it("keeps the header's trail on one line (M102)", () => {
    const trail = /\.library-header__trail[^{]*\{([^}]*)\}/.exec(headerCss.replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(trail).not.toBeNull();
    expect(headerCss).toMatch(/display:\s*inline-flex;\s*flex-wrap:\s*nowrap;/);
  });
});
