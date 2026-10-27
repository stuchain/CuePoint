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

  it("opens to Less about this and closes again", () => {
    render(<MoreAbout>The detail.</MoreAbout>);
    fireEvent.click(screen.getByRole("button", { name: "More about this" }));
    expect(screen.getByRole("button", { name: "Less about this" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The detail.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Less about this" }));
    expect(screen.getByText("The detail.")).not.toBeVisible();
  });

  it("is described by the line it belongs to", () => {
    render(
      <>
        <p id="line">One line.</p>
        <MoreAbout describedBy="line">The detail.</MoreAbout>
      </>,
    );
    expect(screen.getByRole("button", { name: "More about this" })).toHaveAccessibleDescription(
      "One line.",
    );
  });

  it("takes a custom label and does not remember being open", () => {
    const { unmount } = render(<MoreAbout label="Why?">The detail.</MoreAbout>);
    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    unmount();
    render(<MoreAbout label="Why?">The detail.</MoreAbout>);
    expect(screen.getByRole("button", { name: "Why?" })).toHaveAttribute("aria-expanded", "false");
  });

  it("can start open, for a link that must land inside it", () => {
    render(<MoreAbout defaultOpen>The detail.</MoreAbout>);
    expect(screen.getByRole("button", { name: "Less about this" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The detail.")).toBeVisible();
  });
});

describe("MoreAbout look (C50, M60)", () => {
  it("is the shared Disclosure: title on the content edge (no head padding), arrow at the row end", async () => {
    const css = (await import("./Disclosure.css?raw")).default as string;
    expect(css).toMatch(/\.cp-fold__head\s*\{[^}]*padding:\s*0;/);
    expect(css).toMatch(/\.cp-fold__arrow\s*\{[^}]*margin-inline-start:\s*auto/);
  });
});
