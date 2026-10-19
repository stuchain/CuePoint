import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import closeCss from "./CloseButton.css?raw";
import { CloseButton, RemoveButton } from "./CloseButton";

describe("CloseButton (C139, C200)", () => {
  it("is a small button named Close, with the name as its hover tip", () => {
    render(<CloseButton />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toHaveClass("cp-btn--sm");
    expect(button).toHaveAttribute("title", "Close");
  });

  it("takes its tip from the aria-label it is given", () => {
    render(<CloseButton aria-label="Clear selection" />);
    expect(screen.getByRole("button", { name: "Clear selection" })).toHaveAttribute("title", "Clear selection");
  });

  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(<CloseButton onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("RemoveButton", () => {
  it("takes an entry out, named Remove by default, and is not drawn as a close button", () => {
    const { container } = render(<RemoveButton />);
    expect(screen.getByRole("button", { name: "Remove" })).toHaveAttribute("title", "Remove");
    expect(container.querySelector(".cp-remove")).not.toBeNull();
  });

  it("draws the same boxed × as a close, not a trash can (C129)", () => {
    const remove = render(<RemoveButton />).container.querySelector("svg")?.innerHTML;
    const close = render(<CloseButton />).container.querySelector("svg")?.innerHTML;
    expect(remove).toBeTruthy();
    expect(remove).toBe(close);
  });

  it("keeps its whole box in a tight row: the tip wrapper does not shrink (C129)", () => {
    expect(closeCss).toMatch(/\.cp-hint:has\(> \.cp-close\) \{\s*flex: none;/);
  });
});
