/**
 * Component tests for the shell frame.
 *
 * The property worth protecting here is that an absent region renders no
 * element at all. Later steps mount into these slots — SHELL-06's player region
 * is required by DEC-025 to occupy no space until Phase 5 — and an empty
 * wrapper carrying a class would quietly take up room that no test looking only
 * at "does it render" would catch.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

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
        menuBar={<div data-testid="menubar" />}
        header={<div data-testid="header" />}
        sidebar={<div data-testid="sidebar" />}
        inspector={<div data-testid="inspector" />}
        player={<div data-testid="player" />}
        statusBar={<div data-testid="status" />}
      >
        <p>Routed page</p>
      </AppShellLayout>,
    );

    for (const region of ["menubar", "header", "sidebar", "inspector", "player", "status"]) {
      expect(screen.getByTestId(region)).toBeInTheDocument();
    }
  });

  it.each([
    ["menubar", ".app-shell__menubar"],
    ["header", ".app-shell__header"],
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
    // AppMenuBar already claims role="banner"; a second one here would be a
    // duplicate landmark. The rest arrive with the content later steps supply.
    const { container } = render(
      <AppShellLayout menuBar={<header>Menu</header>}>
        <p>Routed page</p>
      </AppShellLayout>,
    );

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("header")).toHaveLength(1);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
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
});
