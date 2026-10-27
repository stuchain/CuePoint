import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Disclosure } from "./Disclosure";
import css from "./Disclosure.css?raw";

describe("Disclosure (M60)", () => {
  it("starts folded, opens on click and names its body with aria-controls", () => {
    render(<Disclosure title="Details">The body.</Disclosure>);
    const head = screen.getByRole("button", { name: "Details" });
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("The body.")).not.toBeVisible();
    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The body.")).toBeVisible();
    expect(document.getElementById(head.getAttribute("aria-controls") as string)).toContainElement(
      screen.getByText("The body."),
    );
  });

  it("follows a controlled open state and reports the change", () => {
    const onOpenChange = vi.fn();
    render(
      <Disclosure title="Details" open onOpenChange={onOpenChange}>
        The body.
      </Disclosure>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByText("The body.")).toBeVisible();
  });

  it("wraps the head in a heading when given a level, and says its answer before the arrow", () => {
    render(
      <Disclosure title="Beatport" summary="Confirmed" level={3}>
        x
      </Disclosure>,
    );
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("BeatportConfirmed");
  });

  it("draws the title on the edge, the arrow at the row end and a control-height target", () => {
    expect(css).toMatch(/\.cp-fold__head\s*\{[^}]*padding:\s*0;/);
    expect(css).toMatch(/\.cp-fold__head\s*\{[^}]*min-height:\s*var\(--control-height\)/);
    expect(css).toMatch(/\.cp-fold__head\s*\{[^}]*font-family:\s*var\(--font-control\)/);
    expect(css).toMatch(/\.cp-fold__arrow\s*\{[^}]*margin-inline-start:\s*auto/);
  });
});
