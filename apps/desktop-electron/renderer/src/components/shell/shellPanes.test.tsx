/**
 * The shell's panes (D34 F6 / Shift+F6), the offline `inert` walk (D31), and two small words
 * (D25 "Done ·", M269 summaries).
 */
import { afterEach, describe, expect, it } from "vitest";

import { formatEventSummary } from "./activityFormat";
import { clearInert, keepInert, markInert } from "./offlineInert";
import { nextPane, PANE_ATTRIBUTE } from "./shellKeyboard";
import { jobDoneLine } from "./useActiveJob";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";

afterEach(() => {
  document.body.innerHTML = "";
});

function pane(name: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute(PANE_ATTRIBUTE, name);
  document.body.appendChild(element);
  return element;
}

describe("nextPane", () => {
  it("goes to the first pane when focus is in none, the last going back", () => {
    const [a, b, c] = [pane("a"), pane("b"), pane("c")] as [HTMLElement, HTMLElement, HTMLElement];
    expect(nextPane([a, b, c], null, false)).toBe(a);
    expect(nextPane([a, b, c], null, true)).toBe(c);
  });

  it("moves on from the pane that holds focus and wraps round", () => {
    const [a, b, c] = [pane("a"), pane("b"), pane("c")] as [HTMLElement, HTMLElement, HTMLElement];
    const inside = document.createElement("button");
    b.appendChild(inside);
    expect(nextPane([a, b, c], inside, false)).toBe(c);
    expect(nextPane([a, b, c], inside, true)).toBe(a);
    expect(nextPane([a, b, c], c, false)).toBe(a);
    expect(nextPane([a, b, c], a, true)).toBe(c);
  });

  it("has nowhere to go with no panes", () => {
    expect(nextPane([], null, false)).toBeNull();
  });
});

describe("the offline inert walk (D31)", () => {
  function page() {
    const region = document.createElement("main");
    region.innerHTML = `
      <section id="plain"><button>Go</button></section>
      <section id="holder"><div id="inner"><button>Other</button></div><div role="dialog" id="dlg"><button>Close</button></div></section>
      <button id="copy" data-offline-ok>Copy</button>`;
    document.body.appendChild(region);
    return region;
  }

  it("marks what is not a dialog, leaves dialogs, their holders and offline-ok controls alone", () => {
    const region = page();
    markInert(region);
    expect(region).not.toHaveAttribute("inert");
    expect(region.querySelector("#plain")).toHaveAttribute("inert");
    expect(region.querySelector("#holder")).not.toHaveAttribute("inert");
    expect(region.querySelector("#inner")).toHaveAttribute("inert");
    expect(region.querySelector("#dlg")).not.toHaveAttribute("inert");
    expect(region.querySelector("#copy")).not.toHaveAttribute("inert");
  });

  it("takes back only what it marked", () => {
    const region = page();
    const marked = markInert(region);
    clearInert(marked);
    expect(region.querySelector("[inert]")).toBeNull();
  });

  it("keepInert marks now and clears when stopped", () => {
    const region = page();
    const stop = keepInert(region);
    expect(region.querySelector("#plain")).toHaveAttribute("inert");
    stop();
    expect(region.querySelector("[inert]")).toBeNull();
  });
});

describe("the strip's done line (D25)", () => {
  const job = (type: string) => ({ type }) as unknown as EngineJobSummary;

  it("says Done, or Stopped, with what it was where that is known", () => {
    expect(jobDoneLine(null)).toBe("Done");
    expect(jobDoneLine(null, true)).toBe("Stopped");
    expect(jobDoneLine(job("no_such_kind"))).toBe("Done");
    expect(jobDoneLine(job("library_import"))).toMatch(/^Done · \S/);
    expect(jobDoneLine(job("library_import"), true)).toMatch(/^Stopped · \S/);
  });
});

describe("the feed's summaries (M269)", () => {
  it("calls a discovery run a dig", () => {
    expect(formatEventSummary("discovery.ran", "Discovery ran on 3 playlists")).toBe("Dig ran on 3 playlists");
    expect(formatEventSummary("clean.synced", "Discovery stays")).toBe("Discovery stays");
  });
});
