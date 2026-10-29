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
import * as navRegistry from "./navRegistry";
import { NAV_DESTINATIONS } from "./navRegistry";
import sidebarCss from "./Sidebar.css?raw";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
import { HINT_HOVER_DELAY_MS } from "../Hint";
import { SIDEBAR_COLLAPSED_STORAGE_KEY, neededHeightFor, railTight } from "./sidebarState";
import { expectNoAxeViolations } from "../../test/axe";

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
  vi.restoreAllMocks();
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

    it("shows no tip on an entry in the open rail, and keeps what it is for as its description (N3)", async () => {
      renderSidebar();
      const discover = within(nav()).getByRole("link", { name: "Discover" });
      discover.focus();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(discover).toHaveAttribute("aria-label", "Discover");
      expect(discover).toHaveAttribute("aria-description", "Find new music");
      discover.blur();

      vi.useFakeTimers();
      try {
        const settings = within(nav()).getByRole("link", { name: "Settings" });
        expect(settings).toHaveAttribute("aria-description", "Look, sound, accounts");
        fireEvent.pointerEnter(settings.parentElement!);
        act(() => {
          vi.advanceTimersByTime(HINT_HOVER_DELAY_MS + 10);
        });
        // A tip to the right would cover the Library pane's "All tracks" row (N3).
        expect(screen.queryByRole("tooltip")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("puts the collapsed tooltip beside the item, not over the one below it", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      await user.unhover(toggle());
      toggle().blur();
      await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
      const discover = within(nav()).getByRole("link", { name: "Discover" });
      discover.focus();
      const tip = await screen.findByRole("tooltip");
      expect(discover).toHaveAttribute("aria-describedby", tip.id);
      expect(discover).not.toHaveAttribute("aria-description");
      // Placed by its vertical middle at the item's right edge, never above or below it.
      expect(tip.style.top).not.toBe("");
      expect(tip.style.bottom).toBe("");
    });

    it("prefixes the label in the tooltip when collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      await user.unhover(toggle());
      toggle().blur();
      await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

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
      // The pointer rests on the button, where the app hint speaks and the native title is off.
      await user.unhover(toggle());

      expect(toggle()).toHaveAttribute("title", "Expand sidebar (Ctrl+B)");
      expect(toggle().querySelector("svg[data-icon='chevron-right']")).not.toBeNull();
    });
  });

  describe("the Search field (K8, option D)", () => {
    it("sits under the logo row and above the list, a field reading Search library with Ctrl+K muted", async () => {
      renderSidebar();
      const button = within(nav()).getByRole("button", { name: "Search library" });
      expect(button).toHaveClass("cp-sidebar__search--box");
      expect(button).toHaveAttribute("aria-haspopup", "dialog");
      expect(button).toHaveTextContent("Search library");
      expect(button).toHaveTextContent("Ctrl+K");
      expect(button.querySelector(".cp-sidebar__search-keys")).toHaveTextContent("Ctrl+K");
      expect(button.querySelector("svg[data-icon='search']")).not.toBeNull();
      button.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Search library Ctrl+K");
      const top = nav().querySelector(".cp-sidebar__top")!;
      const list = nav().querySelector(".cp-sidebar__list")!;
      expect(top.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(button.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(top).not.toContainElement(button);
      expect(list).not.toContainElement(button);
    });

    it("shows Cmd+K on a Mac, in the field and in the tip", async () => {
      vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
      renderSidebar();
      const button = within(nav()).getByRole("button", { name: "Search library" });
      expect(button).toHaveTextContent("⌘K");
      expect(button).not.toHaveTextContent("Ctrl+K");
      button.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Search library ⌘K");
    });

    it("is an icon alone in the collapsed rail, named Search library, tipped with the key", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      await user.unhover(toggle());
      toggle().blur();
      await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());

      const button = within(nav()).getByRole("button", { name: "Search library" });
      expect(button).not.toHaveTextContent("Search");
      expect(button).not.toHaveTextContent("Ctrl+K");
      expect(button).not.toHaveClass("cp-sidebar__search--box");
      expect(button.querySelector("svg[data-icon='search']")).not.toBeNull();
      button.focus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Search library Ctrl+K");
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

  describe("the page a sub-page was opened from stays current (C221)", () => {
    it("marks Library, and not Discover, on an Artist page opened from the Library", () => {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={[{ pathname: "/discover/artist/x", state: { from: "library" } }]}>
            <Sidebar />
          </MemoryRouter>
        </ToastProvider>,
      );
      expect(within(nav()).getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
      expect(within(nav()).getByRole("link", { name: "Discover" })).not.toHaveAttribute("aria-current");
    });

    it("keeps Discover current on an Artist page with no known origin", () => {
      renderSidebar("/discover/artist/x");
      expect(within(nav()).getByRole("link", { name: "Discover" })).toHaveAttribute("aria-current", "page");
    });
  });

  describe("no Pages label (C228)", () => {
    it("has no heading over the list, so toggling the rail moves no entry", async () => {
      const user = userEvent.setup();
      renderSidebar();
      expect(within(nav()).queryByText("Pages")).not.toBeInTheDocument();
      const top = () => within(nav()).getByRole("link", { name: "Library" }).getBoundingClientRect().top;
      const before = top();
      await user.click(toggle());
      expect(top()).toBe(before);
    });

    it("still names the list for a screen reader", () => {
      renderSidebar();
      const list = within(nav()).getByRole("group", { name: "Pages" });
      expect(list).toHaveClass("cp-sidebar__list");
      expect(list).not.toHaveAttribute("aria-labelledby");
    });
  });

  describe("Search is set apart from the pages (C229)", () => {
    it("has a divider between the Search field and the list of pages", () => {
      renderSidebar();
      const search = within(nav()).getByRole("button", { name: "Search library" });
      const divider = nav().querySelector<HTMLElement>(".cp-sidebar__divider")!;
      const list = nav().querySelector<HTMLElement>(".cp-sidebar__list")!;
      expect(divider).not.toBeNull();
      expect(divider).toHaveAttribute("aria-hidden", "true");
      expect(search.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(divider.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps the divider in the collapsed rail too", async () => {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
      renderSidebar();
      expect(nav().querySelector(".cp-sidebar__divider")).not.toBeNull();
    });

    it("gives Discover an icon of its own, not the magnifier Search wears", () => {
      renderSidebar();
      const discover = within(nav()).getByRole("link", { name: "Discover" }).querySelector("svg")!;
      const search = within(nav()).getByRole("button", { name: "Search library" }).querySelector("svg")!;
      expect(discover.getAttribute("data-icon")).not.toBe(search.getAttribute("data-icon"));
      expect(discover.innerHTML).not.toBe(search.innerHTML);
    });
  });

  describe("the fixed rows and the scrolling list (R2-9)", () => {
    it("holds the brand alone in the top row, with no toggle", () => {
      renderSidebar();
      const top = nav().querySelector<HTMLElement>(".cp-sidebar__top")!;
      expect(top).not.toBeNull();
      expect(within(top).getByRole("link", { name: "CuePoint" })).toBeInTheDocument();
      expect(within(top).queryByRole("button")).not.toBeInTheDocument();
      expect(top.querySelector(".cp-sidebar__list")).toBeNull();
    });

    it("puts the toggle in the bottom row beside Settings, expanded and collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar();
      const bottom = () => nav().querySelector<HTMLElement>(".cp-sidebar__group--pinned")!;
      expect(within(bottom()).getByRole("link", { name: "Settings" })).toBeInTheDocument();
      expect(within(bottom()).getByRole("button", { name: /Collapse sidebar/i })).toBe(toggle());
      expect(nav().querySelector(".cp-sidebar__top")).not.toContainElement(toggle());
      const settings = within(bottom()).getByRole("link", { name: "Settings" });
      expect(settings.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      await user.click(toggle());
      expect(within(bottom()).getByRole("link", { name: "Settings" })).toBeInTheDocument();
      expect(within(bottom()).getByRole("button", { name: /Expand sidebar/i })).toBe(toggle());
      expect(nav().querySelector(".cp-sidebar__top")).not.toContainElement(toggle());
    });

    it("tabs from Settings to the toggle", async () => {
      const user = userEvent.setup();
      renderSidebar();
      within(nav()).getByRole("link", { name: "Settings" }).focus();
      await user.tab();
      expect(toggle()).toHaveFocus();
    });

    it("keeps Settings and the toggle in one foot, the toggle on its own row under Settings; Activity is in the status strip (C228, M273)", () => {
      renderSidebar();
      const foot = nav().querySelector<HTMLElement>(".cp-sidebar__foot")!;
      expect(within(foot).getAllByRole("link").map((l) => l.getAttribute("aria-label"))).toEqual(["Settings"]);
      // Activity is not a page: its button is in the status strip (M273, D25). The toggle is the last button (C228).
      const buttons = within(foot).getAllByRole("button");
      expect(buttons.map((el) => el.getAttribute("aria-label"))).toEqual([toggle().getAttribute("aria-label")]);
      expect(buttons[buttons.length - 1]).toBe(toggle());
      expect(toggle().classList.contains("cp-sidebar__link")).toBe(true);
    });

    it("lines the toggle's icon up with the entries' icons, in both states", async () => {
      const user = userEvent.setup();
      renderSidebar();
      const iconBox = (element: Element) => element.querySelector(".cp-sidebar__icon")!;
      for (const open of [true, false]) {
        if (!open) await user.click(toggle());
        const settings = within(nav()).getByRole("link", { name: "Settings" });
        // The same box class, in a row of the same class: one icon column.
        expect(iconBox(toggle()).className).toBe(iconBox(settings).className);
        expect(toggle().className.includes("cp-sidebar__toggle")).toBe(true);
      }
    });

    it("keeps the toggle in a foot row of its own when there is no system group", () => {
      const real = navRegistry.groupedDestinations();
      const workspaceOnly = real.filter((entry) => entry.group !== "system");
      const spy = vi.spyOn(navRegistry, "groupedDestinations");
      spy.mockReturnValue(workspaceOnly);
      renderSidebar();
      const foot = nav().querySelector<HTMLElement>(".cp-sidebar__foot")!;
      expect(within(foot).getByRole("button", { name: /Collapse sidebar/i })).toBeInTheDocument();
      expect(within(foot).queryByRole("link")).not.toBeInTheDocument();
    });

    it("does not list the system group under Pages when it is the only group", () => {
      const only = navRegistry.groupedDestinations().filter((entry) => entry.group === "system");
      vi.spyOn(navRegistry, "groupedDestinations").mockReturnValue(only);
      renderSidebar();
      const list = nav().querySelector<HTMLElement>(".cp-sidebar__list")!;
      expect(within(list).queryByRole("link")).not.toBeInTheDocument();
      expect(within(nav().querySelector<HTMLElement>(".cp-sidebar__foot")!).getByRole("link", { name: "Settings" })).toBeInTheDocument();
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
      expect(brand.querySelector("img.cp-sidebar__logo-img")).not.toBeNull();
      expect(brand.querySelector("svg[data-icon='logo']")).toBeNull();
      // A brand link is not a destination: Library alone is lit on /library.
      expect(brand).not.toHaveAttribute("aria-current");
    });

    it("keeps only the logo when collapsed", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(toggle());
      const brand = within(nav()).getByRole("link", { name: "CuePoint" });
      expect(within(brand).queryByText("CuePoint")).not.toBeInTheDocument();
      expect(brand.querySelector("img.cp-sidebar__logo-img")).not.toBeNull();
      expect(brand.querySelector("svg[data-icon='logo']")).toBeNull();
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

    it("says what it is for in its description, not under its name (N3)", () => {
      renderSidebar();
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(within(keys).queryByText("The keys in your playlists, Collections and Sets")).not.toBeInTheDocument();
      expect(keys).toHaveAttribute("aria-description", "The keys in your playlists, Collections and Sets");
    });

    it("draws a pixel icon, and is lit on its page", () => {
      renderSidebar("/keys");
      const keys = within(nav()).getByRole("link", { name: "Keys" });
      expect(keys).toHaveAttribute("aria-current", "page");
      expect(keys.querySelector("svg")).not.toBeNull();
    });
  });

  describe("before the first import (C144)", () => {
    const pages = ["Library", "Keys", "Clean", "Discover", "Prepare", "Statistics", "Settings"];

    it("keeps every entry at its normal colour, with no shared line over them", async () => {
      const read = libraryIs(true);
      renderSidebar();
      await waitFor(() => expect(read).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 20));
      for (const label of pages) {
        const link = within(nav()).getByRole("link", { name: label });
        expect(link).not.toHaveAttribute("data-dimmed");
        expect(link).not.toHaveAttribute("aria-describedby");
        expect(link.className).not.toMatch(/dimmed/);
      }
      expect(nav().querySelector(".cp-sidebar__empty-line")).toBeNull();
    });

    it("describes an entry with its own hint (N3)", () => {
      libraryIs(true);
      renderSidebar();
      expect(within(nav()).getByRole("link", { name: "Prepare" }).getAttribute("aria-description")).toMatch(/Plan a Set/);
    });

    it("still reads the library in the background, so the first import is noticed", async () => {
      const read = libraryIs(true);
      renderSidebar();
      await waitFor(() => expect(read).toHaveBeenCalled());
    });
  });
});

describe("the sidebar's sizes follow the text, not the window (C208, C34)", () => {
  const rules = parseRules(stripComments(sidebarCss));
  const decl = (selector: string, property: string) => {
    const rule = rules.filter((r) => selectorList(r.selector).includes(selector) && r.context === "").pop();
    return rule ? Object.fromEntries(declarations(rule.body))[property] : undefined;
  };

  it("makes the brand, the search row and every page row one bar tall, so entry n sits at one y in both states (M486, M487)", () => {
    // Q5a (amending C208): bar-tall rows, so the 24 px icons do not nearly touch.
    expect(decl(".cp-sidebar__link", "min-height")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar__search", "min-height")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar__brand", "min-height")).toBe("var(--toolbar-height)");
  });

  it("makes the closed rail's entries bar-tall squares at every scale (M487)", () => {
    expect(decl(".cp-sidebar--collapsed .cp-sidebar__link", "width")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar--collapsed .cp-sidebar__brand", "width")).toBe("var(--toolbar-height)");
    expect(decl(".cp-sidebar--collapsed .cp-sidebar__search", "width")).toBeUndefined();
  });

  it("sets every pressable word at the control size, and the active entry no heavier (M26, M361)", () => {
    expect(decl(".cp-sidebar__link", "font-size")).toBe("var(--control-font-size)");
    expect(decl(".cp-sidebar__link--active", "font-weight")).toBeUndefined();
    // Moved for M487: the placeholder rule names both classes so it wins over .cp-sidebar__label.
    expect(decl(".cp-sidebar__label.cp-sidebar__search-placeholder", "font-family")).toBe("var(--font-data)");
  });

  it("keeps the key chip inside the Search box: the words shrink with an ellipsis (M487)", () => {
    const placeholder = ".cp-sidebar__label.cp-sidebar__search-placeholder";
    expect(decl(placeholder, "flex")).toBe("1 1 auto");
    expect(decl(placeholder, "min-width")).toBe("0");
    expect(decl(placeholder, "text-overflow")).toBe("ellipsis");
    expect(sidebarCss).toMatch(/@container sidebar-search \(max-width: 13em\)/);
    // No later rule at the same or higher weight puts the pixel face back on the placeholder.
    expect(decl(".cp-sidebar__search-placeholder", "font-family")).toBeUndefined();
  });

  it("draws the Clean count in the size-matched figures (M8)", () => {
    expect(decl(".cp-sidebar__count", "font-family")).toBe("var(--font-pixel-digits)");
    expect(decl(".cp-sidebar__count", "font-variant-numeric")).toBe("tabular-nums");
  });

  it("brightens the brand on hover, never colours it, and shows the arrow on entries (M336, M339)", () => {
    expect(decl(".cp-sidebar__brand:hover .cp-sidebar__brand-name", "color")).toBe("var(--fg-primary)");
    expect(decl(".cp-sidebar__link", "cursor")).toBe("default");
    expect(sidebarCss).not.toMatch(/cursor:\s*pointer/);
  });

  it("centres the closed rail's entries on whole pixels, counting its own divider (M81)", () => {
    expect(decl(".cp-sidebar--collapsed", "width")).toBe("calc(var(--icon-size) + var(--cp-sidebar-pad) * 4 + var(--hairline))");
  });

  it("keeps the xs step and bar-tall rows when tight (M70)", () => {
    expect(decl(".cp-sidebar[data-tight] .cp-sidebar__foot", "gap")).toBe("var(--space-xs)");
    expect(decl(".cp-sidebar[data-tight] .cp-sidebar__link", "min-height")).toBe("max(var(--icon-size), var(--toolbar-height))");
    expect(decl(".cp-sidebar[data-tight] .cp-sidebar__search", "min-height")).toBe("max(var(--icon-size), var(--toolbar-height))");
    expect(sidebarCss).not.toMatch(/gap:\s*0;/);
  });

  it("reads no window height anywhere", () => {
    expect(sidebarCss).not.toMatch(/cqh|vh\b|--cp-sidebar-fit/);
  });

  it("starts at the page's top gutter, as the page and Track details do", () => {
    expect(decl(".cp-sidebar", "padding-top")).toBe("var(--page-gutter-top)");
  });

  it("has no dimmed look and no empty-library line", () => {
    expect(sidebarCss).not.toMatch(/dimmed|empty-line/);
  });

  it("draws the toggle as a row, without a box of its own", () => {
    expect(decl(".cp-sidebar__toggle", "border")).toBeUndefined();
    expect(decl(".cp-sidebar__toggle", "background")).toBeUndefined();
  });
});

describe("a window too short for the rail (item 2, at 2x in 1264x735)", () => {
  it("tightens once the rail would scroll, and loosens only when its full height fits again", () => {
    expect(railTight(false, { overflow: 0, height: 600, needed: 0 })).toBe(false);
    expect(railTight(false, { overflow: 40, height: 600, needed: 0 })).toBe(true);
    expect(railTight(true, { overflow: 0, height: 620, needed: 640 })).toBe(true);
    expect(railTight(true, { overflow: 0, height: 640, needed: 640 })).toBe(false);
  });

  it("never tightens below 2x: at 1.5x the loose rail keeps its full-size targets and its list scrolls (M70)", () => {
    // 1264x735 at 1.5x: the rail used to tighten with 251 px free.
    expect(railTight(false, { overflow: 40, height: 600, needed: 0, scale: 1.5 })).toBe(false);
    expect(railTight(true, { overflow: 0, height: 100, needed: 640, scale: 1.5 })).toBe(false);
    expect(railTight(false, { overflow: 40, height: 600, needed: 0, scale: 2 })).toBe(true);
    expect(railTight(false, { overflow: 40, height: 600, needed: 0, scale: 3 })).toBe(true);
    // A pixel of rounding is not an overflow.
    expect(railTight(false, { overflow: 1, height: 600, needed: 0 })).toBe(false);
  });

  it("reads the text size from the rail and stays loose at 1.5x", () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-sidebar__list") ? 400 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-sidebar__list") ? 300 : 600;
    });
    const style = vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ getPropertyValue: (name: string) => (name === "--scale" ? "1.5" : "") }) as unknown as CSSStyleDeclaration,
    );
    renderSidebar();
    expect(nav()).not.toHaveAttribute("data-tight");
    style.mockRestore();
    scroll.mockRestore();
    client.mockRestore();
  });

  it("marks the rail tight when its list overflows", () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-sidebar__list") ? 400 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-sidebar__list") ? 300 : 600;
    });
    renderSidebar();
    expect(nav()).toHaveAttribute("data-tight");
    scroll.mockRestore();
    client.mockRestore();
  });

  it("is not tight when everything fits", () => {
    renderSidebar();
    expect(nav()).not.toHaveAttribute("data-tight");
  });

  it("takes the room from the gaps and the icons' padding; a row is never shorter than its icon", () => {
    const rules = parseRules(stripComments(sidebarCss));
    const tight = rules.filter((rule) => selectorList(rule.selector).some((sel) => sel.includes("[data-tight]")));
    expect(tight.length).toBeGreaterThan(0);
    // Moved for M70: a tight row follows the smaller icon but never drops below a bar's height.
    for (const rule of tight) {
      const height = new Map(declarations(rule.body)).get("min-height");
      if (height !== undefined) expect(height).toBe("max(var(--icon-size), var(--toolbar-height))");
    }
    const link = tight.find((rule) => selectorList(rule.selector).includes(".cp-sidebar[data-tight].cp-sidebar--collapsed .cp-sidebar__link"));
    expect(link && new Map(declarations(link.body)).get("padding-block")).toBe("0");
  });
});

describe("the tight rail at 3x (zoom spot 3A)", () => {
  const rules = parseRules(stripComments(sidebarCss));
  const get = (selector: string, prop: string) => {
    const rule = rules.find((r) => selectorList(r.selector).includes(selector) && new Map(declarations(r.body)).has(prop));
    return rule ? new Map(declarations(rule.body)).get(prop) : undefined;
  };

  it("draws its icons at the Medium size: the large icon, its scale capped at 1.5 (36px at 3x)", () => {
    expect(get(".cp-sidebar[data-tight]", "--icon-size")).toBe(
      "max(12px, round(down, calc(24px * min(var(--scale), 1.5)), 12px))",
    );
    expect(get(".cp-sidebar[data-tight] .cp-sidebar__icon .cp-pixel-icon", "width")).toBe("var(--icon-size)");
    expect(get(".cp-sidebar[data-tight] .cp-sidebar__icon .cp-pixel-icon", "height")).toBe("var(--icon-size)");
  });

  it("lets the link's height follow the icon, never below a bar (moved for M70)", () => {
    expect(get(".cp-sidebar[data-tight] .cp-sidebar__link", "min-height")).toBe("max(var(--icon-size), var(--toolbar-height))");
  });

  it("drops the logo row: it was a second link to the Library", () => {
    expect(get(".cp-sidebar[data-tight] .cp-sidebar__top", "display")).toBe("none");
  });

  it("re-measures the loose rail when it opens or closes while tight, rather than trust the other width's height", () => {
    // Tight as a closed rail that needed 640px; opened, that number says nothing about the open rail.
    const record = { mode: "closed", height: 640 };
    expect(neededHeightFor(record, "closed")).toBe(640);
    expect(neededHeightFor(record, "open")).toBe(0);
    expect(neededHeightFor(null, "closed")).toBe(0);
    // Unknown (0): the rail loosens, measures itself and tightens again in the same layout pass.
    expect(railTight(true, { overflow: 0, height: 600, needed: neededHeightFor(record, "open") })).toBe(false);
  });

  it("does not flicker: stays tight from the moment it fits tight until the loose rail fits", () => {
    // A window growing a pixel at a time from 600 to 640: tight throughout, loose at 640.
    let tight = railTight(false, { overflow: 40, height: 600, needed: 0 });
    const needed = 640;
    const seen: boolean[] = [];
    for (let height = 600; height <= 640; height += 1) {
      tight = railTight(tight, { overflow: 0, height, needed });
      seen.push(tight);
    }
    expect(seen.slice(0, -1).every(Boolean)).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });

  it("keeps the rail tight across a resize observer storm while its height does not change", async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      // Loose, the list runs 100px past its box; tight, it fits.
      const tightNow = this.closest(".cp-sidebar")?.hasAttribute("data-tight");
      return this.classList.contains("cp-sidebar__list") ? (tightNow ? 300 : 400) : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("cp-sidebar__list") ? 300 : 600;
    });
    const callbacks: (() => void)[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const changes: boolean[] = [];
      renderSidebar();
      const observer = new MutationObserver(() => changes.push(nav().hasAttribute("data-tight")));
      observer.observe(nav(), { attributes: true, attributeFilter: ["data-tight"] });
      expect(nav()).toHaveAttribute("data-tight");
      expect(callbacks.length).toBeGreaterThan(0);
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          for (const callback of callbacks) callback();
        });
      }
      expect(nav()).toHaveAttribute("data-tight");
      expect(changes).toEqual([]);
      observer.disconnect();
    } finally {
      globalThis.ResizeObserver = original;
      scroll.mockRestore();
      client.mockRestore();
    }
  });
});

describe("the Clean count (M507)", () => {
  it("says how many tracks wait, beside the name and in its label", async () => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getLibraryHealth: vi.fn().mockResolvedValue({
        counts: [
          { id: "needs_review", count: 40 },
          { id: "disputed", count: 2 },
        ],
        detections: [],
      }),
    };
    renderSidebar("/");
    const link = await within(nav()).findByRole("link", { name: "Clean, 42 to check" });
    expect(link.querySelector(".cp-sidebar__count")).toHaveTextContent("42");
  });

  it("says nothing when nothing waits", async () => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getLibraryHealth: vi.fn().mockResolvedValue({ counts: [], detections: [] }),
    };
    renderSidebar("/");
    expect(await within(nav()).findByRole("link", { name: "Clean" })).not.toHaveTextContent(/\d/);
  });
});

describe("Sidebar accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations, open or collapsed", async () => {
    renderSidebar();
    await expectNoAxeViolations();
    await userEvent.click(toggle());
    await expectNoAxeViolations();
  });
});
