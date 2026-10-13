import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./Badge";
import css from "./Badge.css?raw";
import toastCss from "./Toast.css?raw";
import { parseRules, stripComments } from "../test/cssRules";

const rule = (selector: string, sheet = css) =>
  parseRules(stripComments(sheet)).find((r) => r.selector === selector)?.body ?? "";

describe("Badge", () => {
  it("draws its variant class", () => {
    render(<Badge variant="success">Done</Badge>);
    expect(screen.getByText("Done")).toHaveClass("cp-badge--success");
  });

  it("has a hairline border in its own colour and no shadow (T5)", () => {
    const body = rule(".cp-badge");
    expect(body).toMatch(/border:\s*var\(--hairline\) solid currentColor/);
    expect(body).not.toMatch(/box-shadow/);
  });

  it("keeps today's bevelled look only for the player bar's badge (C16c)", () => {
    const body = rule(".cp-badge--player");
    expect(body).toMatch(/box-shadow:\s*var\(--shadow-badge\)/);
    expect(body).toMatch(/var\(--border-width\)/);
  });

  it.each(["success", "warning", "danger", "info"])("%s border is the variant's accent", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(new RegExp(`border-color:\\s*var\\(--accent-${variant}\\)`));
  });

  it("the default badge border is --border-muted", () => {
    expect(rule(".cp-badge--default")).toMatch(/border-color:\s*var\(--border-muted\)/);
  });

  it.each(["success", "warning", "danger", "info"])("%s text uses --fg-on-status", (variant) => {
    expect(rule(`.cp-badge--${variant}`)).toMatch(/color:\s*var\(--fg-on-status\)/);
  });

  it.each(["info", "success", "warning", "error"])("the %s toast text uses --fg-on-status", (kind) => {
    expect(rule(`.cp-toast--${kind}`, toastCss)).toMatch(/color:\s*var\(--fg-on-status\)/);
  });
});
