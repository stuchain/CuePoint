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

  it("hides the label while loading", () => {
    render(<Button loading>Match</Button>);
    expect(screen.queryByText("Match")).not.toBeInTheDocument();
  });

  it("defaults to type=button so it cannot submit a form", () => {
    render(<Button>Safe</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
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
    const rules = parseRules(stripComments(css)).filter((r) => /:disabled/.test(r.selector));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.body).not.toMatch(/opacity/);
    }
    const body = rules.map((r) => r.body).join("\n");
    expect(body).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(body).toMatch(/border-color:\s*var\(--border-muted\)/);
    expect(body).toMatch(/color:\s*var\(--fg-disabled\)/);
  });

  it("fills primary with --accent-fill and the danger confirm with --danger-fill (R2-8)", () => {
    expect(css).toMatch(/\.cp-btn--primary\s*\{[^}]*background:\s*var\(--accent-fill\)[^}]*color:\s*var\(--fg-inverse\)/);
    expect(css).toMatch(/\.cp-btn--danger-confirm\s*\{[^}]*background:\s*var\(--danger-fill\)[^}]*color:\s*var\(--fg-primary\)/);
  });

  it("draws danger as a red outline, write as a green fill and quiet as words only", () => {
    expect(css).toMatch(/\.cp-btn--danger\s*\{[^}]*background:\s*transparent[^}]*color:\s*var\(--danger-text\)/);
    expect(css).toMatch(/\.cp-btn--write\s*\{[^}]*background:\s*var\(--accent-success\)[^}]*color:\s*var\(--fg-on-status\)/);
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
    expect(css).toMatch(/\.cp-btn:disabled:not\(\.cp-btn--loading\)\s*\{/);
    render(<Button iconOnly icon="close" aria-label="Close" loading />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-busy", "true");
  });

  it("shares one small height between sm and icon-only sm", () => {
    expect(css).toMatch(/--control-height-sm:/);
    expect(css).not.toMatch(/\.cp-btn--sm\s*\{[^}]*calc\(var\(--control-height\) \* 0\.8\)/);
  });
});
