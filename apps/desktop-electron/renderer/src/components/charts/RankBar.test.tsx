import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankBar } from "./RankBar";
import css from "./RankBar.css?raw";

describe("RankBar", () => {
  it("is as long as its share of the first row, clamped, and hidden from assistive technology", () => {
    const { container, rerender } = render(<RankBar share={0.25} />);
    const bar = container.querySelector(".cp-rank-bar") as HTMLElement;
    expect(bar.style.getPropertyValue("--share")).toBe("25.00%");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    rerender(<RankBar share={3} />);
    expect(bar.style.getPropertyValue("--share")).toBe("100.00%");
    rerender(<RankBar share={Number.NaN} />);
    expect(bar.style.getPropertyValue("--share")).toBe("0.00%");
    expect(bar).toHaveAttribute("data-empty", "true");
  });

  it("takes a meaningful colour as --bar-color and defaults to the chart token", () => {
    const { container } = render(<RankBar share={0.5} color="var(--key)" />);
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--bar-color")).toBe("var(--key)");
    expect(css).toMatch(/background:\s*var\(--bar-color,\s*var\(--chart-bar\)\)/);
  });
});
