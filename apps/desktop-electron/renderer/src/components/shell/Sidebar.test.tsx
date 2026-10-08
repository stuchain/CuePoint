/**
 * Sidebar behaviour (DEC-020, DEC-021, DEC-022).
 *
 * The collapsed rail gets the most attention here. It is the state where a
 * regression is invisible to the eye — labels are gone, so a link that lost its
 * accessible name still *looks* right — and it is the state DEC-022 chose over
 * a drag handle, so it has to be worth having.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
/** The destinations' names in order; the brand link is not one. */
const destinationNames = () =>
  within(nav())
    .getAllByRole("link")
    .map((link) => link.getAttribute("aria-label") ?? "")
    .filter((name) => name !== "CuePoint");
const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) sidebar/i });

afterEach(() => {
  localStorage.clear();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function libraryIs(empty: boolean) {
  const getLibrarySummary = vi.fn().mockResolvedValue({ library_empty: empty, source: empty ? null : {} });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };
  return getLibrarySummary;
}

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

  it("offers Discover in the workspace, after Clean (DISCOVER-10)", () => {
    renderSidebar("/discover");
    const discover = within(nav()).getByRole("link", { name: "Discover" });
    expect(discover).toHaveAttribute("href", "/discover");
    expect(discover).toHaveAttribute("aria-current", "page");
    const links = destinationNames();
    expect(links.indexOf("Clean")).toBeLessThan(links.indexOf("Discover"));
  });

  it("keeps Discover lit on its Artist, Label and Similar pages (DISCOVER-11)", () => {
    for (const path of [
      "/discover/artist/bp%3A301001",
      "/discover/label/name%3Acold%20room",
      "/discover/similar/12",
    ]) {
      const view = renderSidebar(path);
      expect(
        within(nav()).getByRole("link", { name: "Discover" }),
        path,
      ).toHaveAttribute("aria-current", "page");
      view.unmount();
    }
  });

  it("has no Tools group and no inCrate (DEC-100)", () => {
    renderSidebar();
    expect(within(nav()).queryByText("Tools")).not.toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "inCrate" })).not.toBeInTheDocument();
    const links = destinationNames();
    expect(links).toEqual(["Library", "Collections", "Keys", "Clean", "Discover", "Prepare", "Settings"]);
  });

  it("marks the active destination with aria-current", () => {
    renderSidebar("/settings");

    expect(within(nav()).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav()).getByRole("link", { name: "Library" })).not.toHaveAttribute(
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

  describe("hints, titles and the toggle (NAV-1, NAV-2)", () => {
    it("shows each destination's hint under its label when expanded", () => {
      renderSidebar();
      const library = within(nav()).getByRole("link", { name: "Library" });
      expect(within(library).getByText("Your Rekordbox tracks")).toBeInTheDocument();
      const settings = within(nav()).getByRole("link", { name: "Settings" });
      expect(within(settings).getByText("Look, sound, accounts")).toBeInTheDocument();
    });

    it("puts the hint in the title in both states", async () => {
      const user = userEvent.setup();
      renderSidebar();
      expect(within(nav()).getByRole("link", { name: "Discover" })).toHaveAttribute(
        "title",
        expect.stringContaining("Find new music"),
      );

      await user.click(toggle());

      const collapsed = within(nav()).getByRole("link", { name: "Discover" });
      expect(collapsed).toHaveAttribute("title", expect.stringContaining("Discover"));
      expect(collapsed).toHaveAttribute("title", expect.stringContaining("Find new music"));
      expect(within(collapsed).queryByText("Find new music")).not.toBeInTheDocument();
    });

    it("titles the toggle with its shortcut and draws a chevron, not a text glyph", async () => {
      const user = userEvent.setup();
      renderSidebar();
      expect(toggle()).toHaveAttribute("title", "Collapse sidebar (Ctrl+B)");
      expect(toggle().querySelector("svg[data-icon='chevron-left']")).not.toBeNull();
      expect(toggle().textContent).toBe("");

      await user.click(toggle());

      expect(toggle()).toHaveAttribute("title", "Expand sidebar (Ctrl+B)");
      expect(toggle().querySelector("svg[data-icon='chevron-right']")).not.toBeNull();
    });
  });

  describe("the brand (HDR-6)", () => {
    it("tops the sidebar with the logo and name, linking home", () => {
      renderSidebar("/settings");
      const brand = within(nav()).getByRole("link", { name: "CuePoint" });
      expect(brand).toHaveAttribute("href", "/library");
      expect(within(brand).getByText("CuePoint")).toBeInTheDocument();
      expect(brand.querySelector("svg[data-icon='logo']")).not.toBeNull();
      // A brand link is not a destination: Library alone is lit on /library.
      expect(brand).not.toHaveAttribute("aria-current");
    });

    it("keeps only the logo when collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      const brand = within(nav()).getByRole("link", { name: "CuePoint" });
      expect(within(brand).queryByText("CuePoint")).not.toBeInTheDocument();
      expect(brand.querySelector("svg[data-icon='logo']")).not.toBeNull();
    });
  });

  describe("Collections under Library, Settings at the bottom (NAV-3, NAV-6)", () => {
    it("marks Collections as a sub-entry of the Library", () => {
      renderSidebar();
      const collections = within(nav()).getByRole("link", { name: "Collections" });
      expect(collections).toHaveAttribute("data-sub", "true");
      expect(within(nav()).getByRole("link", { name: "Library" })).not.toHaveAttribute("data-sub");
      const order = within(nav()).getAllByRole("link").map((link) => link.getAttribute("aria-label") ?? "");
      expect(order.indexOf("Collections")).toBe(order.indexOf("Library") + 1);
    });

    it("pins Settings in a group of its own, below a divider", () => {
      renderSidebar();
      const groups = nav().querySelectorAll(".cp-sidebar__group");
      const last = groups[groups.length - 1]!;
      expect(last).toHaveClass("cp-sidebar__group--pinned");
      expect(within(last as HTMLElement).getAllByRole("link").map((l) => l.getAttribute("aria-label"))).toEqual([
        "Settings",
      ]);
    });
  });

  describe("Keys, a page of its own after the Collections (PAGES-16, DEC-200)", () => {
    it("comes after Library and its nested Collections, at the top level", () => {
      renderSidebar();
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(keys).toHaveAttribute("href", "/keys");
      // DEC-156 nests Collections because it is the Library's own tree; Keys is not.
      expect(keys).not.toHaveAttribute("data-sub");
      const order = destinationNames();
      expect(order.indexOf("Keys")).toBe(order.indexOf("Collections") + 1);
    });

    it("says what it is for, under its name and in its title", () => {
      renderSidebar();
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(within(keys).getByText("The keys in your playlists, Collections and Sets")).toBeInTheDocument();
      expect(keys).toHaveAttribute("title", "The keys in your playlists, Collections and Sets");
    });

    it("draws a pixel icon, and is lit on its page", () => {
      renderSidebar("/keys");
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(keys).toHaveAttribute("aria-current", "page");
      expect(keys.querySelector("svg")).not.toBeNull();
    });
  });

  describe("before the first import (NAV-5)", () => {
    const dimmed = ["Collections", "Keys", "Clean", "Discover", "Prepare"];

    it("dims Collections, Keys, Clean, Discover and Prepare, still clickable, with the reason", async () => {
      libraryIs(true);
      renderSidebar();

      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Clean" })).toHaveAttribute("data-dimmed", "true"),
      );
      for (const label of dimmed) {
        const link = within(nav()).getByRole("link", { name: label });
        expect(link).toHaveAttribute("data-dimmed", "true");
        expect(link).toHaveAttribute("href");
        expect(within(link).getByText("Import your Rekordbox collection first")).toBeInTheDocument();
        expect(link).toHaveAttribute("title", expect.stringContaining("Import your Rekordbox collection first"));
      }
      for (const label of ["Library", "Settings"]) {
        expect(within(nav()).getByRole("link", { name: label })).not.toHaveAttribute("data-dimmed");
      }
    });

    it("shows the reason in the title when collapsed", async () => {
      libraryIs(true);
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
      renderSidebar();
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Prepare" })).toHaveAttribute("data-dimmed", "true"),
      );
      expect(within(nav()).getByRole("link", { name: "Prepare" })).toHaveAttribute(
        "title",
        expect.stringContaining("Import your Rekordbox collection first"),
      );
    });

    it("dims nothing once the library has tracks", async () => {
      const read = libraryIs(false);
      renderSidebar();
      await waitFor(() => expect(read).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      for (const label of dimmed) {
        expect(within(nav()).getByRole("link", { name: label })).not.toHaveAttribute("data-dimmed");
      }
    });

    it("dims nothing when the library cannot be read at all", async () => {
      (window as unknown as { cuepoint?: unknown }).cuepoint = {
        getLibrarySummary: vi.fn().mockRejectedValue(new Error("starting")),
      };
      renderSidebar();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(within(nav()).getByRole("link", { name: "Clean" })).not.toHaveAttribute("data-dimmed");
    });

    it("reads the library again after a page change, so the first import lights the pages up", async () => {
      const read = libraryIs(true);
      const view = render(
        <MemoryRouter initialEntries={["/library"]}>
          <Sidebar />
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Clean" })).toHaveAttribute("data-dimmed", "true"),
      );
      read.mockResolvedValue({ library_empty: false, source: {} });
      const user = userEvent.setup();
      await user.click(within(nav()).getByRole("link", { name: "Settings" }));
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Clean" })).not.toHaveAttribute("data-dimmed"),
      );
      view.unmount();
    });
  });
});
