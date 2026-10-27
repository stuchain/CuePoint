/**
 * Round 3 gap fixes for Clean, held as rules on the sheets (read as text): the bar widths, the
 * neutral In use bar, the arrow cursor, one visually hidden class, the dialogs' row height, and the
 * changes tables. Each names its item.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import cleanCss from "./clean.css?raw";
import matchCss from "./match/match.css?raw";
import playlistsCss from "./match/playlists.css?raw";
import dialogsCss from "../library/cleanDialogs.css?raw";
import saveCss from "../../components/saveToFiles/SaveToFilesDialog.css?raw";

const SHEETS = { cleanCss, matchCss, playlistsCss, dialogsCss, saveCss };

/** The body of the last rule with exactly this selector: the one that wins among equals. */
const bodyOf = (css: string, selector: string) =>
  parseRules(stripComments(css))
    .filter((rule) => rule.selector === selector)
    .map((rule) => rule.body)
    .pop() ?? "";

describe("the review's bars (M80, M338, M325)", () => {
  it("draws your track's and every candidate's edge at the selected bar width, not 4 × scale", () => {
    expect(bodyOf(matchCss, ".review-card")).toMatch(/border-left:\s*var\(--selected-bar-width\) solid var\(--accent-primary\)/);
    expect(bodyOf(matchCss, ".review-candidate")).toMatch(/border-left:\s*var\(--selected-bar-width\) solid transparent/);
    expect(matchCss).not.toMatch(/border-left:\s*calc\(4px \* var\(--scale\)\)/);
  });

  it("draws the In use bar in the neutral control line, not green: all good is not green", () => {
    expect(bodyOf(matchCss, ".review-candidate--in-use")).toMatch(/border-left-color:\s*var\(--border-control\)/);
    expect(stripComments(matchCss)).not.toMatch(/accent-success/);
  });
});

describe("the preview column (M28)", () => {
  it("sizes from the large icon token, not the md alias", () => {
    expect(bodyOf(matchCss, ".cp-data-table .review-col--preview")).toMatch(/var\(--icon-size-lg\)/);
    expect(matchCss).not.toMatch(/--icon-size-md/);
  });
});

describe("the arrow cursor (M339)", () => {
  it("sets no pointer anywhere in Clean's sheets", () => {
    for (const [name, css] of Object.entries(SHEETS)) {
      expect(stripComments(css), name).not.toMatch(/cursor:\s*pointer/);
    }
  });
});

describe("one visually hidden class (M488)", () => {
  it("has no page copy of cp-visually-hidden", () => {
    expect(cleanCss).not.toMatch(/\.clean-visually-hidden/);
    expect(matchCss).not.toMatch(/\.match-visually-hidden/);
  });
});

describe("the Clean dialogs (M78, M141, M251)", () => {
  it("gives a tick row the row height every check has", () => {
    expect(bodyOf(dialogsCss, ".clean-dialog__check")).toMatch(/min-height:\s*var\(--row-height\)/);
  });

  it("draws the changes table at the row height with the cell padding, and the answer sunken with no frame", () => {
    const cells = bodyOf(dialogsCss, ".clean-dialog__changes th,\n.clean-dialog__changes td");
    expect(cells).toMatch(/height:\s*var\(--row-height\)/);
    expect(cells).toMatch(/padding:\s*0 var\(--space-sm\)/);
    const answer = bodyOf(dialogsCss, ".clean-dialog__answer");
    expect(answer).toMatch(/border:\s*0/);
    expect(answer).toMatch(/background:\s*var\(--bg-input\)/);
  });

  it("leaves the headline at the dialog's own size: no smaller body size of its own", () => {
    expect(bodyOf(dialogsCss, ".clean-dialog__headline")).not.toMatch(/font-size/);
  });
});

describe("the Sync window's changes list (M278)", () => {
  it("is the shared table: no hand-made table rules of its own", () => {
    expect(saveCss).not.toMatch(/\.save-dialog__changes/);
  });
});
