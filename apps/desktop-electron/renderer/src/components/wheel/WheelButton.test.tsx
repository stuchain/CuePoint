import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WheelButton } from "./WheelButton";

describe("WheelButton", () => {
  it("is named Camelot wheel and shows the word Wheel", () => {
    render(<WheelButton />);
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    expect(button).toHaveTextContent("Wheel");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("draws a ring of twelve segments in the key colours", () => {
    render(<WheelButton />);
    const paths = screen.getByRole("button", { name: "Camelot wheel" }).querySelectorAll("svg path");
    expect(paths).toHaveLength(12);
    paths.forEach((path, index) => {
      expect((path as SVGPathElement).style.stroke).toBe(`var(--key-${index + 1}A)`);
    });
  });

  it("reports whether the wheel is open", async () => {
    render(<WheelButton />);
    const button = screen.getByRole("button", { name: "Camelot wheel" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
