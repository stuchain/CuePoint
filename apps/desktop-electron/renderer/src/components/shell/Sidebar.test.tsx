/**
 * Sidebar behaviour (DEC-020, DEC-021, DEC-022).
 *
 * The collapsed rail gets the most attention here. It is the state where a
 * regression is invisible to the eye — labels are gone, so a link that lost its
 * accessible name still *looks* right — and it is the state DEC-022 chose over
 * a drag handle, so it has to be worth having.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../Toast";
import { Sidebar } from "./Sidebar";
import { EMPTY_LIBRARY_LINE, NAV_DESTINATIONS } from "./navRegistry";
import { HINT_HOVER_DELAY_MS } from "../Hint";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebarState";

function renderSidebar(initialPath = "/") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </ToastProvider>,
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
    expect(links).toEqual(["Library", "Clean", "Keys", "Discover", "Prepare", "Statistics", "Settings"]);
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

  describe("one line per entry, hints in the tooltip (NAV-1, K7)", () => {
    it("shows only the label in an entry, never a second line", () => {
      renderSidebar();
      const library = within(nav()).getByRole("link", { name: "Library" });
      expect(within(library).getByText("Library")).toBeInTheDocument();
      expect(within(library).queryByText("Your Rekordbox tracks")).not.toBeInTheDocument();
      expect(nav().querySelector(".cp-sidebar__hint")).toBeNull();
      expect(within(nav()).queryByText("Look, sound, accounts")).not.toBeInTheDocument();
    });

    it("shows the hint in a tooltip on keyboard focus, and on hover after a rest", async () => {
      const user = userEvent.setup();
      renderSidebar();
      const discover = within(nav()).getByRole("link", { name: "Discover" });
      await user.tab();
      await user.tab();
      discover.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Find new music");
      expect(discover).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
      expect(discover).toHaveAttribute("aria-label", "Discover");
      discover.blur();
      await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

      vi.useFakeTimers();
      try {
        const settings = within(nav()).getByRole("link", { name: "Settings" });
        fireEvent.pointerEnter(settings.parentElement!);
        act(() => {
          vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
        });
        expect(screen.getByRole("tooltip")).toHaveTextContent("Look, sound, accounts");
      } finally {
        vi.useRealTimers();
      }
    });

    it("prefixes the label in the tooltip when collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());

      const collapsed = within(nav()).getByRole("link", { name: "Discover" });
      expect(within(collapsed).queryByText("Find new music")).not.toBeInTheDocument();
      collapsed.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Discover: Find new music");
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

  describe("the Search button (K8)", () => {
    it("sits between the top row and the list, reading Search with its shortcut", () => {
      renderSidebar();
      const button = within(nav()).getByRole("button", { name: /^Search/ });
      expect(button).toHaveTextContent("Search");
      expect(button).toHaveTextContent("Ctrl+K");
      const top = nav().querySelector(".cp-sidebar__top")!;
      const list = nav().querySelector(".cp-sidebar__list")!;
      expect(top.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(button.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(top).not.toContainElement(button);
      expect(list).not.toContainElement(button);
    });

    it("is an icon alone in the collapsed rail, named Search library, tipped with the key", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());

      const button = within(nav()).getByRole("button", { name: "Search library" });
      expect(button).not.toHaveTextContent("Search");
      expect(button.querySelector("svg[data-icon='search']")).not.toBeNull();
      button.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Search (Ctrl+K)");
    });

    it("asks the shell to open the search dialog, which App mounts", async () => {
      const user = userEvent.setup();
      const heard = vi.fn();
      window.addEventListener("cuepoint:shell-command", heard);
      renderSidebar();
      await user.click(within(nav()).getByRole("button", { name: /^Search/ }));
      window.removeEventListener("cuepoint:shell-command", heard);
      expect((heard.mock.calls[0]![0] as CustomEvent).detail).toBe("open-search");
    });
  });

  describe("the fixed top row and the scrolling list (R2-9)", () => {
    it("holds the brand and the toggle in one top row", () => {
      renderSidebar();
      const top = nav().querySelector<HTMLElement>(".cp-sidebar__top")!;
      expect(top).not.toBeNull();
      expect(within(top).getByRole("link", { name: "CuePoint" })).toBeInTheDocument();
      expect(within(top).getByRole("button", { name: /Collapse sidebar/i })).toBeInTheDocument();
      expect(top.querySelector(".cp-sidebar__list")).toBeNull();
    });

    it("keeps the top row outside the list when collapsed too", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      const top = nav().querySelector<HTMLElement>(".cp-sidebar__top")!;
      expect(within(top).getByRole("link", { name: "CuePoint" })).toBeInTheDocument();
      expect(within(top).getByRole("button", { name: /Expand sidebar/i })).toBeInTheDocument();
    });

    it("scrolls the destinations alone and keeps Settings outside the scroll", () => {
      renderSidebar();
      const list = nav().querySelector<HTMLElement>(".cp-sidebar__list")!;
      expect(list).not.toBeNull();
      for (const name of ["Library", "Clean", "Keys", "Discover", "Prepare", "Statistics"]) {
        expect(within(list).getByRole("link", { name })).toBeInTheDocument();
      }
      expect(within(list).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
      expect(within(nav()).getByRole("link", { name: "Settings" })).toBeInTheDocument();
      expect(list.closest(".cp-sidebar__top")).toBeNull();
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

  describe("Settings at the bottom (NAV-6)", () => {
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

  describe("Keys, a page of its own after Clean (PAGES-16, DEC-200, C26)", () => {
    it("comes after Clean, at the top level", () => {
      renderSidebar();
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(keys).toHaveAttribute("href", "/keys");
      const order = destinationNames();
      expect(order.indexOf("Keys")).toBe(order.indexOf("Clean") + 1);
    });

    it("says what it is for in its tooltip, not under its name", async () => {
      renderSidebar();
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(within(keys).queryByText("The keys in your playlists, Collections and Sets")).not.toBeInTheDocument();
      keys.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("The keys in your playlists, Collections and Sets");
    });

    it("draws a pixel icon, and is lit on its page", () => {
      renderSidebar("/keys");
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(keys).toHaveAttribute("aria-current", "page");
      expect(keys.querySelector("svg")).not.toBeNull();
    });
  });

  describe("before the first import (NAV-5)", () => {
    const dimmed = ["Keys", "Clean", "Discover", "Prepare", "Statistics"];

    it("dims the pages with nothing to show, still clickable, under one shared line", async () => {
      libraryIs(true);
      renderSidebar();

      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Clean" })).toHaveAttribute("data-dimmed", "true"),
      );
      for (const label of dimmed) {
        const link = within(nav()).getByRole("link", { name: label });
        expect(link).toHaveAttribute("data-dimmed", "true");
        expect(link).toHaveAttribute("href");
        expect(within(link).queryByText(/Import your/)).not.toBeInTheDocument();
      }
      for (const label of ["Library", "Settings"]) {
        expect(within(nav()).getByRole("link", { name: label })).not.toHaveAttribute("data-dimmed");
      }
      // One line for the lot, above the dimmed entries and below Library.
      const line = within(nav()).getAllByText(EMPTY_LIBRARY_LINE);
      expect(line).toHaveLength(1);
      expect(line[0]!.compareDocumentPosition(within(nav()).getByRole("link", { name: "Clean" }))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(line[0]!.compareDocumentPosition(within(nav()).getByRole("link", { name: "Library" }))).toBe(
        Node.DOCUMENT_POSITION_PRECEDING,
      );
    });

    it("points each dimmed entry at the shared line, merged with the tooltip's description", async () => {
      libraryIs(true);
      renderSidebar();
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Prepare" })).toHaveAttribute("data-dimmed", "true"),
      );
      const line = within(nav()).getByText(EMPTY_LIBRARY_LINE);
      for (const label of dimmed) {
        expect(within(nav()).getByRole("link", { name: label })).toHaveAttribute("aria-describedby", line.id);
      }
      expect(within(nav()).getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-describedby");
      const prepare = within(nav()).getByRole("link", { name: "Prepare" });
      prepare.focus();
      const tip = await screen.findByRole("tooltip");
      expect(prepare.getAttribute("aria-describedby")!.split(" ")).toEqual([line.id, tip.id]);
    });

    it("tooltips a dimmed entry with its own hint", async () => {
      libraryIs(true);
      renderSidebar();
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Prepare" })).toHaveAttribute("data-dimmed", "true"),
      );
      within(nav()).getByRole("link", { name: "Prepare" }).focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Plan a set");
    });

    it("drops the shared line when collapsed", async () => {
      libraryIs(true);
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
      renderSidebar();
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name: "Prepare" })).toHaveAttribute("data-dimmed", "true"),
      );
      expect(within(nav()).queryByText(EMPTY_LIBRARY_LINE)).not.toBeInTheDocument();
    });

    it("dims nothing once the library has tracks", async () => {
      const read = libraryIs(false);
      renderSidebar();
      await waitFor(() => expect(read).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      for (const label of dimmed) {
        expect(within(nav()).getByRole("link", { name: label })).not.toHaveAttribute("data-dimmed");
      }
      expect(within(nav()).queryByText(EMPTY_LIBRARY_LINE)).not.toBeInTheDocument();
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
