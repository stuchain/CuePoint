/**
 * The keyboard, destination by destination (HARDEN-08, DEC-186): every destination's tab order is pinned, it
 * can be reached and read in order, it holds no trap, focus comes back to what opened a dialog (the five a
 * keyboard opens from the controls this spec reaches: Search, Columns, Get help, Keyboard shortcuts and About;
 * the others share the Modal, whose focus return and trap are tested in the renderer), and the table answers
 * the arrow keys.
 *
 * "Pinned" means the sequence of regions, roles and names that Tab visits from the top of the page is written
 * out below. A control added, dropped, renamed or moved changes it, and the change is then a decision made on
 * purpose and not a drift. A number in a name is data (a count, a row's artist), so it is pinned as "N". Controls that are one Tab stop for a whole group (the table's rows, a tab strip,
 * a toolbar's buttons, a radio group) show as that one stop; their arrow keys are checked on their own.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESTINATIONS,
  importCollection,
  launch,
  makeWorkspace,
  openDestination,
  ready,
  setLook,
  writeExport,
  type Workspace,
} from "./a11yHarness";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** What Tab landed on: where it is, what it is and what it is called. */
interface Stop {
  region: string;
  role: string;
  name: string;
}

const MAX_STOPS = 150;

/**
 * Stops that exist only in some states of the machine the suite runs on, not of the page. The pin is
 * compared with these taken out of both sides, so it holds on every runner; they are still tabbed to and
 * still counted in the reachability, trap and reading-order checks above, which look at what was seen.
 *
 * - Playback "Exclusive output" and its "Who needs exclusive output" fold: drawn only where the system has
 *   such a mode (`exclusiveSupported`, true on Windows and macOS, false on Linux).
 * - Waveforms "Check files on the Clean page." (the status line when no file of the library is on disk) and
 *   the analysis button ("Analyze waveforms", "Analyze N waveforms", "Analyze again", "Pause", "Resume"): which
 *   of them show follows the analysis state, which follows the library's files and how far the background
 *   analysis has got when Tab reaches them.
 */
const CONDITIONAL_STOPS: RegExp[] = [
  /^region "Playback" \| checkbox \| Exclusive output$/,
  /^region "Playback" \| button \| Who needs exclusive output$/,
  // Its region is the status line's own ("status"), not the Waveforms section's.
  /^status \| link \| Check files on the Clean page\.$/,
  /^[^|]+ \| button \| (Analyze waveforms|Analyze N waveforms|Analyze again)$/,
  /^region "Waveforms" \| button \| (Pause|Resume)$/,
  // Shown only where the updater works: a packaged app (`installed`), or once a check has run.
  /^region "About & updates" \| button \| Check for updates$/,
];

const withoutConditionalStops = (stops: string[]): string[] => stops.filter((stop) => !CONDITIONAL_STOPS.some((pattern) => pattern.test(stop)));

/** Starts Tab from the top of the document and returns every stop until the order cycles or leaves the page. */
async function tabOrder(window: Page): Promise<{ stops: string[]; orphans: string[]; positive: number }> {
  await window.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.querySelectorAll("[data-a11y-visited]").forEach((node) => node.removeAttribute("data-a11y-visited"));
    (window as unknown as { __a11yLast?: Element | null }).__a11yLast = null;
    window.scrollTo(0, 0);
  });
  const stops: Stop[] = [];
  for (let index = 0; index < MAX_STOPS; index += 1) {
    if (index === 0) {
      // Tab starts from the last place the pointer or the focus was, so a run starts by focusing the page's
      // first tab stop: the one a person gets from a fresh load.
      await window.evaluate(() => {
        const first = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].find((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && !(node as HTMLInputElement).disabled && !node.closest("[inert], [hidden], [aria-hidden='true']") && getComputedStyle(node).visibility !== "hidden";
        });
        first?.focus();
      });
    } else {
      await window.keyboard.press("Tab");
    }
    const stop = await window.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el === document.documentElement) return null;
      const roleOf = (node: HTMLElement): string => {
        const explicit = node.getAttribute("role");
        if (explicit) return explicit;
        const tag = node.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "summary") return "button";
        if (tag === "input") {
          const type = (node as HTMLInputElement).type;
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          if (type === "range") return "slider";
          if (type === "search") return "searchbox";
          return "textbox";
        }
        return tag;
      };
      const nameOf = (node: HTMLElement): string => {
        const label = node.getAttribute("aria-label");
        if (label) return label;
        const by = node.getAttribute("aria-labelledby");
        if (by) {
          const text = by
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ")
            .trim();
          if (text) return text;
        }
        const labels = (node as HTMLInputElement).labels;
        if (labels && labels.length > 0) return [...labels].map((l) => l.textContent?.trim() ?? "").join(" ").trim();
        const own = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
        return own || node.getAttribute("title") || node.getAttribute("placeholder") || "";
      };
      const regionOf = (node: HTMLElement): string => {
        for (let up: HTMLElement | null = node; up; up = up.parentElement) {
          const role = up.getAttribute("role");
          const tag = up.tagName.toLowerCase();
          if (role === "dialog" || role === "alertdialog") return `dialog "${up.getAttribute("aria-label") ?? ""}"`;
          if (tag === "nav" || role === "navigation") return `navigation "${up.getAttribute("aria-label") ?? ""}"`;
          if (tag === "main" || role === "main") return "main";
          if (tag === "aside" || role === "complementary") return `complementary "${up.getAttribute("aria-label") ?? ""}"`;
          if (role === "region" || (tag === "section" && up.getAttribute("aria-label"))) return `region "${up.getAttribute("aria-label") ?? ""}"`;
          if (role === "status") return "status";
          if (tag === "header" || role === "banner") return "banner";
          if (tag === "footer" || role === "contentinfo") return "contentinfo";
        }
        return "page";
      };
      // The same element twice is the order cycling: found by identity, not by where it sits or what it says.
      // (A date field is several Tab stops on one element, its day, month and year: staying on the same element is not a cycle.)
      const w = window as unknown as { __a11yLast?: Element | null };
      const sameAsLast = w.__a11yLast === el;
      w.__a11yLast = el;
      const again = el.hasAttribute("data-a11y-visited") && !sameAsLast;
      el.setAttribute("data-a11y-visited", "");
      return {
        again,
        sameAsLast,
        region: regionOf(el),
        role: roleOf(el),
        // Counts, sizes and the rows a library happens to hold are data, not the page: a digit run is "N", so
        // "First steps 1/4 done" and "Artist 0960" pin as the stable words around them.
        name: nameOf(el).slice(0, 60).replace(/\d+/g, "N"),
      };
    });
    if (!stop || stop.again) break;
    if (stop.sameAsLast) continue;
    stops.push({ region: stop.region, role: stop.role, name: stop.name });
  }
  const { orphans, positive } = await window.evaluate(() => {
    const visible = (node: Element) => {
      const box = (node as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"]',
      ),
    ].filter(
      (node) =>
        visible(node) &&
        !(node as HTMLInputElement).disabled &&
        node.getAttribute("aria-disabled") !== "true" &&
        node.getAttribute("tabindex") !== "-1" &&
        (node as HTMLInputElement).type !== "hidden" &&
        !node.closest("[inert], [hidden], [aria-hidden='true']"),
    );
    const orphans = candidates
      .filter((node) => {
        if (node.hasAttribute("data-a11y-visited")) return false;
        // One radio is the Tab stop of its group.
        if ((node as HTMLInputElement).type === "radio") {
          const name = (node as HTMLInputElement).name;
          const group = name
            ? document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)
            : node.closest('[role="radiogroup"]')?.querySelectorAll('input[type="radio"]') ?? [];
          return ![...group].some((member) => (member as HTMLElement).hasAttribute("data-a11y-visited"));
        }
        // A scroller the browser makes focusable has no name of its own and is reached by its content.
        return true;
      })
      .map((node) => `${node.tagName.toLowerCase()}${node.getAttribute("role") ? `[role=${node.getAttribute("role")}]` : ""} "${(node.getAttribute("aria-label") ?? node.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 50)}"`);
    const positive = [...document.querySelectorAll("[tabindex]")].filter((node) => Number(node.getAttribute("tabindex")) > 0).length;
    return { orphans, positive };
  });
  return {
    stops: stops.map((stop) => `${stop.region} | ${stop.role} | ${stop.name}`),
    orphans,
    positive,
  };
}

/** Pinned: each destination's Tab order, from the top of the page, with a library loaded (keyboardTabOrders.json). */
const PINNED: Record<string, string[]> = JSON.parse(readFileSync(path.join(__dirname, "keyboardTabOrders.json"), "utf-8"));

test.describe("the keyboard", () => {
  test.describe.configure({ mode: "serial" });
  let ws: Workspace;

  test.beforeEach(() => {
    ws = makeWorkspace();
  });

  test.afterEach(() => {
    ws.cleanup();
  });

  test("every destination's tab order is pinned, reachable, in reading order and holds no trap", async () => {
    test.setTimeout(600_000);
    const app = await launch(ws);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(ws.workspace));
      await setLook(window, { scale: 1.5, motion: "reduced" });
      const seen: Record<string, string[]> = {};
      for (const destination of DESTINATIONS) {
        await openDestination(window, destination);
        const order = await tabOrder(window);
        seen[destination.link] = order.stops;
        // CUEPOINT_A11Y_RECORD=1 writes what was seen as the new pin, for a change made on purpose
        // (without the stops that depend on the machine, see CONDITIONAL_STOPS).
        if (process.env.CUEPOINT_A11Y_RECORD) {
          const pin = Object.fromEntries(Object.entries(seen).map(([link, stops]) => [link, withoutConditionalStops(stops)]));
          writeFileSync(path.join(__dirname, "keyboardTabOrders.json"), `${JSON.stringify(pin, null, 2)}\n`);
        }

        // No trap: Tab cycled back to its first stop, or left the page, within the limit.
        expect(order.stops.length, `${destination.link}: Tab never cycled`).toBeLessThan(MAX_STOPS);
        expect(order.stops.length, `${destination.link}: nothing to tab to`).toBeGreaterThan(3);
        // Reachable: nothing visible, enabled and focusable is skipped by Tab.
        expect(order.orphans, `${destination.link}: controls Tab skips`).toEqual([]);
        // Reading order is the document's order: no positive tabindex jumps the queue, and the regions are met
        // in the order they sit on the page (sidebar, then the page, then the details, then the player).
        expect(order.positive, `${destination.link}: positive tabindex`).toBe(0);
        const regions = order.stops.map((stop) => stop.split(" | ")[0]!).filter((region, index, all) => index === 0 || region !== all[index - 1]);
        const rank = (region: string) =>
          region === 'navigation "Main navigation"' ? 0 : region === 'region "Player"' || region === "contentinfo" ? 2 : 1;
        const ranks = regions.map(rank);
        expect(ranks, `${destination.link}: regions out of order ${regions.join(" > ")}`).toEqual([...ranks].sort((a, b) => a - b));

        // Shift+Tab is no one-way door: it moves the focus off the stop Tab ended on.
        const focused = () =>
          window.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            const box = el?.getBoundingClientRect();
            return `${el?.tagName}|${el?.getAttribute("aria-label") ?? el?.textContent?.trim().slice(0, 40)}|${Math.round(box?.left ?? 0)}|${Math.round(box?.top ?? 0)}`;
          });
        const before = await focused();
        await window.keyboard.press("Shift+Tab");
        expect(await focused(), `${destination.link}: Shift+Tab stayed put`).not.toBe(before);
      }
      // Pinned.
      for (const destination of DESTINATIONS) {
        expect(withoutConditionalStops(seen[destination.link]!), `${destination.link}'s tab order changed`).toEqual(withoutConditionalStops(PINNED[destination.link]!));
      }
    } finally {
      await app.close();
    }
  });

  /** Opens a dialog from the keyboard on the control that has focus, and checks Escape gives the focus back. */
  async function expectFocusReturns(window: Page, opener: () => ReturnType<Page["locator"]>, open: () => Promise<void>, dialogName: string | RegExp) {
    const control = opener();
    await control.focus();
    const mark = await control.evaluate((el) => {
      el.setAttribute("data-a11y-opener", "1");
      return el.tagName;
    });
    expect(mark).toBeTruthy();
    await open();
    const dialog = window.getByRole("dialog", { name: dialogName });
    await expect(dialog).toBeVisible();
    // Focus is inside it, and Tab keeps it there (a dialog is the one place that holds the focus).
    await expect.poll(() => window.evaluate(() => !!document.activeElement?.closest("[role='dialog']"))).toBe(true);
    const trail: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      await window.keyboard.press("Tab");
      const where = await window.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return { inside: !!el?.closest("[role='dialog']"), at: `${el?.tagName} ${el?.getAttribute("aria-label") ?? el?.textContent?.trim().slice(0, 40)}` };
      });
      trail.push(where.at);
      expect(where.inside, `Tab ${index + 1} left "${dialogName}" for ${where.at} after ${trail.join(" > ")}`).toBe(true);
    }
    await window.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect
      .poll(() => window.evaluate(() => document.activeElement?.hasAttribute("data-a11y-opener") ?? false), {
        message: `focus did not return to the control that opened "${dialogName}"`,
      })
      .toBe(true);
    await window.evaluate(() => document.querySelectorAll("[data-a11y-opener]").forEach((n) => n.removeAttribute("data-a11y-opener")));
  }

  test("focus returns to the opener after the dialogs a keyboard opens here (Search, Columns, Get help, Keyboard shortcuts, About)", async () => {
    test.setTimeout(300_000);
    const app = await launch(ws);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(ws.workspace));
      await setLook(window, { scale: 1.5, motion: "reduced" });

      // Search, from the sidebar's button.
      await openDestination(window, DESTINATIONS[0]);
      await expectFocusReturns(
        window,
        () => window.getByRole("button", { name: /^Search/ }),
        () => window.keyboard.press("Enter"),
        "Search library",
      );

      // The Library's column list, from the table's Columns button.
      await expectFocusReturns(
        window,
        () => window.getByRole("button", { name: "Columns", exact: true }).first(),
        () => window.keyboard.press("Enter"),
        "Columns",
      );

      // The three dialogs Settings opens.
      await openDestination(window, DESTINATIONS[6]);
      for (const [label, name] of [
        ["Get help", /^Get help$/i],
        ["Keyboard shortcuts", /keyboard shortcuts/i],
        ["About CuePoint", /about cuepoint/i],
      ] as const) {
        await expectFocusReturns(
          window,
          () => window.getByRole("button", { name: label, exact: true }),
          () => window.keyboard.press("Enter"),
          name,
        );
      }
    } finally {
      await app.close();
    }
  });

  test("the table answers the arrow keys", async () => {
    test.setTimeout(300_000);
    const app = await launch(ws);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(ws.workspace));
      await setLook(window, { scale: 1.5, motion: "reduced" });
      await openDestination(window, DESTINATIONS[0]);

      const grid = window.getByRole("grid", { name: "Library tracks" });
      await grid.focus();
      await expect(grid).toBeFocused();
      const active = () => grid.getAttribute("aria-activedescendant");

      await window.keyboard.press("ArrowDown");
      await expect(window.getByText("1 selected")).toBeVisible();
      const first = await active();
      expect(first).toBeTruthy();

      await window.keyboard.press("ArrowDown");
      await expect.poll(active).not.toBe(first);
      const second = await active();
      await window.keyboard.press("ArrowUp");
      await expect.poll(active).toBe(first);

      await window.keyboard.press("Shift+ArrowDown");
      await expect(window.getByText("2 selected")).toBeVisible();

      await window.keyboard.press("End");
      await expect.poll(active).not.toBe(first);
      await window.keyboard.press("Home");
      await expect.poll(active).toBe(first);
      expect(second).not.toBe(first);

      // Escape lets go of the selection and leaves the focus on the table.
      await window.keyboard.press("Escape");
      await expect(window.getByText(/\d+ selected/)).toBeHidden();
      await expect(grid).toBeFocused();
    } finally {
      await app.close();
    }
  });

  test("a tab strip answers the arrow keys, and Home and End", async () => {
    test.setTimeout(300_000);
    const app = await launch(ws);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(ws.workspace));
      await setLook(window, { scale: 1.5, motion: "reduced" });
      await openDestination(window, DESTINATIONS[5]);

      const tabs = window.getByRole("tab");
      await tabs.first().focus();
      await window.keyboard.press("ArrowRight");
      await expect(tabs.nth(1)).toBeFocused();
      await window.keyboard.press("End");
      await expect(tabs.last()).toBeFocused();
      await window.keyboard.press("Home");
      await expect(tabs.first()).toBeFocused();
    } finally {
      await app.close();
    }
  });
});
