import { describe, expect, it } from "vitest";

import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
import { SYNC } from "../../format/words";
import activityCss from "./ActivityPanel.css?raw";
import { JOB_EXPLAINERS, jobLabel } from "./useActiveJob";
import { formatDayHeading } from "./activityFormat";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";

const rules = parseRules(stripComments(activityCss));
const decl = (selector: string, property: string) => {
  const rule = rules.filter((r) => selectorList(r.selector).includes(selector) && r.context === "").pop();
  return rule ? Object.fromEntries(declarations(rule.body))[property] : undefined;
};

describe("the Activity list lines up (C37)", () => {
  it("gives the time and the tag columns of their own, so every message starts at one x", () => {
    expect(decl(".cp-activity__row", "grid-template-columns")).toBe(
      "var(--cp-activity-time) var(--cp-activity-tag) minmax(0, 1fr)",
    );
    expect(decl(".cp-activity", "--cp-activity-time")).toMatch(/^calc\(\d+px \* var\(--scale\)\)$/);
    expect(decl(".cp-activity", "--cp-activity-tag")).toMatch(/^calc\(\d+px \* var\(--scale\)\)$/);
  });

  it("cuts a tag too long for its column instead of widening it", () => {
    expect(decl(".cp-activity__type", "text-overflow")).toBe("ellipsis");
  });

  it("draws a kind as muted text, with no chip, frame or fill (M269)", () => {
    expect(decl(".cp-activity__type", "color")).toBe("var(--fg-muted)");
    expect(decl(".cp-activity__type", "border")).toBeUndefined();
    expect(decl(".cp-activity__type", "background")).toBeUndefined();
    expect(decl(".cp-activity__type", "justify-self")).toBeUndefined();
  });

  it("centres its rows and starts the count, the day headings and the rows on one inset (M269)", () => {
    expect(decl(".cp-activity__row", "align-items")).toBe("center");
    expect(decl(".cp-activity__summary", "padding")).toBe("0 var(--space-sm)");
    expect(decl(".cp-activity__day-heading", "padding")).toBe("var(--space-xs) var(--space-sm)");
    expect(decl(".cp-activity__row", "padding")).toBe("var(--space-xs) var(--space-sm)");
  });
});

describe("an Activity line is a sentence (new A, D5)", () => {
  it("is set in Inter, the data face, as every sentence is", () => {
    expect(decl(".cp-activity__summary-text", "font-family")).toBe("var(--font-data)");
  });
});

describe("Activity wording (C153, C161, C170)", () => {
  const job = (type: string): EngineJobSummary => ({
    id: "j",
    type,
    state: "running",
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    progress: undefined,
  });

  it("says Sync while files are written, and never Please", () => {
    expect(jobLabel(job("tag_write"))).toBe(SYNC.running);
    for (const sentence of Object.values(JOB_EXPLAINERS)) expect(sentence).not.toMatch(/\bPlease\b/);
  });

  it("writes a day heading the way the rest of the app writes a day", () => {
    const now = new Date(2026, 8, 2, 12, 0, 0);
    expect(formatDayHeading(new Date(2026, 8, 2, 9, 0).toISOString(), now)).toBe("Today");
    expect(formatDayHeading("not a date", now)).toBe("not a date");
  });
});
