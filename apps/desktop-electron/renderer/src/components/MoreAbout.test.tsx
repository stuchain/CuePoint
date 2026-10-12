import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoreAbout } from "./MoreAbout";

describe("MoreAbout", () => {
  it("starts collapsed with the detail hidden", () => {
    render(<MoreAbout>The detail.</MoreAbout>);
    const button = screen.getByRole("button", { name: "More about this" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("The detail.")).not.toBeVisible();
  });

  it("points aria-controls at the region", () => {
    render(<MoreAbout>The detail.</MoreAbout>);
    const button = screen.getByRole("button", { name: "More about this" });
    const id = button.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)).toContainElement(screen.getByText("The detail."));
  });

  it("opens to Less and closes again", () => {
    render(<MoreAbout>The detail.</MoreAbout>);
    fireEvent.click(screen.getByRole("button", { name: "More about this" }));
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The detail.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Less" }));
    expect(screen.getByText("The detail.")).not.toBeVisible();
  });

  it("takes a custom label and does not remember being open", () => {
    const { unmount } = render(<MoreAbout label="Why?">The detail.</MoreAbout>);
    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    unmount();
    render(<MoreAbout label="Why?">The detail.</MoreAbout>);
    expect(screen.getByRole("button", { name: "Why?" })).toHaveAttribute("aria-expanded", "false");
  });
});
