/**
 * Every screen renders inside the shell frame.
 *
 * SHELL-01 replaced a centered flex column with a grid, and every existing
 * screen was authored against the old container. That makes "does each screen
 * still mount and render its content into the shell's content region" the
 * question this step most needs answered, and a spot check of one screen would
 * not answer it — so all five routes are exercised here.
 *
 * The engine bridge is absent (no `window.cuepoint`), which is a state every
 * screen already has to tolerate: the renderer runs in a browser tab during
 * development.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { LAST_DESTINATION_STORAGE_KEY } from "./components/shell";

/** Several screens also link to Settings, so navigation is driven from the nav. */
function navLink(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: /main navigation/i })).getByRole(
    "link",
    { name },
  );
}

/** `marker` is text unique to that screen, so a route that silently rendered
 * nothing (or rendered the wrong screen) fails rather than passing on the mere
 * presence of a `.screen` element. */
const ROUTES = [
  { link: "Tools", marker: /Select a tool to get started/i },
  { link: "inKey", marker: /CuePoint \/ inKey/i },
  { link: "inCrate", marker: /CuePoint \/ inCrate/i },
  { link: "Results", marker: /Sync with Rekordbox/i },
  { link: "Settings", marker: /Beatport token/i },
];

describe("App shell", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The onboarding dialog would otherwise open over the shell on first run
    // and swallow the navigation clicks.
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    // The app uses a hash router, and jsdom keeps `location.hash` for the whole
    // file. Clearing it is what makes each test start like a fresh launch
    // rather than inheriting the previous test's route.
    window.location.hash = "";
    // jsdom implements neither of these; without stubs they report through the
    // virtual console as errors and defeat the console assertion below.
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    localStorage.clear();
  });

  it("renders the menu bar inside the shell rather than as a fixed overlay", () => {
    const { container } = render(<App />);

    const menubar = container.querySelector(".app-shell__menubar");
    expect(menubar).not.toBeNull();
    expect(menubar?.querySelector(".app-menu-bar")).not.toBeNull();
  });

  it("renders exactly one main region", () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("renders the sidebar region", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__sidebar .cp-sidebar")).not.toBeNull();
  });

  it("renders the inspector region", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__inspector .cp-inspector")).not.toBeNull();
  });

  it("keeps the inspector mounted across navigation (DEC-018)", async () => {
    // The promise DEC-018 makes: the Inspector lives in the shell, not in a
    // screen, so moving between destinations never unmounts it. Widths and
    // selections survive navigation because of this, not in spite of it.
    const user = userEvent.setup();
    const { container } = render(<App />);
    const before = container.querySelector(".app-shell__inspector .cp-inspector");

    await user.click(navLink("Settings"));
    await screen.findByText(/Beatport token/i);

    expect(container.querySelector(".app-shell__inspector .cp-inspector")).toBe(before);
  });

  it("does not render the regions later steps fill", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__player")).toBeNull();
    expect(container.querySelector(".app-shell__status")).toBeNull();
  });

  it.each(ROUTES)("renders the $link screen inside the content region", async ({ link, marker }) => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(navLink(link));

    const main = container.querySelector("main.app-main");
    await waitFor(() => {
      expect(main?.querySelector(".screen")).not.toBeNull();
    });
    expect(within(main as HTMLElement).getByText(marker)).toBeInTheDocument();
  });

  it("navigates every route without a console error", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const route of ROUTES) {
      await user.click(navLink(route.link));
    }

    expect(consoleError).not.toHaveBeenCalled();
  });

  describe("launch destination (DEC-027)", () => {
    it("opens on home when nothing is stored", async () => {
      render(<App />);

      expect(await screen.findByText(/Select a tool to get started/i)).toBeInTheDocument();
    });

    it("reopens on the last-visited destination", async () => {
      const user = userEvent.setup();
      const first = render(<App />);
      await user.click(navLink("Settings"));
      await screen.findByText(/Beatport token/i);
      first.unmount();

      // A fresh mount stands in for a fresh launch: the router starts at "/"
      // either way, and only what is stored can bring it back.
      render(<App />);

      expect(await screen.findByText(/Beatport token/i)).toBeInTheDocument();
    });

    it.each([
      ["a destination that no longer exists", "a-page-that-was-removed"],
      ["a malformed value", "{}"],
      ["an empty value", ""],
    ])("falls back to home given %s, without a blank content area", async (_case, stored) => {
      localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, stored);

      const { container } = render(<App />);

      expect(await screen.findByText(/Select a tool to get started/i)).toBeInTheDocument();
      // The failure this step exists to fix is chrome with an empty content
      // area, which "did it render home" alone would not catch.
      expect(container.querySelector("main.app-main .screen")).not.toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("does not drag the user back to the restored page after navigating", async () => {
      const user = userEvent.setup();
      localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, "settings");
      render(<App />);
      await screen.findByText(/Beatport token/i);

      await user.click(navLink("inCrate"));

      expect(await screen.findByText(/CuePoint \/ inCrate/i)).toBeInTheDocument();
    });

    it("remembers the destination it navigated to", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(navLink("Results"));
      await screen.findByText(/Sync with Rekordbox/i);

      expect(localStorage.getItem(LAST_DESTINATION_STORAGE_KEY)).toBe("results");
    });
  });
});
