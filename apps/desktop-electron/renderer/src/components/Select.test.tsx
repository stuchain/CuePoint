import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Select } from "./Select";
import rawCss from "./Select.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

const rules = parseRules(stripComments(rawCss));

describe("Select", () => {
  it("draws the chevron icon beside the control", () => {
    const { container } = render(<Select label="Sort" options={[{ value: "a", label: "A" }]} />);
    expect(screen.getByLabelText("Sort")).toHaveClass("cp-select__control");
    expect(container.querySelector('.cp-select__field svg[data-icon="chevron-down"]')).not.toBeNull();
  });

  it("hides the native arrow only inside the shared Select's field (T3)", () => {
    const hiding = rules.filter((r) => /appearance:\s*none/.test(r.body));
    expect(hiding.map((r) => r.selector)).toEqual([".cp-select__field > .cp-select__control"]);
  });

  it("keeps the bare class usable by a raw select: plain padding, no wide right gutter", () => {
    const bare = rules.find((r) => r.selector === ".cp-select__control")!.body;
    expect(bare).toMatch(/padding:\s*0 var\(--space-sm\)/);
    expect(bare).not.toMatch(/padding-right|appearance/);
  });

  it("draws the chevron at the small icon size", () => {
    expect(rawCss).toMatch(/\.cp-select__chevron \.cp-pixel-icon\s*\{[^}]*var\(--icon-size-sm\)/);
  });

  it("draws the chevron as the small icon, pointing at a pointer cursor (C244)", () => {
    const { container } = render(<Select label="Sort" options={[{ value: "a", label: "A" }]} />);
    expect(container.querySelector('.cp-select__chevron svg')).toHaveAttribute("data-size", "sm");
    expect(rules.find((r) => r.selector === ".cp-select__control")!.body).toMatch(/cursor:\s*pointer/);
  });

  it("draws an inlineLabel inside the box, before the value, as the select's name (C222)", () => {
    const { container } = render(
      <Select label="Scope" inlineLabel options={[{ value: "a", label: "Everything" }]} />,
    );
    expect(screen.getByLabelText("Scope")).toHaveClass("cp-select__control");
    const field = container.querySelector(".cp-select__field")!;
    const label = field.querySelector(".cp-select__inline-label")!;
    expect(label).toHaveTextContent("Scope");
    expect(label.compareDocumentPosition(field.querySelector("select")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The label is drawn once: not also above the box.
    expect(container.querySelectorAll("label")).toHaveLength(1);
    expect(container.firstElementChild).toHaveClass("cp-select--inline");
  });

  it("keeps the label above the box without inlineLabel", () => {
    const { container } = render(<Select label="Scope" options={[{ value: "a", label: "Everything" }]} />);
    expect(container.querySelector(".cp-select__inline-label")).toBeNull();
    expect(container.querySelector("label.cp-select__label")).not.toBeNull();
  });
});
