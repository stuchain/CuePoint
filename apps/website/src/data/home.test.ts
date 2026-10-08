import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GUIDE_ROWS } from "../content/guide";
import { APP_SHOTS, FEATURES, OPENING_STEPS, TRUST } from "./home";

/** The words DEC-155 and DEC-158 keep out of the site. */
const BANNED = /\b(engine|jobs?)\b/i;
const allCopy = () => [
  ...OPENING_STEPS.flatMap((s) => [s.title, s.text]),
  ...FEATURES.flatMap((f) => [f.name, f.heading, f.text]),
  ...TRUST.flatMap((t) => [t.title, t.text]),
  ...Object.values(APP_SHOTS).flatMap((s) => [s.alt, s.label]),
];

describe("the home page's content", () => {
  it("has one section for each thing the app does, in the spec's order", () => {
    expect(FEATURES.map((f) => f.id)).toEqual(["clean", "library", "keys", "discover", "prepare", "statistics", "export"]);
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });

  it("writes each section as a short heading and two or three sentences", () => {
    for (const f of FEATURES) {
      expect(f.heading.length, f.id).toBeGreaterThan(8);
      expect(f.heading.length, f.id).toBeLessThan(60);
      const sentences = f.text.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, `${f.id} has ${sentences.length} sentences`).toBeGreaterThanOrEqual(2);
      expect(sentences.length, `${f.id} has ${sentences.length} sentences`).toBeLessThanOrEqual(3);
    }
  });

  it("links each section that has a guide page to a page that exists (SITE-08 will add the feature pages)", () => {
    const slugs = new Set(GUIDE_ROWS.map((r) => r.file.replace(/\.md$/, "")));
    for (const f of FEATURES.filter((x) => x.learnMore)) {
      const path = f.learnMore!.path;
      expect(path, f.id).toMatch(/^guide\/[\w-]+\/$/);
      expect(slugs.has(path.split("/")[1]!), `${f.id} links ${path}`).toBe(true);
    }
    // the guide does not describe these two pages yet, so there is nothing true to link
    expect(FEATURES.filter((f) => !f.learnMore).map((f) => f.id)).toEqual(["keys", "statistics"]);
  });

  it("keeps the words the site never uses out of every line of copy", () => {
    for (const line of allCopy()) expect(line).not.toMatch(BANNED);
  });

  it("uses American English", () => {
    for (const line of allCopy()) expect(line).not.toMatch(/\b(colour|organis|catalogue|favourite|grey)/i);
  });

  it("gives every section an app picture slot of the app's default size, with a real description", () => {
    for (const f of FEATURES) {
      const shot = APP_SHOTS[f.shot];
      expect(shot, `${f.id} has no slot`).toBeDefined();
      expect([shot.width, shot.height]).toEqual([1280, 800]);
      expect(shot.alt.length).toBeGreaterThan(20);
      expect(shot.label.length).toBeGreaterThan(2);
    }
    expect(APP_SHOTS["window"], "the opening scene's end").toBeDefined();
  });

  it("never claims a key spread for Statistics: the Keys page is the one home of it (DEC-206)", () => {
    const stats = FEATURES.find((f) => f.id === "statistics")!;
    expect(stats.text).not.toMatch(/genre, key|key, tempo|and key\b/i);
    expect(stats.text).toMatch(/key summary that opens Keys/);
  });

  it("makes each trust claim from words the cited documents really contain", () => {
    expect(TRUST.map((t) => t.id)).toEqual(["free", "local", "yours", "open", "rekordbox"]);
    // whitespace and ** ignored, so a phrase may sit across a line break of the Markdown
    const flat = (t: string) => t.replace(/\*\*/g, "").replace(/\s+/g, " ");
    for (const t of TRUST) {
      expect(t.evidence.length, t.id).toBeGreaterThan(0);
      for (const { file, phrase } of t.evidence) {
        const path = resolve(process.cwd(), "../..", file);
        expect(existsSync(path), `${t.id}: ${file}`).toBe(true);
        expect(flat(readFileSync(path, "utf8")), `${t.id}: "${phrase}" is not in ${file}`).toContain(flat(phrase));
      }
    }
  });

  it("does not say the library is never changed: a refresh removes tracks that left the export, and tags can be written", () => {
    const yours = TRUST.find((t) => t.id === "yours")!;
    expect(yours.text).not.toMatch(/deletes no track/i);
    expect(yours.text).toMatch(/never deletes or moves your music files/);
    expect(yours.text).toMatch(/preview/);
    expect(yours.text).toMatch(/nothing happens until you confirm/);
  });

  it("tells the story of the opening scene in three steps that match the scene's phases", () => {
    expect(OPENING_STEPS.map((s) => s.id)).toEqual(["messy", "matched", "ready"]);
  });
});
