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

  it("has a hairline border in its tone and no shadow (T5)", () => {
    const body = rule(".cp-badge");
    expect(body).toMatch(/border:\s*var\(--hairline\) solid var\(--chip-tone\)/);
    expect(body).not.toMatch(/box-shadow/);
  });

  it("keeps today's bevelled look only for the player bar's badge (C16c)", () => {
    const body = rule(".cp-badge--player");
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-badge\)/);
    expect(body).toMatch(/var\(--border-width\)/);
  });

  it("tints its fill from the tone and reads its words from it, never a solid fill", () => {
    const body = rule(".cp-badge");
    expect(body).toMatch(/background:\s*color-mix\(in srgb, var\(--chip-tone\) var\(--chip-fill-mix\), transparent\)/);
    expect(body).toMatch(/color:\s*color-mix\(in srgb, var\(--chip-tone\) var\(--chip-text-mix\), var\(--fg-primary\)\)/);
    expect(body).not.toMatch(/fg-on-status|fg-inverse/);
  });

  it.each(["success", "warning", "danger"])("%s takes its tone from the status colour", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(new RegExp(`--chip-tone:\\s*var\\(--accent-${variant}\\)`));
  });

  it.each(["accent", "info"])("%s takes the accent", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(/--chip-tone:\s*var\(--accent-primary\)/);
  });

  it("the neutral and default badge border is --border-muted", () => {
    expect(rule(".cp-badge--neutral")).toMatch(/border-color:\s*var\(--border-muted\)/);
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
