/**
 * Sidebar behaviour (DEC-020, DEC-021, DEC-022).
 *
 * The collapsed rail gets the most attention here. It is the state where a
 * regression is invisible to the eye — labels are gone, so a link that lost its
 * accessible name still *looks* right — and it is the state DEC-022 chose over
 * a drag handle, so it has to be worth having.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { NAV_DESTINATIONS } from "./navRegistry";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebarState";

function renderSidebar(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

const nav = () => screen.getByRole("navigation", { name: /main navigation/i });
const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) navigation/i });

afterEach(() => {
  localStorage.clear();
});

describe("Sidebar", () => {
  it("renders every enabled destination", () => {
    renderSidebar();

    for (const destination of NAV_DESTINATIONS.filter((d) => d.enabled)) {
      expect(within(nav()).getByRole("link", { name: destination.label })).toBeInTheDocument();
    }
  });

  it("renders no destination that is not built yet", () => {
    renderSidebar();

    for (const destination of NAV_DESTINATIONS.filter((d) => !d.enabled)) {
      expect(
        within(nav()).queryByRole("link", { name: destination.label }),
      ).not.toBeInTheDocument();
    }
  });

  it("groups today's screens under a Tools heading (DEC-021)", () => {
    renderSidebar();
    expect(within(nav()).getByText("Tools", { selector: "p" })).toBeInTheDocument();
  });

  it("marks the active destination with aria-current", () => {
    renderSidebar("/settings");

    expect(within(nav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav()).getByRole("link", { name: "Results" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  describe("collapsing (DEC-022)", () => {
    it("starts expanded and shows labels", () => {
      renderSidebar();

      expect(nav()).toHaveAttribute("data-collapsed", "false");
      expect(within(nav()).getByText("Settings", { selector: "span" })).toBeInTheDocument();
    });

    it("collapses to an icon rail, hiding the labels", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(toggle());

      expect(nav()).toHaveAttribute("data-collapsed", "true");
      expect(within(nav()).queryByText("Settings", { selector: "span" })).not.toBeInTheDocument();
    });

    it("keeps an accessible name on every rail item when labels are hidden", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(toggle());

      // The regression this guards: with the label element gone, a link whose
      // accessible name came from that text would announce as its glyph, or as
      // nothing. Nothing about the collapsed rail looks wrong when that breaks.
      for (const destination of NAV_DESTINATIONS.filter((d) => d.enabled)) {
        expect(within(nav()).getByRole("link", { name: destination.label })).toBeInTheDocument();
      }
    });

    it("still marks the active destination when collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar("/settings");

      await user.click(toggle());

      expect(within(nav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("reports its state through aria-expanded on the toggle", async () => {
      const user = userEvent.setup();
      renderSidebar();

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      await user.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });

    it("persists the collapsed state", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(toggle());

      expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("1");
    });

    it("restores the collapsed state on a fresh mount", () => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");

      renderSidebar();

      expect(nav()).toHaveAttribute("data-collapsed", "true");
    });

    it("expands again, and remembers that too", async () => {
      const user = userEvent.setup();
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
      renderSidebar();

      await user.click(toggle());

      expect(nav()).toHaveAttribute("data-collapsed", "false");
      expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("0");
    });

    it("ignores a malformed stored value", () => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "yes please");

      renderSidebar();

      expect(nav()).toHaveAttribute("data-collapsed", "false");
    });
  });
});
