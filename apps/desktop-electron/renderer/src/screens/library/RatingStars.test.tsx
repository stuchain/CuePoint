import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { RatingStars } from "./RatingStars";

describe("RatingStars (C104)", () => {
  it("fills the earned stars and outlines the rest, five in all", () => {
    render(<RatingStars count={3} />);
    const stars = screen.getByRole("img", { name: "3 stars" });
    const icons = [...stars.querySelectorAll("svg")].map((icon) => icon.getAttribute("data-icon"));
    expect(icons).toEqual(["star", "star", "star", "star-outline", "star-outline"]);
  });

  it("says one star in the singular and a blank rating as unrated", () => {
    const { rerender } = render(<RatingStars count={1} />);
    expect(screen.getByRole("img", { name: "1 star" })).toBeInTheDocument();
    rerender(<RatingStars count={0} />);
    expect(screen.getByRole("img", { name: "unrated" })).toBeInTheDocument();
  });

  it("draws no typed star glyphs", () => {
    const { container } = render(<RatingStars count={4} />);
    expect(container.textContent).toBe("");
  });

  it("can draw only the earned stars", () => {
    render(<RatingStars count={2} of={0} />);
    expect(screen.getByRole("img", { name: "2 stars" }).querySelectorAll("svg")).toHaveLength(2);
  });
});
