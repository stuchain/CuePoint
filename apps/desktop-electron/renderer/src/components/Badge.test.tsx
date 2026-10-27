import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge, Chip } from "./Badge";
import css from "./Badge.css?raw";
import toastCss from "./Toast.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

/** The body of the rule whose selector list holds this selector. */
const rule = (selector: string, sheet = css) =>
  parseRules(stripComments(sheet)).find((r) => r.selector.split(",").map((part) => part.trim()).includes(selector))?.body ?? "";

describe("Badge", () => {
  it("draws its variant class", () => {
    render(<Badge variant="success">Done</Badge>);
    expect(screen.getByText("Done")).toHaveClass("cp-badge--success");
  });

  it("is square with no border, since a chip is a tint only, and no shadow (T5, C91, P6)", () => {
    const body = rule(".cp-badge");
    expect(body).toMatch(/border:\s*0;/);
    expect(body).toMatch(/border-radius:\s*0/);
    expect(body).not.toMatch(/box-shadow/);
  });

  it("has no player-bar variant: the queue count is a span, not a badge (P22; was C16c's bevelled badge)", () => {
    const code = stripComments(css);
    expect(code).not.toContain("cp-badge--player");
    expect(code).not.toMatch(/--shadow-badge|--border-width/);
  });

  it("tints its fill from the tone over its table's own ground, and reads its words from the tone", () => {
    const body = rule(".cp-badge");
    // Q6a: the tint is mixed once with --chip-ground (a table's solid ground), so a hovered or
    // selected row never changes the chip; outside a table the surface still shows through.
    expect(body).toMatch(
      /background:\s*color-mix\(in srgb, var\(--chip-tone\) var\(--chip-fill-mix\), var\(--chip-ground, transparent\)\)/,
    );
    expect(body).toMatch(/color:\s*var\(--chip-text, color-mix\(in srgb, var\(--chip-tone\) var\(--chip-text-mix\), var\(--fg-primary\)\)\)/);
    expect(body).not.toMatch(/fg-on-status|fg-on-accent/);
  });

  // M325 (D14, DEC-302): all good is quiet, so a success chip is the neutral chip.
  it("success is the neutral chip: colour is for what needs action or went wrong", () => {
    expect(rule(".cp-badge--success")).toMatch(/--chip-tone:\s*var\(--fg-muted\)/);
    expect(rule(".cp-badge--success")).not.toMatch(/--chip-text/);
  });

  it.each(["warning", "danger"])("%s takes its tone from the status colour", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(new RegExp(`--chip-tone:\\s*var\\(--accent-${variant}\\)`));
  });

  it.each(["warning", "danger"])("%s words use the status text token", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(new RegExp(`--chip-text:\\s*var\\(--${variant}-text\\)`));
  });

  it("accent takes the theme accent and info takes --accent-info", () => {
    expect(rule(".cp-badge--accent")).toMatch(/--chip-tone:\s*var\(--accent-primary\)/);
    expect(rule(".cp-badge--info")).toMatch(/--chip-tone:\s*var\(--accent-info\)/);
  });

  it("no badge tone draws a border colour, since none has a border (P6)", () => {
    for (const tone of ["neutral", "default", "success", "warning", "danger", "accent", "info"]) {
      expect(rule(`.cp-badge--${tone}`)).not.toMatch(/border-color/);
    }
  });

  it("is the same component as Chip, and tone wins over variant", () => {
    render(<Chip tone="danger" variant="success">Late</Chip>);
    expect(screen.getByText("Late")).toHaveClass("cp-badge--danger");
  });

  it.each(["info", "success", "warning", "error"])("the %s toast is one style: a panel with a status bar", (kind) => {
    expect(rule(`.cp-toast--${kind}`, toastCss)).toMatch(/--toast-tone:\s*var\(--accent-/);
    expect(rule(".cp-toast", toastCss)).toMatch(/color:\s*var\(--fg-primary\)/);
  });
});
