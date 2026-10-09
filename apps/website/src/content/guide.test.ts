import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { markdownToHtml } from "satteri";
import { afterAll, describe, expect, it } from "vitest";
import { GITHUB_BRANCH, GITHUB_URL } from "../data/site";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  GUIDE_ROWS,
  GUIDE_SECTIONS,
  assertGuideTable,
  checkGuideTable,
  guideSections,
  guideSlug,
  neighbours,
  orderedRows,
} from "./guide";
import {
  GuideLinkError,
  guideFiles,
  guideLinksPlugin,
  headingSlugs,
  rewriteLink,
  validateGuideLinks,
  type GuideLinkConfig,
} from "../lib/guide-links";

const REPO = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const GUIDE = join(REPO, "docs", "user-guide");
const REAL: GuideLinkConfig = { guideDir: GUIDE, repoRoot: REPO, base: "/", githubUrl: GITHUB_URL, branch: GITHUB_BRANCH };

describe("the guide's table", () => {
  const files = guideFiles(GUIDE);

  it("has a row for every file in docs/user-guide and a file for every row", () => {
    expect(files.length).toBe(17);
    expect(checkGuideTable(files)).toEqual({ missingRows: [], missingFiles: [], invalid: [] });
    expect(() => assertGuideTable(files)).not.toThrow();
  });

  it("fails the build for a file with no row", () => {
    expect(() => assertGuideTable([...files, "new-page.md"])).toThrow(/new-page\.md has no row/);
  });

  it("fails the build for a row with no file", () => {
    expect(() => assertGuideTable(files.filter((f) => f !== "player.md"))).toThrow(/row for player\.md/);
  });

  it("gives every page a description of 70 to 160 characters, unique, and a unique title and order", () => {
    for (const r of GUIDE_ROWS) {
      expect(r.description.length, r.file).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(r.description.length, r.file).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
    expect(new Set(GUIDE_ROWS.map((r) => r.description)).size).toBe(GUIDE_ROWS.length);
    expect(new Set(GUIDE_ROWS.map((r) => r.title)).size).toBe(GUIDE_ROWS.length);
    expect(new Set(GUIDE_ROWS.map((r) => r.order)).size).toBe(GUIDE_ROWS.length);
  });

  it("uses none of the words the copy avoids in a title or description", () => {
    for (const r of GUIDE_ROWS) expect(`${r.title} ${r.description}`, r.file).not.toMatch(/\bengine\b|\bjobs?\b/i);
  });

  it("rejects a bad description and a duplicate title", () => {
    const [first, second] = GUIDE_ROWS;
    const rows = [{ ...first!, description: "too short" }, { ...second!, title: first!.title }];
    const p = checkGuideTable(rows.map((r) => r.file), rows);
    expect(p.invalid.join("\n")).toMatch(/too short|characters/);
    expect(p.invalid.join("\n")).toMatch(/title/);
  });

  it("puts support-policy.md alone in the last section, outside the main list", () => {
    const sections = guideSections();
    const last = sections[sections.length - 1]!;
    expect(last.id).toBe(GUIDE_SECTIONS[GUIDE_SECTIONS.length - 1]!.id);
    expect(last.pages.map((p) => p.file)).toEqual(["support-policy.md"]);
    expect(sections.slice(0, -1).flatMap((s) => s.pages.map((p) => p.file))).not.toContain("support-policy.md");
    expect(orderedRows().at(-1)?.file).toBe("support-policy.md");
  });

  it("finds the previous and next page", () => {
    const rows = orderedRows();
    expect(neighbours(rows[0]!.file).previous).toBeUndefined();
    expect(neighbours(rows[0]!.file).next?.file).toBe(rows[1]!.file);
    expect(neighbours(rows.at(-1)!.file).next).toBeUndefined();
    expect(guideSlug("the-window.md")).toBe("the-window");
  });
});

describe("the real guide's links", () => {
  it("all resolve: every page and heading it links to exists", async () => {
    await expect(validateGuideLinks(REAL)).resolves.toBeUndefined();
  });

  it("rewrites x.md and x.md#part to the guide's addresses", async () => {
    const from = join(GUIDE, "getting-started.md");
    expect(await rewriteLink("library.md", from, REAL)).toBe("/guide/library/");
    expect(await rewriteLink("the-window.md#keyboard-shortcuts", from, REAL)).toBe("/guide/the-window/#keyboard-shortcuts");
  });

  it("builds the guide's addresses with the base", async () => {
    const from = join(GUIDE, "getting-started.md");
    expect(await rewriteLink("library.md#importing-your-rekordbox-collection", from, { ...REAL, base: "/CuePoint/" })).toBe(
      "/CuePoint/guide/library/#importing-your-rekordbox-collection",
    );
  });

  it("sends links to repository files to GitHub on the feature branch", async () => {
    const from = join(GUIDE, "the-window.md");
    expect(await rewriteLink("../policy/privacy-notice.md", from, REAL)).toBe(
      `https://github.com/stuchain/CuePoint/blob/feature/docs/policy/privacy-notice.md`,
    );
    expect(await rewriteLink("../development/beatport-v4-api.md#getting-a-token", from, REAL)).toBe(
      "https://github.com/stuchain/CuePoint/blob/feature/docs/development/beatport-v4-api.md#getting-a-token",
    );
    expect(GITHUB_BRANCH).toBe("feature");
  });

  it("leaves outside addresses alone", async () => {
    const from = join(GUIDE, "getting-started.md");
    expect(await rewriteLink("https://github.com/stuchain/CuePoint/releases", from, REAL)).toBe("https://github.com/stuchain/CuePoint/releases");
    expect(await rewriteLink("mailto:a@b.c", from, REAL)).toBe("mailto:a@b.c");
  });
});

describe("heading slugs", () => {
  it("are the ids Astro gives, repeated headings numbered", async () => {
    const slugs = await headingSlugs("# One\n\n## Two words\n\n## Two words\n\n### It's `code`: 5 things\n");
    expect([...slugs]).toEqual(["one", "two-words", "two-words-1", "its-code-5-things"]);
  });
});

describe("fixtures", () => {
  const root = mkdtempSync(join(tmpdir(), "guide-fixture-"));
  const guideDir = join(root, "docs", "user-guide");
  mkdirSync(guideDir, { recursive: true });
  mkdirSync(join(root, "docs", "policy"), { recursive: true });
  writeFileSync(join(root, "docs", "policy", "notice.md"), "# Notice\n");
  writeFileSync(join(guideDir, "one.md"), "# One\n\n## A part\n\nSee [two](two.md), [its part](two.md#some-part), [here](#a-part) and [notice](../policy/notice.md#notice).\n");
  writeFileSync(join(guideDir, "two.md"), "# Two\n\n## Some part\n\nBack to [one](one.md).\n");
  const cfg: GuideLinkConfig = { guideDir, repoRoot: root, base: "/", githubUrl: GITHUB_URL, branch: GITHUB_BRANCH };
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  async function render(name: string): Promise<string> {
    const file = join(guideDir, name);
    const { readFileSync } = await import("node:fs");
    const { html } = await markdownToHtml(readFileSync(file, "utf8"), {
      mdastPlugins: [guideLinksPlugin(cfg)],
      features: { gfm: true },
      fileURL: pathToFileURL(file),
    });
    return html;
  }

  it("rewrites the links in a rendered page", async () => {
    const html = await render("one.md");
    expect(html).toContain('href="/guide/two/"');
    expect(html).toContain('href="/guide/two/#some-part"');
    expect(html).toContain('href="#a-part"');
    expect(html).toContain(`href="${GITHUB_URL}/blob/feature/docs/policy/notice.md#notice"`);
    expect(await validateGuideLinks(cfg)).toBeUndefined();
  });

  it("fails on a link to a page that does not exist", async () => {
    writeFileSync(join(guideDir, "broken-page.md"), "# Broken\n\nSee [nothing](missing.md).\n");
    await expect(render("broken-page.md")).rejects.toThrow(/missing\.md/);
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/does not exist/);
    rmSync(join(guideDir, "broken-page.md"));
  });

  it("fails on a link to a heading that is not on the page", async () => {
    writeFileSync(join(guideDir, "broken-heading.md"), "# Broken\n\nSee [part](two.md#no-such-part).\n");
    await expect(render("broken-heading.md")).rejects.toThrow(/no-such-part/);
    await expect(validateGuideLinks(cfg)).rejects.toThrow(GuideLinkError);
    rmSync(join(guideDir, "broken-heading.md"));
  });

  it("fails on a link to a heading that is not on its own page", async () => {
    writeFileSync(join(guideDir, "broken-self.md"), "# Broken\n\nSee [part](#nope).\n");
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/#nope/);
    rmSync(join(guideDir, "broken-self.md"));
  });

  it("fails on a link to a repository file that is not there, or outside the repository", async () => {
    writeFileSync(join(guideDir, "broken-repo.md"), "# Broken\n\n[a](../policy/gone.md)\n");
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/not in the repository/);
    writeFileSync(join(guideDir, "broken-repo.md"), "# Broken\n\n[a](../../../../etc/passwd)\n");
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/leaves the repository/);
    rmSync(join(guideDir, "broken-repo.md"));
  });

  it("fails on an image and on raw HTML links, which would escape the rewriting", async () => {
    writeFileSync(join(guideDir, "broken-img.md"), "# Broken\n\n![shot](shot.png)\n");
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/image "shot\.png"/);
    writeFileSync(join(guideDir, "broken-img.md"), '# Broken\n\n<a href="two.md">two</a>\n');
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/raw HTML <a>/);
    writeFileSync(join(guideDir, "broken-img.md"), '# Broken\n\nInline <img src="x.png"> here.\n');
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/raw HTML <img>/);
    rmSync(join(guideDir, "broken-img.md"));
  });

  it("matches guide file names exactly, whatever the disk does with case", async () => {
    writeFileSync(join(guideDir, "broken-case.md"), "# Broken\n\n[x](Two.md)\n");
    await expect(validateGuideLinks(cfg)).rejects.toThrow(/does not exist \(Two\.md\)/);
    rmSync(join(guideDir, "broken-case.md"));
  });

  it("ignores Markdown outside the guide folder", async () => {
    const plugin = guideLinksPlugin(cfg);
    expect(plugin({ fileURL: new URL("file:///elsewhere/post.md") })).toBeNull();
    expect(plugin({ fileURL: undefined })).toBeNull();
  });
});
