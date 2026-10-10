import { describe, expect, it } from "vitest";
import {
  NEW_APP_CUTOFF,
  compareSemver,
  loadChangelog,
  newestReleasedVersion,
  parseChangelog,
  releaseUrl,
  renderInline,
} from "./changelog";

const FIXTURE = `# Changelog

All notable changes.

## [Unreleased]

### Added
- A thing not out yet

## [1.1.0] - 2026-12-01

### Added
- First \`code\` item
- A long item that
  continues on a second line
### Fixed
- A fix

### Added
- Merged into the first Added

## [1.0.0] - 2026-11-01

### Changed
- The first normal version

## [1.0.0-test.2] - 2026-10-20

### Changed
- A test build

## [0.0.3] - 2026-06-24

### Added
- Old app

---

## Release Notes Format

- **Version**: not a release
`;

describe("parseChangelog", () => {
  it("in production shows only new-app normal versions, in file order, with dates", () => {
    const versions = parseChangelog(FIXTURE, { preview: false });
    expect(versions.map((v) => v.version)).toEqual(["1.1.0", "1.0.0"]);
    expect(versions.map((v) => v.date)).toEqual(["2026-12-01", "2026-11-01"]);
  });

  it("in a preview shows everything, Unreleased first, and marks test builds and the retired app", () => {
    const preview = parseChangelog(FIXTURE, { preview: true });
    expect(preview.map((v) => v.version)).toEqual(["Unreleased", "1.1.0", "1.0.0", "1.0.0-test.2", "0.0.3"]);
    expect(preview[0]).toMatchObject({ unreleased: true, date: null, releaseUrl: null });
    expect(preview.find((v) => v.version === "1.0.0-test.2")).toMatchObject({ prerelease: true, retired: false });
    expect(preview.find((v) => v.version === "0.0.3")).toMatchObject({ retired: true });
    expect(preview.find((v) => v.version === "1.0.0")).toMatchObject({ retired: false, prerelease: false });
  });

  it("treats a version dated on or before the cut-off as the retired app", () => {
    const text = `## [2.0.0] - ${NEW_APP_CUTOFF}\n\n### Added\n- x\n`;
    expect(parseChangelog(text, { preview: false })).toEqual([]);
    expect(parseChangelog(text, { preview: true })[0]?.retired).toBe(true);
  });

  it("gives each version an anchor, and a release link only for a version with a real release", () => {
    const none = parseChangelog(FIXTURE, { preview: false });
    expect(none[0]?.anchor).toBe("v1-1-0");
    expect(none.every((v) => v.releaseUrl === null)).toBe(true);
    const some = parseChangelog(FIXTURE, { preview: false, releases: new Set(["1.0.0"]) });
    expect(some.map((v) => v.releaseUrl)).toEqual([null, "https://github.com/stuchain/CuePoint/releases/tag/v1.0.0"]);
    expect(releaseUrl("1.2.0")).toBe("https://github.com/stuchain/CuePoint/releases/tag/v1.2.0");
  });

  it("joins wrapped lines, merges repeated headings and stops at non-version sections", () => {
    const versions = parseChangelog(FIXTURE, { preview: true });
    const v = versions.find((x) => x.version === "1.1.0");
    expect(v?.sections.map((s) => s.title)).toEqual(["Added", "Fixed"]);
    expect(v?.sections[0]?.items).toEqual([
      "First `code` item",
      "A long item that continues on a second line",
      "Merged into the first Added",
    ]);
    expect(JSON.stringify(versions.at(-1))).not.toContain("not a release");
  });

  it("names the newest version a normal user is offered", () => {
    expect(newestReleasedVersion(parseChangelog(FIXTURE, { preview: true }))?.version).toBe("1.1.0");
    expect(newestReleasedVersion([])).toBeUndefined();
  });

  it("throws on a bad date, a repeated version, an unreadable heading and a non-version", () => {
    expect(() => parseChangelog("## [1.0.0] - 2026-13-45\n", { preview: false })).toThrow(/date/);
    expect(() => parseChangelog("## [1.0.0]\n", { preview: false })).toThrow(/date/);
    expect(() => parseChangelog("## [1.0.0] - 2026-11-01\n## [1.0.0] - 2026-11-02\n", { preview: false })).toThrow(/twice/);
    expect(() => parseChangelog("## [1.0.0] 2026-11-01\n", { preview: false })).toThrow(/cannot read/);
    expect(() => parseChangelog("## [one] - 2026-11-01\n", { preview: false })).toThrow(/not a version/);
  });

  it("throws when dates rise down the shown versions", () => {
    const text = "## [1.0.0] - 2026-11-01\n### Added\n- a\n## [1.1.0] - 2026-12-01\n### Added\n- b\n";
    expect(() => parseChangelog(text, { preview: false })).toThrow(/newest first/);
  });
});

describe("compareSemver", () => {
  it("orders by SemVer 2.0, prereleases below their release", () => {
    expect(compareSemver("1.10.0", "1.2.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "1.0.0-test.1")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-test.10", "1.0.0-test.2")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(compareSemver("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
    expect(compareSemver("1.0.0+a", "1.0.0+b")).toBe(0);
  });
});

describe("renderInline", () => {
  it("escapes HTML and renders code and bold", () => {
    expect(renderInline("A <b> & `x<y` and **bold**")).toBe(
      "A &lt;b&gt; &amp; <code>x&lt;y</code> and <strong>bold</strong>",
    );
  });
  it("renders a guide link as the site's guide page and an https link as it is", () => {
    expect(renderInline("See [Updates](../user-guide/updates.md#what-happens) and the [notice](https://github.com/stuchain/CuePoint/blob/main/PRIVACY_NOTICE.md).", "/")).toBe(
      'See <a href="/guide/updates/#what-happens">Updates</a> and the <a href="https://github.com/stuchain/CuePoint/blob/main/PRIVACY_NOTICE.md">notice</a>.',
    );
  });
  it("shows a link it cannot place on the site as plain text, and never lets a target break the attribute", () => {
    expect(renderInline("Read [the script](scripts/run_tests.py) and [this](javascript:alert)", "/")).toBe("Read the script and this");
    // the text is escaped before links are placed, so a quote in a target stays an entity inside the attribute
    expect(renderInline('[x](https://a.b/"onclick="y)', "/")).toBe('<a href="https://a.b/&quot;onclick=&quot;y">x</a>');
  });
  it("keeps markup inside a code span as text, quotes and scripts included", () => {
    expect(renderInline('Use `<script>alert("x")</script>` and `**not bold**`')).toBe(
      "Use <code>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</code> and <code>**not bold**</code>",
    );
  });
});

describe("the real changelog", () => {
  it("parses in both modes", () => {
    expect(() => loadChangelog({ preview: true })).not.toThrow();
    expect(() => loadChangelog({ preview: false })).not.toThrow();
  });

  it("in production shows only new-app normal versions, newest first by date", () => {
    const versions = loadChangelog({ preview: false });
    for (const v of versions) {
      expect(v.prerelease).toBe(false);
      expect(compareSemver(v.version, "1.0.0")).toBeGreaterThanOrEqual(0);
      expect(v.date! > NEW_APP_CUTOFF).toBe(true);
    }
    const dates = versions.map((v) => v.date!);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("in a preview has every version once and dated", () => {
    const versions = loadChangelog({ preview: true });
    const names = versions.map((v) => v.version);
    expect(new Set(names).size).toBe(names.length);
    for (const v of versions.filter((x) => !x.unreleased)) expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The Qt app's releases sit under "Retired desktop app (Qt)" since 5616ecb, not as versions.
  });
});
