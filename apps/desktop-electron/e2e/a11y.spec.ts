/**
 * Accessibility in the real app (HARDEN-08, DEC-186): axe at WCAG 2.2 A and AA on every destination with a
 * library loaded, in each theme, at 1x and 1.5x, with motion on and with the system asking for reduced motion.
 *
 * The renderer's own tests run axe in jsdom, which cannot compute a colour, so this is where `color-contrast`
 * runs, and every other rule runs too. A violation that needs a colour change is a visual change and waits
 * for the owner's go on a mockup: it is recorded in `/mnt/project-files/phase18-hardening/a11y-findings.md`
 * and named in `a11yExclusions.json`, which this spec reads. The file is empty when nothing is outstanding.
 * An entry names one rule, a selector the failing element is, or is inside (`closest`), optionally a list of
 * themes, a text size and a destination, and the finding that records it; nothing else is left out, and every scan records what it left
 * out as a test annotation, so no exclusion is silent. A fixed finding has its entry deleted.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESTINATIONS,
  SCALES,
  THEMES,
  importCollection,
  launch,
  makeWorkspace,
  openDestination,
  settle,
  ready,
  setLook,
  writeExport,
  type Workspace,
} from "./a11yHarness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Exclusion {
  rule: string;
  /** A selector the failing element is inside, or is. */
  selector: string;
  /** The themes it applies to; all of them when left out. */
  themes?: string[];
  scale?: number;
  destination?: string;
  /** The id of the entry in a11y-findings.md. */
  finding: string;
  reason: string;
}

const EXCLUSIONS: Exclusion[] = JSON.parse(readFileSync(path.join(__dirname, "a11yExclusions.json"), "utf-8"));
// Legacy mode runs axe in the window itself: an Electron window cannot open the second page the default mode uses.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("a11yExclusions.json", () => {
  test("names the rule, the selector and the finding of every entry", () => {
    for (const entry of EXCLUSIONS) {
      expect(entry.rule, JSON.stringify(entry)).toBeTruthy();
      expect(entry.selector, JSON.stringify(entry)).toBeTruthy();
      expect(entry.finding, JSON.stringify(entry)).toMatch(/^A11Y-[A-Z0-9-]+$/);
      expect(entry.reason, JSON.stringify(entry)).toBeTruthy();
    }
  });
});

test.describe("axe, WCAG 2.2 A and AA, in each theme", () => {
  let ws: Workspace;

  test.beforeEach(() => {
    ws = makeWorkspace();
  });

  test.afterEach(() => {
    ws.cleanup();
  });

  for (const theme of THEMES) {
    test(`${theme}: every destination, at 1x and 1.5x, with motion on and reduced`, async () => {
      test.setTimeout(900_000);
      const app = await launch(ws);
      const failures: string[] = [];
      const used = new Set<Exclusion>();
      try {
        const window = await ready(app);
        await importCollection(window, writeExport(ws.workspace));

        const scan = async (theme: string, scale: number, motion: string, destination: { link: string }, state: string) => {
          const builder = () => new AxeBuilder({ page: window }).setLegacyMode(true);
          const results = await builder().withTags(WCAG_TAGS).analyze();
          // `region` (content inside a landmark) is a best practice and not in the WCAG tags, so it is asked for by name.
          const landmarks = await builder().withRules(["region"]).analyze();
          // The scan must have looked at colour: this is the one place `color-contrast` can run.
          const contrastChecked = results.passes.some((rule) => rule.id === "color-contrast") || results.violations.some((rule) => rule.id === "color-contrast");
          if (!contrastChecked) failures.push(`${theme} ${scale}x ${destination.link}${state}: color-contrast was not evaluated`);
          for (const violation of [...results.violations, ...landmarks.violations]) {
            for (const node of violation.nodes) {
              const target = node.target.join(" ");
              let excluded: Exclusion | undefined;
              for (const entry of EXCLUSIONS) {
                if (
                  entry.rule !== violation.id ||
                  (entry.themes !== undefined && !entry.themes.includes(theme)) ||
                  (entry.scale !== undefined && entry.scale !== scale) ||
                  (entry.destination !== undefined && entry.destination !== destination.link)
                ) {
                  continue;
                }
                // The failing element is, or sits inside, an element matching the entry's selector.
                const inside = await window.evaluate(
                  ([path, selector]) => document.querySelector(path!)?.closest(selector!) != null,
                  [node.target[node.target.length - 1] as string, entry.selector],
                );
                if (inside) {
                  excluded = entry;
                  break;
                }
              }
              if (excluded) {
                used.add(excluded);
                test.info().annotations.push({
                  type: "excluded",
                  description: `${excluded.finding}: ${violation.id} on ${target} (${theme}, ${scale}x, ${destination.link})`,
                });
                continue;
              }
              failures.push(
                `${theme} ${scale}x motion ${motion} ${destination.link}${state}: ${violation.id} (${violation.impact}) on ${target}\n    ${node.failureSummary?.replace(/\n/g, "\n    ")}`,
              );
            }
          }
        };

        for (const scale of SCALES) {
          for (const motion of ["on", "reduced"] as const) {
            await setLook(window, { theme, scale, motion });
            for (const destination of DESTINATIONS) {
              await openDestination(window, destination);
              await scan(theme, scale, motion, destination, "");
              if (destination.link === "Library") {
                // A selected row is lit in the accent, which the page at rest does not show.
                const grid = window.getByRole("grid", { name: "Library tracks" });
                await grid.focus();
                await window.keyboard.press("ArrowDown");
                await expect(window.getByText("1 selected")).toBeVisible();
                // The details panel and its tabs fade in; a colour read halfway through the fade is not the colour at rest.
                await window.waitForTimeout(1500);
                await settle(window);
                await scan(theme, scale, motion, destination, " (a row selected)");
                await window.keyboard.press("Escape");
              }
            }
          }
        }
      } finally {
        await app.close();
      }
      // An exclusion that matched nothing in this theme is stale (the finding was fixed, or the selector drifted): delete it.
      for (const entry of EXCLUSIONS) {
        if (entry.themes !== undefined && !entry.themes.includes(theme)) continue;
        if (!used.has(entry)) failures.push(`${entry.finding}: the exclusion for ${entry.rule} on "${entry.selector}" matched nothing in ${theme}, so it is stale: delete it or fix its selector`);
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
