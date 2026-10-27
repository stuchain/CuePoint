import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Art } from "./Art";
import css from "./Art.css?raw";
import { stripComments } from "../test/cssRules";

describe("Art (M385)", () => {
  it("is not drawn until its picture loads, then carries data-loaded", () => {
    const { container } = render(<Art src="cuepoint-artwork://a" alt="Artwork" className="x" />);
    const image = container.querySelector("img")!;
    expect(image).toHaveClass("cp-art", "x");
    expect(image).toHaveAttribute("alt", "Artwork");
    expect(image).not.toHaveAttribute("data-loaded");
    fireEvent.load(image);
    expect(image).toHaveAttribute("data-loaded");
  });

  it("starts over when its picture changes", () => {
    const { container, rerender } = render(<Art src="cuepoint-artwork://a" />);
    const image = container.querySelector("img")!;
    fireEvent.load(image);
    rerender(<Art src="cuepoint-artwork://b" />);
    expect(image).not.toHaveAttribute("data-loaded");
    fireEvent.load(image);
    expect(image).toHaveAttribute("data-loaded");
  });

  it("hides the unloaded picture and fades the loaded one in with motion on", () => {
    const flat = stripComments(css);
    expect(flat).toMatch(/\.cp-art:not\(\[data-loaded\]\)\s*\{\s*visibility:\s*hidden;/);
    expect(flat).toMatch(/:root\[data-motion-entrance\] \.cp-art\[data-loaded\]\s*\{\s*animation:\s*cp-fade-in/);
  });
});
