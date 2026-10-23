/**
 * Component-level tests for Button.
 *
 * This is the first rendering test in the renderer: until now the suite covered
 * only pure utility modules, so no component's behaviour was verified anywhere
 * — `.test.tsx` files were not even collected. It doubles as the template for
 * testing the components the Library and Player phases will add.
 *
 * These assert behaviour a user would notice (a disabled button not firing its
 * handler, a loading button hiding its label) rather than markup details, so
 * they survive restyling.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "./Button";
import css from "./Button.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Import Library</Button>);
    expect(
      screen.getByRole("button", { name: "Import Library" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Run
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("is disabled while loading, so a job cannot be started twice", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Match
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label while loading, with a spinner before it and aria-busy (C13)", () => {
    render(<Button loading>Match</Button>);
    const button = screen.getByRole("button", { name: /Match/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Match");
    expect(button.textContent).not.toBe("…");
    const spinner = button.querySelector(".cp-spinner");
    expect(spinner).not.toBeNull();
    expect(spinner!.compareDocumentPosition(button.querySelector(".cp-btn__label")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is not busy when it is not loading", () => {
    render(<Button>Match</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("puts an icon after its words with iconEnd", () => {
    render(<Button iconEnd="chevron-right">Next</Button>);
    const button = screen.getByRole("button", { name: "Next" });
    const label = button.querySelector(".cp-btn__label")!;
    const icon = button.querySelector('svg[data-icon="chevron-right"]')!;
    expect(label.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("defaults to type=button so it cannot submit a form", () => {
    render(<Button>Safe</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("is the grey secondary button unless a variant is named (C5)", () => {
    render(<Button>Plain</Button>);
    expect(screen.getByRole("button")).toHaveClass("cp-btn--secondary");
    expect(screen.getByRole("button")).not.toHaveClass("cp-btn--primary");
  });

  it("applies the variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("cp-btn--danger");
  });

  it("renders an icon alongside the label", () => {
    render(<Button icon={<span data-testid="icon">*</span>}>Play</Button>);

    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("keeps caller-supplied class names", () => {
    render(<Button className="extra">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("extra");
  });

  it("draws a disabled button by colour, with no opacity (T6)", () => {
    const rules = parseRules(stripComments(css)).filter((r) => /:disabled|aria-disabled/.test(r.selector));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.body).not.toMatch(/opacity/);
    }
    const body = rules.map((r) => r.body).join("\n");
    expect(body).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(body).toMatch(/border-color:\s*var\(--border-muted\)/);
    expect(body).toMatch(/color:\s*var\(--fg-disabled\)/);
    expect(body).toMatch(/cursor:\s*default/);
  });

  it("gives aria-disabled the same look as disabled and no hover or press (C2)", () => {
    const rules = parseRules(stripComments(css));
    const look = rules.find((r) => /aria-disabled="true"\]:not\(\.cp-btn--loading\)/.test(r.selector) && /color:\s*var\(--fg-disabled\)/.test(r.body));
    expect(look, "a rule greys [aria-disabled=true]").toBeDefined();
    const hover = rules.find((r) => /:hover/.test(r.selector) && /linear-gradient/.test(r.body))!;
    expect(hover.selector).toMatch(/:not\(\[aria-disabled="true"\]\)/);
    const press = rules.find((r) => /:active/.test(r.selector))!;
    expect(press.selector).toMatch(/:not\(\[aria-disabled="true"\]\)/);
  });

  it("draws an on toggle (aria-pressed) as the selected fill and a 1px accent line in regular weight (D1)", () => {
    const rule = parseRules(stripComments(css)).find((r) => /\[aria-pressed="true"\]/.test(r.selector) && /\.cp-btn/.test(r.selector))!;
    expect(rule.body).toMatch(/background:\s*var\(--bg-selected\)/);
    expect(rule.body).toMatch(/border-color:\s*var\(--accent-primary\)/);
    expect(rule.body).toMatch(/color:\s*var\(--fg-primary\)/);
    expect(rule.body).toMatch(/font-weight:\s*var\(--font-weight-regular\)/);
  });

  it("is at least two control heights wide, except the small button (C7, C120)", () => {
    expect(css).toMatch(/\.cp-btn\s*\{[^}]*min-width:\s*calc\(var\(--control-height\) \* 2\)/);
    expect(css).toMatch(/\.cp-btn--sm\s*\{[^}]*min-width:\s*0/);
  });

  it("fills primary with --accent-fill and the danger confirm with --danger-fill (R2-8)", () => {
    expect(css).toMatch(/\.cp-btn--primary\s*\{[^}]*background:\s*var\(--accent-fill\)[^}]*color:\s*var\(--fg-on-accent\)/);
    expect(css).toMatch(/\.cp-btn--danger-confirm\s*\{[^}]*background:\s*var\(--danger-fill\)[^}]*color:\s*var\(--fg-primary\)/);
  });

  it("draws danger as a red outline, write as a green fill and quiet as words only", () => {
    expect(css).toMatch(/\.cp-btn--danger\s*\{[^}]*background:\s*transparent[^}]*color:\s*var\(--danger-text\)/);
    expect(css).toMatch(/\.cp-btn--write\s*\{[^}]*background:\s*var\(--accent-write\)[^}]*color:\s*var\(--fg-on-status\)/);
    expect(css).toMatch(/\.cp-btn--quiet\s*\{[^}]*background:\s*transparent/);
  });

  it.each([
    ["write", "cp-btn--write"],
    ["danger-confirm", "cp-btn--danger-confirm"],
    ["quiet", "cp-btn--quiet"],
    ["standard", "cp-btn--secondary"],
  ] as const)("the %s variant draws %s", (variant, cls) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("cp-btn", cls);
  });

  it("is small with size=sm (T12)", () => {
    render(<Button size="sm">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("cp-btn--sm");
    expect(css).toMatch(/--control-height-sm:[^;]*0\.8/);
  });

  it("is only its icon with iconOnly, named by its aria-label (T10)", () => {
    render(<Button iconOnly icon="close" aria-label="Close" />);
    const button = screen.getByRole("button", { name: "Close" });
    expect(button).toHaveClass("cp-btn--icon");
    expect(button.querySelector('svg[data-icon="close"]')).not.toBeNull();
    expect(button.querySelector(".cp-btn__label")).toBeNull();
  });

  it("requires an aria-label on an icon-only button, in its types (T10)", () => {
    // @ts-expect-error an icon-only button with no name does not compile
    const nameless = <Button iconOnly icon="close" />;
    expect(nameless).toBeTruthy();
  });

  it("draws an icon-only glyph at the small icon size (T10)", () => {
    expect(css).toMatch(/\.cp-btn--icon \.cp-pixel-icon\s*\{[^}]*width:\s*var\(--icon-size-sm\)[^}]*height:\s*var\(--icon-size-sm\)/);
  });

  it("greys only a disabled button that is not loading, and marks a loading icon button busy", () => {
    expect(css).toMatch(/\.cp-btn:disabled:not\(\.cp-btn--loading\)\s*[,{]/);
    render(<Button iconOnly icon="close" aria-label="Close" loading />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-busy", "true");
  });

  it("shares one small height between sm and icon-only sm", () => {
    expect(css).toMatch(/--control-height-sm:/);
    expect(css).not.toMatch(/\.cp-btn--sm\s*\{[^}]*calc\(var\(--control-height\) \* 0\.8\)/);
  });
});

describe("the quiet secondary button in bars, rows and cards (P3)", () => {
  const rules = parseRules(stripComments(css)).filter(
    (r) => r.selector.includes(".cp-toolbar") && r.selector.includes(".cp-btn--secondary"),
  );
  const rest = rules.filter((r) => !/:hover|:is\(:disabled/.test(r.selector));
  const hover = rules.filter((r) => /:hover/.test(r.selector));

  it("has one rule that strips the fill and frame in the bars and, for small buttons, in tables and cards", () => {
    expect(rest).toHaveLength(1);
    const selector = rest[0]!.selector;
    for (const container of [".cp-toolbar", ".cp-filter-bar", ".cp-selection-bar", ".cp-track-actions", ".prepare-row-buttons"]) {
      expect(selector, container).toContain(container);
    }
    expect(selector).toMatch(/:where\(\.track-table, \.cp-data-table, \.cp-card\)\s+\.cp-btn--secondary\.cp-btn--sm/);
    expect(rest[0]!.body).toMatch(/background:\s*transparent/);
    expect(rest[0]!.body).toMatch(/border-color:\s*transparent/);
  });

  it("leaves a framed button and a toggle that is on alone", () => {
    expect(rest[0]!.selector).toContain(":not(.cp-btn--framed)");
    expect(rest[0]!.selector).toContain(':not([aria-pressed="true"])');
  });

  it("brings the fill and frame back on hover, never while disabled", () => {
    expect(hover).toHaveLength(1);
    expect(hover[0]!.selector).toContain(":hover:not(:disabled)");
    expect(hover[0]!.body).toMatch(/background:\s*var\(--hover-fill\)/);
    expect(hover[0]!.body).toMatch(/border-color:\s*var\(--border-control\)/);
  });
});
