import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Notice } from "./Notice";
import css from "./Notice.css?raw";

describe("Notice kinds (C88)", () => {
  it("draws info, warning and danger", () => {
    render(
      <>
        <Notice kind="info">Info words</Notice>
        <Notice kind="warning">Warning words</Notice>
        <Notice kind="danger">Danger words</Notice>
      </>,
    );
    expect(screen.getByText("Info words").closest(".cp-notice")).toHaveClass("cp-notice--info");
    expect(screen.getByText("Warning words").closest(".cp-notice")).toHaveClass("cp-notice--warning");
    expect(screen.getByText("Danger words").closest(".cp-notice")).toHaveClass("cp-notice--danger");
  });

  it("is danger when no kind is given, and treats the old name `problem` as danger", () => {
    render(
      <>
        <Notice>One</Notice>
        <Notice kind="problem">Two</Notice>
      </>,
    );
    expect(screen.getByText("One").closest(".cp-notice")).toHaveClass("cp-notice--danger");
    expect(screen.getByText("Two").closest(".cp-notice")).toHaveClass("cp-notice--danger");
  });

  it("announces danger at once and the others as a status", () => {
    render(
      <>
        <Notice kind="danger">D</Notice>
        <Notice kind="info">I</Notice>
        <Notice kind="warning">W</Notice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("D");
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("shows an action in its slot", () => {
    render(<Notice action={<button type="button">Try again</button>}>Could not read</Notice>);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers a small close button when onDismiss is given, and calls it", async () => {
    const onDismiss = vi.fn();
    render(<Notice onDismiss={onDismiss}>Something</Notice>);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("cp-btn--sm");
    await userEvent.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no close button without onDismiss", () => {
    render(<Notice>Something</Notice>);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("draws a field error as one line with no box and no close button", () => {
    render(
      <Notice kind="field-error" onDismiss={() => {}} action={<button type="button">x</button>}>
        Name is taken
      </Notice>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Notice styles", () => {
  it("has a tinted fill, a 3px bar, primary text and the --sm/--md padding", () => {
    expect(css).toMatch(/color-mix\(in srgb, var\(--notice-tone\)/);
    expect(css).toMatch(/border-left:[^;]*solid var\(--notice-tone\)/);
    // P6: the bar is the --notice-bar-width token (3px scaled, rounded) and the box has no frame.
    expect(css).toMatch(/border-left:\s*var\(--notice-bar-width\) solid/);
    expect(css).toMatch(/border:\s*0;/);
    // M68, D10: md above and below, lg at the sides, one height with or without an action.
    expect(css).toMatch(/padding:\s*var\(--space-md\) var\(--space-lg\)/);
    expect(css).toMatch(/min-height:\s*var\(--notice-height\)/);
    // M18: the sentence is body size, like the rows around it.
    expect(css).toMatch(/\.cp-notice\s*\{[^}]*font-size:\s*var\(--text-body\)/);
    expect(css).toMatch(/color:\s*var\(--fg-primary\)/);
  });

  it("colours info from --accent-info, warning and danger from their status colours", () => {
    expect(css).toMatch(/--notice-info[\s\S]*--accent-info|cp-notice--info[^}]*--accent-info/);
    expect(css).toMatch(/cp-notice--warning[^}]*--accent-warning/);
    expect(css).toMatch(/--notice-tone:\s*var\(--accent-danger\)/);
  });

  it("has no solid amber banner", () => {
    expect(css).not.toMatch(/background:\s*var\(--accent-warning\)\s*;/);
  });
});
