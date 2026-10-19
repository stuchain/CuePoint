import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShowMore } from "./ShowMore";

describe("ShowMore (C18)", () => {
  it("reads Show all N while the list is cut short, and runs onToggle", async () => {
    const onToggle = vi.fn();
    render(<ShowMore total={24} expanded={false} onToggle={onToggle} locale="en-US" />);
    const button = screen.getByRole("button", { name: "Show all 24" });
    expect(button).toHaveClass("cp-btn--quiet");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reads Show less once it is open", () => {
    render(<ShowMore total={24} expanded onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Show less" });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("groups a large total", () => {
    render(<ShowMore total={1234} expanded={false} onToggle={() => {}} locale="en-US" />);
    expect(screen.getByRole("button", { name: "Show all 1,234" })).toBeInTheDocument();
  });
});
