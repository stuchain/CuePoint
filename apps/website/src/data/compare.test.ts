import { describe, expect, it } from "vitest";
import { COMPARE_CHECKED, COMPARE_TOOLS, compareHref } from "./compare";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "../content/guide";

const BANNED = /\b(engine|jobs?)\b/i;
const TODAY = new Date().toISOString().slice(0, 10);

describe("the comparison pages (DEC-197)", () => {
  it("covers Lexicon, Mixed In Key and rekordcloud's OpenKeyScan", () => {
    expect(COMPARE_TOOLS.map((t) => t.slug)).toEqual(["lexicon", "mixed-in-key", "openkeyscan"]);
    expect(compareHref("lexicon")).toBe("compare/lexicon/");
  });

  it("dates the check, and not in the future", () => {
    expect(COMPARE_CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(COMPARE_CHECKED <= TODAY).toBe(true);
  });

  it("links every fact about another tool to a public page of that tool, over https, with the date it was checked", () => {
    for (const t of COMPARE_TOOLS) {
      expect(t.rows.length, t.slug).toBeGreaterThanOrEqual(4);
      for (const row of t.rows) {
        expect(row.other.text.length, `${t.slug}/${row.topic}`).toBeGreaterThan(10);
        expect(row.other.checked, `${t.slug}/${row.topic}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(row.other.checked <= TODAY).toBe(true);
        const url = new URL(row.other.source.url);
        expect(url.protocol, row.other.source.url).toBe("https:");
        expect(
          t.hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)),
          `${url.hostname} is not ${t.name}'s own`,
        ).toBe(true);
        expect(row.other.source.label.length).toBeGreaterThan(3);
        expect(row.cuepoint.length, `${t.slug}/${row.topic}`).toBeGreaterThan(10);
      }
    }
  });

  it("says what CuePoint does not do, on every page", () => {
    for (const t of COMPARE_TOOLS) expect(t.cuepointDoesNot.length, t.slug).toBeGreaterThanOrEqual(3);
  });

  it("keeps to facts: no ranking words, no ratings, no reviews", () => {
    for (const t of COMPARE_TOOLS)
      for (const row of t.rows) {
        expect(row.other.text, t.slug).not.toMatch(
          /\b(best|better|worse|worst|superior|inferior|cheaper|stars?|rated|rating|trustpilot)\b/i,
        );
      }
  });

  it("writes titles and descriptions within the checks' limits, unique, in the site's words", () => {
    for (const t of COMPARE_TOOLS) {
      expect(t.title.length, t.slug).toBeLessThanOrEqual(60);
      expect(t.description.length, t.slug).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(t.description.length, t.slug).toBeLessThanOrEqual(DESCRIPTION_MAX);
      const all = [
        t.title,
        t.description,
        t.intro,
        ...t.cuepointDoesNot,
        ...t.rows.flatMap((r) => [r.topic, r.other.text, r.cuepoint]),
      ];
      // "Engine DJ" is another company's product name, not CuePoint's word for anything
      for (const line of all) expect(line.replaceAll("Engine DJ", ""), t.slug).not.toMatch(BANNED);
    }
    expect(new Set(COMPARE_TOOLS.map((t) => t.title)).size).toBe(COMPARE_TOOLS.length);
    expect(new Set(COMPARE_TOOLS.map((t) => t.description)).size).toBe(COMPARE_TOOLS.length);
  });

  it("says who makes the two rekordcloud tools, sourced to rekord.cloud, so a search for rekordcloud lands here", () => {
    for (const slug of ["lexicon", "openkeyscan"]) {
      const t = COMPARE_TOOLS.find((x) => x.slug === slug)!;
      const row = t.rows.find((r) => r.topic === "Who makes it");
      expect(row, slug).toBeDefined();
      expect(row!.other.source.url, slug).toBe("https://rekord.cloud/");
      expect(row!.other.text).toMatch(/rekordcloud/);
    }
    expect(COMPARE_TOOLS.find((t) => t.slug === "lexicon")!.heading).toMatch(/rekordcloud/);
  });

  it("states no fact in an intro: the intros only say where the facts come from", () => {
    for (const t of COMPARE_TOOLS) {
      expect(t.intro, t.slug).toMatch(/own public pages/);
      expect(t.intro, t.slug).not.toMatch(/one thing|one job|several DJ apps|analyzes your audio/i);
    }
  });

  it("does not claim CuePoint never touches audio, or never goes online", () => {
    for (const t of COMPARE_TOOLS)
      for (const line of [...t.cuepointDoesNot, ...t.rows.map((r) => r.cuepoint), t.chooseCuePoint, t.chooseOther]) {
        expect(line, t.slug).not.toMatch(/does not analy[sz]e audio|does not listen|listen to your music|sends nothing|keeps your library on your computer and goes online only/i);
      }
  });

  it("uses plain words for the price plans and for the Rekordbox button", () => {
    const lexicon = COMPARE_TOOLS.find((t) => t.slug === "lexicon")!;
    expect(lexicon.rows.find((r) => r.topic === "Price")!.other.text).not.toMatch(/\$0/);
    const mik = COMPARE_TOOLS.find((t) => t.slug === "mixed-in-key")!;
    expect(mik.rows.map((r) => r.cuepoint).join(" ")).toMatch(/Reload Tag\b(?!s)/);
  });

  it("describes the computers CuePoint runs on as the support policy does", () => {
    const row = COMPARE_TOOLS.find((t) => t.slug === "lexicon")!.rows.find((r) => r.topic === "Computers")!;
    expect(row.cuepoint).toMatch(/Windows/);
    expect(row.cuepoint).toMatch(/Apple Silicon/);
    expect(row.cuepoint).toMatch(/experimental Linux/);
    expect(row.cuepoint).not.toMatch(/Intel/);
  });

  it("names no price on CuePoint's side", () => {
    for (const t of COMPARE_TOOLS) for (const row of t.rows) expect(row.cuepoint, t.slug).not.toMatch(/\$\d/);
  });
});
