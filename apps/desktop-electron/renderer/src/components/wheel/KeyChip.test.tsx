import { afterEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { CAMELOT_CODES } from "./camelot";
import { resetKeyNotationForTests, saveKeyNotation } from "./keyNotationSetting";
import { KeyChip } from "./KeyChip";
import chipCssRaw from "./KeyChip.css?raw";
import wheelCssRaw from "./WheelButton.css?raw";

// A Windows checkout gives the stylesheet CRLF line endings.
const chipCss = chipCssRaw.replace(/\r\n/g, "\n");
const wheelCss = wheelCssRaw.replace(/\r\n/g, "\n");

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

describe("Keys written as (K1 to K3)", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.keyNotation;
    resetKeyNotationForTests();
  });

  it("writes the musical name in Musical, with the same colour class and hint", () => {
    saveKeyNotation("musical");
    render(<KeyChip value="8A" />);
    const chip = screen.getByText("Am");
    expect(chip).toHaveClass("key-chip", "key-chip--8A");
    expect(chip).toHaveAttribute("data-hint", "A minor");
    expect(screen.queryByText("8A")).toBeNull();
  });

  it("writes both, code first, in Both", () => {
    saveKeyNotation("both");
    render(<KeyChip value="Am" />);
    expect(screen.getByText("8A · Am")).toHaveClass("key-chip--8A");
  });

  it("follows a change at once, and leaves text that is not a key alone", () => {
    render(
      <>
        <KeyChip value="12B" />
        <KeyChip value="loud" />
      </>,
    );
    expect(screen.getByText("12B")).toBeInTheDocument();
    act(() => saveKeyNotation("musical"));
    expect(screen.getByText("E")).toHaveClass("key-chip--12B");
    expect(screen.getByText("loud")).toBeInTheDocument();
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

  it("M3: the tint is the one chip fill token over the ground, not a literal percentage", () => {
    const rule = /\.key-chip \{([^}]*)\}/.exec(chipCss)![1]!;
    expect(rule).toMatch(/background:\s*color-mix\(in srgb, var\(--key\) var\(--chip-fill-mix\), var\(--chip-ground, transparent\)\)/);
    expect(chipCss).not.toMatch(/var\(--key\) \d+%/);
    expect(wheelCss).not.toMatch(/var\(--key\) \d+%/);
  });

  it("M3: every chip is at least as wide as 12A, one weight and one face, so a Key column is not ragged", () => {
    const rule = /\.key-chip \{([^}]*)\}/.exec(chipCss)![1]!;
    expect(rule).toMatch(/min-inline-size:\s*calc\(3ch \+ 2 \* var\(--key-chip-pad\)\)/);
    expect(rule).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(rule).toMatch(/font-weight:\s*var\(--font-weight-semibold\)/);
  });

  it("M3/M335: a chip that is a button keeps the chip's size and fill; hover is a frame and open is a line, never a darker tint", () => {
    const button = /\.key-chip--button \{([^}]*)\}/.exec(wheelCss)![1]!;
    expect(button).not.toMatch(/font-size/);
    expect(button).not.toMatch(/background/);
    expect(wheelCss).toMatch(/\.key-chip--button:hover \{[^}]*box-shadow:\s*inset 0 0 0 var\(--hairline\) var\(--key\)/);
    expect(wheelCss).toMatch(/\.key-chip--button\[aria-expanded="true"\] \{[^}]*box-shadow/);
  });
});
