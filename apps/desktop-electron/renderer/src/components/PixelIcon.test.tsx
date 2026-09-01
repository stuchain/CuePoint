import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PixelIcon } from "./PixelIcon";
import { PIXEL_GRID_SIZE, pixelRunsFor } from "./pixelIcons";

function renderIcon(ui: React.ReactElement) {
  const { container } = render(ui);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("no svg rendered");
  return svg;
}

describe("PixelIcon", () => {
  it("draws one rectangle per run of pixels", () => {
    const svg = renderIcon(<PixelIcon name="play" />);

    expect(svg.querySelectorAll("rect")).toHaveLength(pixelRunsFor("play").length);
  });

  it("maps the artwork onto the grid coordinate system", () => {
    const svg = renderIcon(<PixelIcon name="pause" />);

    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${PIXEL_GRID_SIZE} ${PIXEL_GRID_SIZE}`);
  });

  // Without this the pixels pick up antialiased edges and stop looking like
  // pixel art — the single attribute the whole visual identity rests on.
  it("disables edge antialiasing", () => {
    const svg = renderIcon(<PixelIcon name="home" />);

    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
  });

  // Themes disagree about --fg-primary, so the artwork must not carry a colour.
  it("inherits its colour from the surrounding text colour", () => {
    const svg = renderIcon(<PixelIcon name="filter" />);

    const fills = new Set(
      [...svg.querySelectorAll("rect")].map((rect) => rect.getAttribute("fill")),
    );
    expect([...fills]).toEqual(["currentColor"]);
  });

  it("is sized from a token so it tracks the scale setting", () => {
    const svg = renderIcon(<PixelIcon name="library" />);

    expect(svg.getAttribute("class")).toContain("cp-pixel-icon");
    expect(svg.getAttribute("width")).toBeNull();
  });

  it("is hidden from screen readers when it has no title", () => {
    const svg = renderIcon(<PixelIcon name="activity" />);

    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("is announced when given a title", () => {
    render(<PixelIcon name="next" title="Next track" />);

    expect(screen.getByRole("img", { name: "Next track" })).toBeInTheDocument();
  });

  it("keeps a caller's className alongside its own", () => {
    const svg = renderIcon(<PixelIcon name="previous" className="cp-custom" />);

    expect(svg.getAttribute("class")).toBe("cp-pixel-icon cp-custom");
  });

  it("renders different artwork for different names", () => {
    const play = renderIcon(<PixelIcon name="play" />).innerHTML;
    const pause = renderIcon(<PixelIcon name="pause" />).innerHTML;

    expect(play).not.toBe(pause);
  });
});
