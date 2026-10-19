import { afterEach, describe, expect, it } from "vitest";
import { isDialogOpen } from "./shellKeyboard";

describe("isDialogOpen (C201)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is false with no dialog", () => {
    expect(isDialogOpen()).toBe(false);
  });

  it("is true for a modal dialog and false for a non-modal one", () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="false"></div>';
    expect(isDialogOpen()).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(isDialogOpen()).toBe(true);
  });
});
