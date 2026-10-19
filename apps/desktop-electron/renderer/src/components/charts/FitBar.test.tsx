import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FitBar } from "./FitBar";
import css from "./FitBar.css?raw";

const filled = (el: HTMLElement) => el.querySelectorAll(".cp-fit-bar__block--filled").length;

describe("FitBar", () => {
  it("draws five blocks and fills as many as the score has steps", () => {
    const { rerender } = render(<FitBar score={72} />);
    const bar = screen.getByRole("img", { name: "Fit 72 out of 100" });
    expect(bar.querySelectorAll(".cp-fit-bar__block")).toHaveLength(5);
    expect(filled(bar)).toBe(4);
    rerender(<FitBar score={0} />);
    expect(filled(screen.getByRole("img"))).toBe(0);
    rerender(<FitBar score={100} />);
    expect(filled(screen.getByRole("img"))).toBe(5);
    rerender(<FitBar score={50} />);
    expect(filled(screen.getByRole("img"))).toBe(3);
  });

  it("has the number as its title, unless it is given one", () => {
    const { rerender } = render(<FitBar score={72} />);
    expect(screen.getByRole("img")).toHaveAttribute("title", "72/100");
    rerender(<FitBar score={72} title="The mean of 70 and 74" />);
    expect(screen.getByRole("img")).toHaveAttribute("title", "The mean of 70 and 74");
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Fit 72 out of 100");
  });

  it("treats a score that is not a number as nothing", () => {
    render(<FitBar score={Number.NaN} />);
    const bar = screen.getByRole("img", { name: "Fit 0 out of 100" });
    expect(filled(bar)).toBe(0);
  });
});

describe("FitBar colour (C97)", () => {
  it("fills with the one bar colour, like every other bar", () => {
    expect(css).toMatch(/\.cp-fit-bar__block--filled\s*\{[^}]*background:\s*var\(--chart-bar\)/);
  });
});
