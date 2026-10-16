import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CAMELOT_CODES } from "./camelot";
import { KeyChip } from "./KeyChip";
import chipCssRaw from "./KeyChip.css?raw";

// A Windows checkout gives the stylesheet CRLF line endings.
const chipCss = chipCssRaw.replace(/\r\n/g, "\n");

describe("a key chip", () => {
  it("writes the Camelot code and names the key in its app hint (data-hint)", () => {
    render(<KeyChip value="8A" />);
    const chip = screen.getByText("8A");
    expect(chip).toHaveAttribute("data-hint", "A minor");
    expect(chip).toHaveClass("key-chip", "key-chip--8A", "cp-data");
  });

  it("has a class for each key", () => {
    render(<KeyChip value="12B" />);
    expect(screen.getByText("12B")).toHaveClass("key-chip--12B");
  });

  it("writes the classic spelling as the code", () => {
    render(<KeyChip value="Am" />);
    expect(screen.getByText("8A")).toHaveClass("key-chip--8A");
    expect(screen.queryByText("Am")).toBeNull();
  });

  it("draws text that is not a key as plain text, with no chip", () => {
    render(<KeyChip value="loud" />);
    const plain = screen.getByText("loud");
    expect(plain).not.toHaveClass("key-chip");
    expect(plain).not.toHaveAttribute("data-hint");
  });

  it("draws no key as a dash (DEC-201)", () => {
    const { rerender } = render(<KeyChip value={null} />);
    expect(screen.getByText("—")).not.toHaveClass("key-chip");
    rerender(<KeyChip value="  " />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("carries no inline style, so a table of them stays cheap", () => {
    render(<KeyChip value="3B" />);
    expect(screen.getByText("3B")).not.toHaveAttribute("style");
  });
});

describe("the chip stylesheet", () => {
  it("sets --key for each of the 24 keys", () => {
    for (const code of CAMELOT_CODES) {
      expect(chipCss).toContain(`.key-chip--${code} {\n  --key: var(--key-${code});`);
    }
  });

  it("turns chips into plain text when Colour keys is off", () => {
    expect(chipCss).toMatch(/:root\[data-key-colours="off"\] \.key-chip \{[^}]*color: inherit;[^}]*background: none;[^}]*padding: 0;/);
  });
});
