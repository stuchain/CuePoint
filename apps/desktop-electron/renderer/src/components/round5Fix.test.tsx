/**
 * The round-5 review fixes that live in shared parts: the header's measured height is a pixel
 * number, the Details toggle has one name, a context menu's groups and disabled entries are said,
 * a tab's count reads after a comma, and the stylesheets hold the sizes the density depends on.
 */
import { act, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import buttonCss from "./Button.css?raw";
import playerBarCss from "./player/PlayerBar.css?raw";
import screenHeaderCss from "./shell/ScreenHeader.css?raw";
import filterBarCss from "../screens/library/FilterBar.css?raw";
import prepareCss from "../screens/prepare/prepare.css?raw";
import discoverCss from "../screens/discover/discover.css?raw";
import { declarations, parseRules, stripComments } from "../test/cssRules";
import { ScreenHeader, headerHeightPx } from "./shell/ScreenHeader";
import { DETAILS_PANEL_ID, focusDetailsToggle, publishDetails } from "./shell/detailsToggle";
import { Tabs } from "./Tabs";
import { TrackContextMenu } from "./TrackContextMenu";
import { useSectionInView } from "../screens/useSectionInView";

afterEach(() => act(() => publishDetails(null)));

/** The last value a rule for `selector` in `context` sets for `prop`. */
function decl(css: string, selector: string, prop: string, context = ""): string | undefined {
  const rules = parseRules(stripComments(css)).filter(
    (rule) => rule.selector.split(",").map((s) => s.trim()).includes(selector) && rule.context === context,
  );
  for (const rule of rules.reverse()) {
    for (const [name, value] of declarations(rule.body)) if (name === prop) return value;
  }
  return undefined;
}

describe("B2: the header height is a pixel number", () => {
  it("adds the gap above the header to its height, and reads a missing gap as none", () => {
    expect(headerHeightPx(64, 12)).toBe(76);
    expect(headerHeightPx(64.4, Number.NaN)).toBe(64);
  });

  it("writes --screen-header-height as plain px that parseFloat can read", () => {
    const host = document.createElement("div");
    host.className = "screen";
    document.body.append(host);
    const view = render(<ScreenHeader title="Settings" />, { container: host });
    const value = host.style.getPropertyValue("--screen-header-height");
    expect(value).toMatch(/^\d+px$/);
    expect(Number.isFinite(Number.parseFloat(value))).toBe(true);
    view.unmount();
    host.remove();
  });
});

describe("B2: the section tracker reads the header height", () => {
  it("uses the written height as the top of the band it watches", () => {
    const seen: string[] = [];
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(_: unknown, options?: IntersectionObserverInit) {
        seen.push(options?.rootMargin ?? "");
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    try {
      function Probe() {
        useSectionInView(["one"]);
        return null;
      }
      render(
        <div className="app-main">
          <div className="screen" style={{ ["--screen-header-height" as string]: "76px" }}>
            <section id="one" />
            <Probe />
          </div>
        </div>,
      );
      expect(seen[0]).toBe("-76px 0px -66% 0px");
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});

describe("B4: the Details toggle", () => {
  it("has one name, Track details, with aria-pressed and aria-controls while open", () => {
    act(() => publishDetails({ open: false, toggle: () => undefined }));
    const view = render(<ScreenHeader title="Library" />);
    const closed = screen.getByRole("button", { name: "Track details" });
    expect(closed).toHaveAttribute("aria-pressed", "false");
    expect(closed).not.toHaveAttribute("aria-controls");

    // While the panel shows, the header has no toggle at all: the panel's own × hides it (D16, moved
    // from a pressed toggle naming the panel).
    act(() => publishDetails({ open: true, toggle: () => undefined }));
    view.rerender(<ScreenHeader title="Library" />);
    expect(screen.queryByRole("button", { name: "Track details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show track details" })).toBeNull();
    expect(document.querySelector(`[aria-controls="${DETAILS_PANEL_ID}"]`)).toBeNull();
  });

  it("focuses the visible toggle, skipping a hidden kept page", () => {
    act(() => publishDetails({ open: false, toggle: () => undefined }));
    const { container } = render(
      <>
        <div hidden data-testid="kept">
          <ScreenHeader title="Clean" />
        </div>
        <div data-testid="shown">
          <ScreenHeader title="Library" />
        </div>
      </>,
    );
    focusDetailsToggle();
    const shown = within(screen.getByTestId("shown")).getByRole("button", { name: "Track details" });
    expect(document.activeElement).toBe(shown);
    expect(container).toBeTruthy();
  });
});

describe("B6: the context menu says its groups and why an entry is off", () => {
  it("wraps a titled group in role=group named by its title", () => {
    render(
      <TrackContextMenu
        x={0}
        y={0}
        onClose={() => undefined}
        items={[
          { id: "a", label: "Play", onSelect: vi.fn() },
          { id: "b", label: "Rate", groupTitle: "Organise", separatorBefore: true, onSelect: vi.fn() },
          { id: "c", label: "Tag", onSelect: vi.fn() },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Organise" });
    expect(within(group).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rate", "Tag"]);
    expect(within(group).getByText("Organise")).toHaveClass("cp-track-menu__heading");
  });

  it("marks a disabled entry aria-disabled, describes it by its reason, and does not run it", () => {
    const onSelect = vi.fn();
    render(
      <TrackContextMenu
        x={0}
        y={0}
        onClose={() => undefined}
        items={[{ id: "r", label: "Show in folder", disabled: true, reason: "The file is missing", onSelect }]}
      />,
    );
    const item = screen.getByRole("menuitem", { name: "Show in folder" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toBeDisabled();
    expect(item).toHaveAccessibleDescription("The file is missing");
    item.click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("B7: a tab count follows its name after a comma", () => {
  it("reads Missing files, 3", () => {
    render(<Tabs tabs={[{ id: "m", label: "Missing files", detail: 3 }]} activeId="m" onChange={() => undefined} />);
    expect(screen.getByRole("tab")).toHaveAccessibleName("Missing files, 3");
  });
});

describe("A2: the menu chevron", () => {
  // M29 (D3): was a local 12px-grid size; the chevron is now the small icon, no third size.
  it("is the small icon size", () => {
    expect(decl(buttonCss, ".cp-btn__menu .cp-pixel-icon", "width")).toBe("var(--icon-size-sm)");
    expect(decl(buttonCss, ".cp-btn__menu .cp-pixel-icon", "height")).toBe("var(--icon-size-sm)");
  });
});

describe("A4: the search field", () => {
  it("is the one flexible item, so the filters share its line", () => {
    const rule = ".cp-filter-bar__row > .cp-search-field";
    expect(decl(filterBarCss, rule, "max-width")).toBe("var(--search-width)");
  });

  it("gives way to its floor before the row wraps, then grows back to the shared width (zoom spot 2A)", () => {
    // The row breaks its line by each item's flex basis: a basis of the floor means the search
    // shrinks first, so Select all stays on line 1 at 1.5x, and at 1.25x with Track details open.
    const rule = ".cp-filter-bar__row > .cp-search-field";
    expect(decl(filterBarCss, rule, "flex")).toBe("1 1 var(--filter-search-floor)");
    expect(decl(filterBarCss, ".cp-filter-bar", "--filter-search-floor")).toMatch(
      /^min\(calc\(\d+px \* var\(--scale\)\), var\(--search-width\)\)$/,
    );
  });
});

describe("A5: the player bar controls", () => {
  it("makes the five secondary buttons the right cluster's square with large icons (M315, moved from the control size)", () => {
    expect(decl(playerBarCss, ".cp-player-bar__button--standard", "min-height")).toBe("var(--player-cluster)");
    expect(decl(playerBarCss, ".cp-player-bar__button--standard .cp-pixel-icon", "width")).toBe(
      "var(--icon-size-lg)",
    );
  });

  it("keeps the queue count beside its icon, not over it", () => {
    expect(decl(playerBarCss, ".cp-player-bar__count", "position")).toBe("static");
  });

  it("goes compact only in a short window (C207), with the transport kept at its size and no zoom toggle", () => {
    const flag = ":root[data-short-window] ";
    // M304, M76: the transport is --player-transport everywhere; the short window does not shrink it.
    expect(decl(playerBarCss, ".cp-player-bar__button", "min-height")).toBe("var(--player-transport)");
    expect(decl(playerBarCss, `${flag}.cp-player-bar__button--play`, "min-height")).toBeUndefined();
    expect(decl(playerBarCss, `${flag}.cp-player-bar__button--zoom`, "display")).toBe("none");
    expect(decl(playerBarCss, `${flag}.cp-player-slot .cp-detail-strip`, "display")).toBe("none");
    expect(playerBarCss).not.toMatch(/max-height:\s*\d+px/);
  });
});

describe("A6: titles line up on every page", () => {
  it("lets a page set where the header sticks; pages whose scroller is the page stick at 0", () => {
    expect(decl(screenHeaderCss, ".cp-screen-header", "top")).toBe(
      "var(--screen-header-stick, var(--page-gutter-top))",
    );
    expect(decl(prepareCss, ".prepare-screen", "--screen-header-stick")).toBe("0px");
    expect(decl(discoverCss, ".discover-screen", "--screen-header-stick")).toBe("0px");
  });

  it("puts the Similar page's header where the Artist and Label pages put theirs (new F)", () => {
    // The Similar page is its own scroller: a header sticking a gutter below its padding sat 15px low.
    expect(decl(discoverCss, ".discover-page--similar", "--screen-header-stick")).toBe("0px");
    // Its backdrop still covers the gutter above it, so rows scrolling up are not seen there.
    expect(decl(discoverCss, ".discover-page--similar > .cp-screen-header::before", "top")).toBe(
      "calc(-1 * var(--page-gutter-top))",
    );
  });

  it("keeps 8 between the Similar tracks heading and its table, and 16 above the heading (new F)", () => {
    expect(decl(discoverCss, ".discover-page--similar > .discover-section__head", "margin-bottom")).toBe("var(--space-md)");
    expect(decl(discoverCss, ".discover-page--similar > .discover-section__head", "padding-top")).toBe("var(--space-xl)");
  });
});
