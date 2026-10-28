import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScreenHeader } from "./ScreenHeader";
import { publishDetails } from "./detailsToggle";
import rawCss from "./ScreenHeader.css?raw";
import rawAppCss from "../../App.css?raw";
import { stripComments } from "../../test/cssRules";

const css = stripComments(rawCss);
const appCss = stripComments(rawAppCss);

describe("ScreenHeader", () => {
  it("renders exactly one h1 holding the title", () => {
    render(<ScreenHeader title="Library" />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Library");
  });

  it("puts the slots in order: crumb, title and beside, summary, tabs", () => {
    const { container } = render(
      <ScreenHeader
        title="Prepare"
        crumb={<span>Sets</span>}
        beside={<span>Picker</span>}
        summary="12 tracks"
        actions={<button type="button">Export</button>}
        tabs={<span>Tabs here</span>}
        status={<span>Draft</span>}
      />,
    );
    const root = container.querySelector(".cp-screen-header")!;
    const order = [
      ".cp-screen-header__crumb",
      ".cp-screen-header__main",
      ".cp-screen-header__summary",
      ".cp-screen-header__tabs",
    ].map((selector) => root.querySelector(selector));
    order.forEach((node) => expect(node).not.toBeNull());
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const main = root.querySelector<HTMLElement>(".cp-screen-header__main")!;
    expect(within(main).getByText("Export")).toBeInTheDocument();
    const row = root.querySelector<HTMLElement>(".cp-screen-header__title-row")!;
    expect(within(row).getByText("Picker")).toBeInTheDocument();
    expect(within(row).getByText("Draft")).toBeInTheDocument();
  });

  it("marks itself scrolled only while its scroll region is scrolled (M215, M329)", () => {
    const { container } = render(
      <div data-testid="region" style={{ overflowY: "auto" }}>
        <ScreenHeader title="Statistics" />
      </div>,
    );
    const region = container.querySelector<HTMLElement>("[data-testid=region]")!;
    const header = container.querySelector(".cp-screen-header")!;
    expect(header).not.toHaveAttribute("data-scrolled");
    act(() => {
      region.scrollTop = 40;
      region.dispatchEvent(new Event("scroll"));
    });
    expect(header).toHaveAttribute("data-scrolled");
    act(() => {
      region.scrollTop = 0;
      region.dispatchEvent(new Event("scroll"));
    });
    expect(header).not.toHaveAttribute("data-scrolled");
  });

  it("reads the scroll of a sibling .screen-region under the header (Settings, Statistics; M215, M329)", () => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <ScreenHeader title="Settings" />
        <div className="screen-region" data-testid="region" style={{ overflowY: "auto" }} />
      </div>,
    );
    const region = container.querySelector<HTMLElement>("[data-testid=region]")!;
    const header = container.querySelector(".cp-screen-header")!;
    expect(header).not.toHaveAttribute("data-scrolled");
    act(() => {
      region.scrollTop = 40;
      region.dispatchEvent(new Event("scroll"));
    });
    expect(header).toHaveAttribute("data-scrolled");
    act(() => {
      region.scrollTop = 0;
      region.dispatchEvent(new Event("scroll"));
    });
    expect(header).not.toHaveAttribute("data-scrolled");
  });

  it("has one rule at rest and whole-pixel spacing (M81, M329)", () => {
    const rest = /\.cp-screen-header\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rest).not.toMatch(/box-shadow/);
    expect(rest).toMatch(/padding-bottom:\s*round\(nearest, var\(--space-md\), 1px\)/);
    expect(css).toMatch(/\.cp-screen-header\[data-scrolled\]\s*\{\s*box-shadow:\s*var\(--shadow-sticky\);?\s*\}/);
    const summary = /\.cp-screen-header__summary\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(summary).toMatch(/line-height:\s*round\(nearest,/);
  });

  it("keeps the page name in the h1 when display replaces it, visually hidden", () => {
    const { container } = render(<ScreenHeader title="Library" display="Friday set" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Library");
    expect(h1).toHaveClass("cp-screen-header__title--hidden");
    expect(container.querySelector(".cp-screen-header__display")).toHaveTextContent("Friday set");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each([false, "", null, undefined])("treats display=%j as absent", (display) => {
    const { container } = render(<ScreenHeader title="Keys" display={display} />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("cp-screen-header__title--hidden");
    expect(container.querySelector(".cp-screen-header__display")).toBeNull();
  });

  it("does not hide the h1 without display", () => {
    render(<ScreenHeader title="Keys" />);
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("cp-screen-header__title--hidden");
  });

  it("is sticky, with one divider under all and an xl title", () => {
    const root = /\.cp-screen-header\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(root).toMatch(/position:\s*sticky/);
    expect(root).toMatch(/border-bottom:\s*var\(--divider\)/);
    expect((css.match(/var\(--divider\)/g) ?? []).length).toBe(1);
    expect(css).toMatch(/\.cp-screen-header__title,[\s\S]*?font-size:\s*var\(--font-size-page\)/);
  });

  it("keeps its top margin when it sticks, like the Keys page did", () => {
    expect(/\.cp-screen-header\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/top:\s*var\(--screen-header-stick,\s*var\(--page-gutter-top\)\)/);
  });

  it("keeps the title at the same place whatever sits beside it: extras share the title row", () => {
    const { container } = render(<ScreenHeader title="Statistics" extras={<span>Scope picker</span>} />);
    const row = container.querySelector<HTMLElement>(".cp-screen-header__title-row")!;
    expect(within(row).getByText("Scope picker")).toBeInTheDocument();
    expect(css).toMatch(/\.cp-screen-header__main \{[^}]*align-items:\s*start/);
    expect(css).toMatch(/\.cp-screen-header__title-row \{[^}]*min-height:\s*var\(--toolbar-height\)/);
  });

  describe("the Details toggle", () => {
    afterEach(() => act(() => publishDetails(null)));

    it("is drawn only when the shell has published Track details", () => {
      render(<ScreenHeader title="Keys" />);
      expect(screen.queryByRole("button", { name: /track details/i })).toBeNull();
    });

    it("is the last button of the actions, after a divider", () => {
      act(() => publishDetails({ open: false, toggle: () => undefined }));
      const { container } = render(<ScreenHeader title="Library" actions={<button type="button">Export</button>} />);
      const actions = container.querySelector(".cp-screen-header__actions")!;
      const items = [...actions.children];
      expect(items[0]).toHaveTextContent("Export");
      expect(items[1]).toHaveClass("cp-details-divider");
      const last = within(actions as HTMLElement).getAllByRole("button").pop()!;
      expect(last).toHaveTextContent("Details");
      expect(last).toHaveAccessibleName("Track details");
    });

    it("sits alone on the title row, with no divider, on a page without actions", () => {
      act(() => publishDetails({ open: false, toggle: () => undefined }));
      const { container } = render(<ScreenHeader title="Discover" />);
      const actions = container.querySelector(".cp-screen-header__actions")!;
      expect(actions.querySelector(".cp-details-divider")).toBeNull();
      expect(within(actions as HTMLElement).getByRole("button", { name: "Track details" })).toBeInTheDocument();
    });

    it("is absent while the panel is open, and toggles it while hidden", async () => {
      // D16: the header's button shows only while the panel is hidden (moved from a pressed look).
      const toggle = vi.fn();
      act(() => publishDetails({ open: true, toggle }));
      const view = render(<ScreenHeader title="Library" />);
      expect(screen.queryByRole("button", { name: "Track details" })).toBeNull();
      act(() => publishDetails({ open: false, toggle }));
      view.rerender(<ScreenHeader title="Library" />);
      const button = screen.getByRole("button", { name: "Track details" });
      expect(button).not.toHaveAttribute("aria-expanded");
      await userEvent.click(button);
      expect(toggle).toHaveBeenCalledTimes(1);
      expect(css).not.toMatch(/details-toggle--open/);
    });

    it("keeps a fixed gap between the icon and the word", () => {
      expect(/\.cp-details-toggle\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/gap:\s*var\(--space-sm\)/);
    });

    it("draws the divider one control high in the line colour (C232)", () => {
      const divider = /\.cp-details-divider\s*\{([^}]*)\}/.exec(css)![1]!;
      expect(divider).toMatch(/height:\s*var\(--control-height\)/);
      expect(divider).toMatch(/width:\s*var\(--hairline\)/);
      expect(divider).toMatch(/background:\s*var\(--border-muted\)/);
    });

    it("sits after a pageActions slot as well as after actions (D7)", () => {
      act(() => publishDetails({ open: false, toggle: () => undefined }));
      const { container } = render(<ScreenHeader title="Clean" pageActions={<button type="button">Sync</button>} />);
      const actions = container.querySelector(".cp-screen-header__actions")!;
      expect([...actions.children][0]).toHaveTextContent("Sync");
      expect(actions.querySelector(".cp-details-divider")).not.toBeNull();
    });
  });

  describe("the facts line (C233)", () => {
    it("writes the count and its noun, then each fact, with a middle dot", () => {
      const { container } = render(<ScreenHeader title="Keys" facts={{ count: 1234, noun: "track", facts: ["3 playlists", "Rekordbox"] }} />);
      expect(container.querySelector(".cp-screen-header__summary")).toHaveTextContent("1,234 tracks · 3 playlists · Rekordbox");
    });

    it("says one in the singular and needs no facts", () => {
      const { container } = render(<ScreenHeader title="Keys" facts={{ count: 1, noun: "Set" }} />);
      expect(container.querySelector(".cp-screen-header__summary")).toHaveTextContent(/^1 Set$/);
    });
  });

  describe("the header's own geometry", () => {
    it("reserves the scrollbar's room on the page scroller, not on the header, so the Details button never shifts (C219)", () => {
      // `scrollbar-gutter` only does anything on the box that scrolls: `.app-main`.
      expect(/\.cp-screen-header\s*\{([^}]*)\}/.exec(css)![1]).not.toMatch(/scrollbar-gutter/);
      expect(/\.app-main\s*\{([^}]*)\}/.exec(appCss)![1]).toMatch(/scrollbar-gutter:\s*stable/);
    });

    it("leaves the content 12 below its divider (C30)", () => {
      expect(/\.cp-screen-header\s*\{([^}]*)\}/.exec(css)![1]).toMatch(/margin-bottom:\s*var\(--space-lg\)/);
    });
  });

  describe("a narrow page", () => {
    const rule = (selector: string) =>
      css.split("}").find((block) => block.trim().startsWith(selector))?.split("{")[1] ?? "";

    it("wraps the buttons under the title instead of squeezing the title", () => {
      expect(rule(".cp-screen-header__main")).toMatch(/display:\s*flex/);
      expect(rule(".cp-screen-header__main")).toMatch(/flex-wrap:\s*wrap/);
      expect(rule(".cp-screen-header__actions")).toMatch(/max-width:\s*100%/);
    });

    it("keeps the page name whole and lets a picker beside it shrink and cut with an ellipsis", () => {
      expect(css).toMatch(/\.cp-screen-header__title:where\(:not\(\.cp-visually-hidden\)\)\s*\{\s*flex:\s*none/);
      expect(rule(".cp-screen-header__beside {")).toMatch(/min-width:\s*0/);
      expect(rule(".cp-screen-header__beside .cp-select__control")).toMatch(/text-overflow:\s*ellipsis/);
      expect(css).toMatch(/\.cp-screen-header__beside \.cp-select\b[^{]*\{\s*min-width:\s*0/);
    });

    it("keeps an inline-label picker's box and sizes it to its words (M165)", () => {
      const field = rule(".cp-screen-header__beside .cp-select--inline .cp-select__field:not(");
      expect(field).toMatch(/border-color:\s*var\(--border-control\)/);
      expect(field).toMatch(/min-height:\s*var\(--control-height\)/);
      const control = rule(".cp-screen-header__beside .cp-select--inline .cp-select__control");
      expect(control).toMatch(/field-sizing:\s*content/);
      expect(control).toMatch(/width:\s*auto/);
    });
  });
});

// P47 (answer 1): page titles are 22 with a hair of tracking; the voice face and weight are unchanged.
describe("the page title type (P47)", () => {
  it("is --font-size-page with no added letter spacing (M25)", () => {
    expect(css).toMatch(/\.cp-screen-header__title,[\s\S]*?font-size:\s*var\(--font-size-page\)/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/letter-spacing/);
  });

  it("sits the title row on the baseline (M57)", () => {
    // The first baseline, so what is beside the title is placed by its first words (the e2e
    // libraryPage header check caught the last baseline following the First steps chip).
    expect(css).toMatch(/\.cp-screen-header__title-row \{[^}]*align-items:\s*baseline;/);
  });
});

describe("the side panels' head height (D9)", () => {
  it("publishes the header's height as --side-head-height and takes it back on leaving", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 48 });
    try {
      const { unmount } = render(<ScreenHeader title="Library" />);
      expect(document.documentElement.style.getPropertyValue("--side-head-height")).toMatch(/^\d+px$/);
      unmount();
      expect(document.documentElement.style.getPropertyValue("--side-head-height")).toBe("");
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    }
  });

  it("marks a data title so it shrinks and keeps its cut (M190)", () => {
    const { container } = render(<ScreenHeader title="Some playlist" dataTitle />);
    expect(container.querySelector(".cp-screen-header__title--data")).not.toBeNull();
  });
});
