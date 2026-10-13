/**
 * G6 T4 guard: every page is titled by the one shared `ScreenHeader`.
 *
 * Each destination in the nav registry is opened through the sidebar, and the page that is on
 * screen must hold exactly one `.cp-screen-header` and one `<h1>`, named for the page. A page
 * left on its own title row, or one that draws two, fails here. Nothing but `ScreenHeader`
 * draws an `<h1>` or the old `.screen__title`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "../App";
import { NAV_DESTINATIONS } from "../components/shell/navRegistry";

const LOADED = { timeout: 15_000 };

const sources = import.meta.glob(["/src/**/*.tsx", "!/src/**/*.test.tsx", "!/src/**/*.stories.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** What is on screen among `nodes`: a page the user has left stays mounted but hidden (KeptPages). */
function onScreen<T extends Element>(nodes: T[]): T[] {
  return nodes.filter((node) => !node.closest("[style*='display: none']"));
}

describe("page headers (T4)", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
    window.location.hash = "";
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    localStorage.clear();
  });

  const destinations = NAV_DESTINATIONS.filter((destination) => destination.enabled);

  it.each(destinations.map((destination) => [destination.label, destination.id]))(
    "%s has one shared header and one h1 named for the page",
    async (label) => {
      const user = userEvent.setup();
      const { container } = render(<App />);
      const nav = screen.getByRole("navigation", { name: /main navigation/i });
      await user.click(within(nav).getByRole("link", { name: new RegExp(`^${label}`) }));

      await waitFor(() => {
        const main = container.querySelector("main.app-main") as HTMLElement;
        expect(onScreen(Array.from(main.querySelectorAll(".cp-screen-header")))).toHaveLength(1);
      }, LOADED);

      const main = container.querySelector("main.app-main") as HTMLElement;
      const headings = onScreen(Array.from(main.querySelectorAll("h1")));
      expect(headings).toHaveLength(1);
      expect(headings[0].closest(".cp-screen-header")).not.toBeNull();
      expect(headings[0]).toHaveTextContent(label);
    },
    30_000,
  );

  it("is the only place an <h1> or the old .screen__title is drawn", () => {
    const stray = Object.entries(sources)
      .filter(([path]) => !path.endsWith("/components/shell/ScreenHeader.tsx"))
      .map(([path, source]) => [path, source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1")] as const)
      .filter(([, code]) => /<h1[\s>]/.test(code) || code.includes("screen__title"))
      .map(([path]) => path.replace(/^\/src\//, ""));
    expect(stray, `use ScreenHeader in: ${stray.join(", ")}`).toEqual([]);
  });
});
