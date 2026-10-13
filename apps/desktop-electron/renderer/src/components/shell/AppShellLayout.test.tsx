/**
 * Component tests for the shell frame.
 *
 * The property worth protecting here is that an absent region renders no
 * element at all. Later steps mount into these slots — SHELL-06's player region
 * is required by DEC-025 to occupy no space until Phase 5 — and an empty
 * wrapper carrying a class would quietly take up room that no test looking only
 * at "does it render" would catch.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import css from "./AppShellLayout.css?raw";
import { parseRules, stripComments, declarations } from "../../test/cssRules";

import shellCss from "./AppShellLayout.css?raw";
import { AppShellLayout } from "./AppShellLayout";

describe("AppShellLayout", () => {
  it("renders its children in the content region", () => {
    render(
      <AppShellLayout>
        <p>Routed page</p>
      </AppShellLayout>,
    );

    expect(screen.getByRole("main")).toHaveTextContent("Routed page");
  });

  it("keeps the app-main class the screen styles are written against", () => {
    render(
      <AppShellLayout>
        <p>Routed page</p>
      </AppShellLayout>,
    );

    expect(screen.getByRole("main")).toHaveClass("app-main");
  });

  it("renders every supplied region", () => {
    render(
      <AppShellLayout
        sidebar={<div data-testid="sidebar" />}
        inspector={<div data-testid="inspector" />}
        player={<div data-testid="player" />}
        statusBar={<div data-testid="status" />}
      >
        <p>Routed page</p>
      </AppShellLayout>,
    );

    for (const region of ["sidebar", "inspector", "player", "status"]) {
      expect(screen.getByTestId(region)).toBeInTheDocument();
    }
  });

  it.each([
    ["sidebar", ".app-shell__sidebar"],
    ["inspector", ".app-shell__inspector"],
    ["player", ".app-shell__player"],
    ["status", ".app-shell__status"],
  ])("renders no %s element when that region is empty", (_name, selector) => {
    const { container } = render(
      <AppShellLayout>
        <p>Routed page</p>
      </AppShellLayout>,
    );

    expect(container.querySelector(selector)).toBeNull();
  });

  it("declares no landmark of its own beyond main", () => {
    // The in-window menu bar (and its banner) is gone with the one native menu bar,
    // and the header band went with it (K8): `search` is the dialog's own form.
    const { container } = render(
      <AppShellLayout>
        <p>Routed page</p>
      </AppShellLayout>,
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("header")).toHaveLength(0);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("has no header band: no header region, row or area (K8)", () => {
    const { container } = render(
      <AppShellLayout sidebar={<div />}>
        <p>Routed page</p>
      </AppShellLayout>,
    );
    expect(container.querySelector(".app-shell__header")).toBeNull();
    expect(container.querySelector(".app-shell > :first-child")).toHaveClass("app-shell__sidebar");
    expect(shellCss).not.toMatch(/app-shell__header|"header /);
  });

  it("has no menu bar region any more", () => {
    const { container } = render(
      <AppShellLayout>
        <p>Routed page</p>
      </AppShellLayout>,
    );
    expect(container.querySelector(".app-shell__menubar")).toBeNull();
  });

  it("places the content region between the sidebar and the inspector", () => {
    // Grid areas do the real placement, but DOM order decides tab order, and
    // SHELL-10's keyboard pass expects sidebar -> content -> inspector.
    const { container } = render(
      <AppShellLayout
        sidebar={<div data-testid="sidebar" />}
        inspector={<div data-testid="inspector" />}
      >
        <p>Routed page</p>
      </AppShellLayout>,
    );

    const shell = container.querySelector(".app-shell");
    const order = Array.from(shell?.children ?? []).map((child) => child.className);

    expect(order).toEqual([
      "app-shell__sidebar",
      "app-shell__content app-main",
      "app-shell__inspector",
    ]);
  });

  describe("banner and offline", () => {
    it("renders the banner between the header and the page, and nothing when absent", () => {
      const { container, rerender } = render(
        <AppShellLayout>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      expect(container.querySelector(".app-shell__banner")).toBeNull();

      rerender(
        <AppShellLayout banner={<div data-testid="banner" />}>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      expect(screen.getByTestId("banner").parentElement).toHaveClass("app-shell__banner");
      expect(screen.getByRole("main")).not.toContainElement(screen.getByTestId("banner"));
    });

    it("marks the page offline only when told", () => {
      const { rerender } = render(
        <AppShellLayout>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      expect(screen.getByRole("main")).not.toHaveAttribute("data-offline");

      rerender(
        <AppShellLayout offline>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      expect(screen.getByRole("main")).toHaveAttribute("data-offline", "");
    });

    function offlineShell(onBlockedClick = vi.fn(), onPageClick = vi.fn()) {
      render(
        <AppShellLayout
          offline
          onBlockedClick={onBlockedClick}
          banner={<button onClick={onPageClick}>Banner button</button>}
          sidebar={<button onClick={onPageClick}>Sidebar button</button>}
          statusBar={<button onClick={onPageClick}>Strip button</button>}
        >
          <button onClick={onPageClick}>Page button</button>
          <div role="menuitem" onClick={onPageClick}>Page item</div>
          <a href="#x" onClick={onPageClick}>Page link</a>
          <input type="checkbox" aria-label="Page box" onClick={onPageClick} />
          <button onClick={onPageClick}><span>Inner label</span></button>
          <p onClick={onPageClick}>Page text</p>
        </AppShellLayout>,
      );
      return { onBlockedClick, onPageClick };
    }

    it("stops a click on a page control and says so", () => {
      const { onBlockedClick, onPageClick } = offlineShell();

      fireEvent.click(screen.getByRole("button", { name: "Page button" }));
      fireEvent.click(screen.getByRole("menuitem"));
      fireEvent.click(screen.getByRole("link", { name: "Page link" }));
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByText("Inner label"));

      expect(onPageClick).not.toHaveBeenCalled();
      expect(onBlockedClick).toHaveBeenCalledTimes(5);
    });

    it("leaves reading and selecting alone", () => {
      const { onBlockedClick, onPageClick } = offlineShell();

      fireEvent.click(screen.getByText("Page text"));

      expect(onPageClick).toHaveBeenCalledTimes(1);
      expect(onBlockedClick).not.toHaveBeenCalled();
    });

    it("does not touch the banner, sidebar or status strip", () => {
      const { onBlockedClick, onPageClick } = offlineShell();

      fireEvent.click(screen.getByRole("button", { name: "Banner button" }));
      fireEvent.click(screen.getByRole("button", { name: "Sidebar button" }));
      fireEvent.click(screen.getByRole("button", { name: "Strip button" }));

      expect(onPageClick).toHaveBeenCalledTimes(3);
      expect(onBlockedClick).not.toHaveBeenCalled();
    });

    it("does not stop clicks while online", () => {
      const onPageClick = vi.fn();
      render(
        <AppShellLayout>
          <button onClick={onPageClick}>Page button</button>
        </AppShellLayout>,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(onPageClick).toHaveBeenCalledTimes(1);
    });

    it("leaves dialogs inside the page usable", () => {
      const onPageClick = vi.fn();
      const onBlockedClick = vi.fn();
      render(
        <AppShellLayout offline onBlockedClick={onBlockedClick}>
          <div role="dialog" aria-label="Edit">
            <button onClick={onPageClick}>Cancel</button>
          </div>
          <div role="alertdialog" aria-label="Sure?">
            <button onClick={onPageClick}>Close</button>
          </div>
        </AppShellLayout>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onPageClick).toHaveBeenCalledTimes(2);
      expect(onBlockedClick).not.toHaveBeenCalled();
    });

    it("dims with a veil beside the page, not with opacity on it", () => {
      const { container, rerender } = render(
        <AppShellLayout>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      expect(container.querySelector(".app-shell__veil")).toBeNull();

      rerender(
        <AppShellLayout offline>
          <p>Routed page</p>
        </AppShellLayout>,
      );
      const veil = container.querySelector(".app-shell__veil")!;
      expect(veil).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("main")).not.toContainElement(veil as HTMLElement);

      // Opacity (or a filter) on the page would make it a stacking context of its own and trap
      // its dialogs below the banner. The veil is a sibling that does not scroll with it.
      const rules = parseRules(stripComments(css));
      const content = rules.filter((rule) => /\.app-shell__content/.test(rule.selector));
      for (const rule of content) {
        const names = declarations(rule.body).map(([name]) => name);
        expect(names).not.toContain("opacity");
        expect(names).not.toContain("filter");
        expect(names).not.toContain("z-index");
      }
      const veilRule = rules.find((rule) => rule.selector.trim() === ".app-shell__veil")!;
      const decls = Object.fromEntries(declarations(veilRule.body));
      expect(decls["pointer-events"]).toBe("none");
      expect(decls["background"]).toContain("color-mix");
    });
  });
});

describe("the bottom inset the toast stack sits above", () => {
  type Callback = (entries: { target: Element; contentRect: { height: number } }[]) => void;
  const original = globalThis.ResizeObserver;
  let observers: { callback: Callback; targets: Element[]; disconnected: boolean }[] = [];

  function install() {
    observers = [];
    globalThis.ResizeObserver = class {
      record: (typeof observers)[number];
      constructor(callback: Callback) {
        this.record = { callback, targets: [], disconnected: false };
        observers.push(this.record);
      }
      observe(target: Element) {
        this.record.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.record.disconnected = true;
      }
    } as unknown as typeof ResizeObserver;
  }

  /** Sizes the wrappers report: jsdom has no layout, so offsetHeight is stubbed per element. */
  function size(element: Element, height: number) {
    Object.defineProperty(element, "offsetHeight", { configurable: true, value: height });
  }
  function fire() {
    for (const o of observers) o.callback(o.targets.map((target) => ({ target, contentRect: { height: 0 } })));
  }
  const inset = () => document.documentElement.style.getPropertyValue("--shell-bottom-inset");

  afterEach(() => {
    globalThis.ResizeObserver = original;
    document.documentElement.style.removeProperty("--shell-bottom-inset");
  });

  it("is the player and the status strip together, and is cleared on unmount", () => {
    install();
    const { container, unmount } = render(
      <AppShellLayout player={<div />} statusBar={<div />}>
        <p>Page</p>
      </AppShellLayout>,
    );
    size(container.querySelector(".app-shell__player")!, 64);
    size(container.querySelector(".app-shell__status")!, 24);
    act(fire);
    expect(inset()).toBe("88px");
    size(container.querySelector(".app-shell__player")!, 100);
    act(fire);
    expect(inset()).toBe("124px");
    unmount();
    expect(inset()).toBe("");
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });

  it("is zero with no player or status strip", () => {
    install();
    render(
      <AppShellLayout>
        <p>Page</p>
      </AppShellLayout>,
    );
    act(fire);
    expect(inset()).toBe("0px");
  });

  it("does not fail where there is no ResizeObserver", () => {
    // @ts-expect-error simulating an environment without it
    delete globalThis.ResizeObserver;
    expect(() =>
      render(
        <AppShellLayout player={<div />}>
          <p>Page</p>
        </AppShellLayout>,
      ),
    ).not.toThrow();
  });
});
