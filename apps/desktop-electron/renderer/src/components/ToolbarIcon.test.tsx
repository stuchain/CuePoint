import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolbarIcon } from "./ToolbarIcon";

describe("ToolbarIcon", () => {
  it("is reachable by its label", () => {
    render(<ToolbarIcon label="Settings" icon="settings" />);

    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders pixel artwork when given an icon name", () => {
    const { container } = render(<ToolbarIcon label="Filter" icon="filter" />);

    expect(container.querySelector('svg[data-icon="filter"]')).not.toBeNull();
  });

  // DEC-010 keeps Unicode glyphs for secondary actions; that path has to keep
  // working, or converting one icon at a time is impossible.
  it("still renders a Unicode glyph when given one", () => {
    const { container } = render(<ToolbarIcon label="Help" glyph="?" />);

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector(".cp-toolbar-icon__glyph")?.textContent).toBe("?");
  });

  it("does not announce the icon separately from the button", () => {
    render(<ToolbarIcon label="Export" icon="export" />);

    // One accessible name, from the button — not the button plus the artwork.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<ToolbarIcon label="Export" icon="export" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<ToolbarIcon label="Export" icon="export" onClick={onClick} disabled />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("marks the active icon", () => {
    render(<ToolbarIcon label="Filter" icon="filter" active />);

    expect(screen.getByRole("button", { name: "Filter" }).className).toContain(
      "cp-toolbar-icon--active",
    );
  });

  it("is not active by default", () => {
    render(<ToolbarIcon label="Filter" icon="filter" />);

    expect(screen.getByRole("button", { name: "Filter" }).className).not.toContain(
      "--active",
    );
  });

  // Inside a <form> a button without an explicit type submits it.
  it("does not submit a surrounding form", () => {
    render(<ToolbarIcon label="Filter" icon="filter" />);

    expect(screen.getByRole("button", { name: "Filter" })).toHaveAttribute(
      "type",
      "button",
    );
  });
});
