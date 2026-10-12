import { beforeEach, describe, expect, it } from "vitest";

import { focusReachedByKeyboard, installFocusOrigin, resetFocusOrigin } from "./focusOrigin";

function button(): HTMLButtonElement {
  const el = document.createElement("button");
  document.body.append(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  installFocusOrigin();
  resetFocusOrigin();
});

describe("focusOrigin", () => {
  it("does not count focus that follows a pointer press as keyboard", () => {
    const el = button();
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(false);
  });

  it("counts focus that follows a key press as keyboard", () => {
    const el = button();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(true);
  });

  it("treats programmatic focus with no input as keyboard", () => {
    const el = button();
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(true);
  });

  it("ignores a bare modifier when deciding the last input", () => {
    const el = button();
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(false);
  });

  it("is idempotent to install", () => {
    installFocusOrigin();
    installFocusOrigin();
    const el = button();
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(true);
  });

  it("counts an element focused before anything was recorded as keyboard", () => {
    const el = button();
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    el.focus();
    resetFocusOrigin(); // as if this focus predates the listeners
    expect(focusReachedByKeyboard(el)).toBe(true);
  });

  it("hands an already-focused control to the pointer when it is pressed", () => {
    const el = button();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(true);
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(focusReachedByKeyboard(el)).toBe(false);
  });

  it("sees a key that a window-capture listener registered later stops", () => {
    const el = button();
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    el.focus();
    const stop = (event: Event) => event.stopPropagation();
    window.addEventListener("keydown", stop, true);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    window.removeEventListener("keydown", stop, true);
    el.blur();
    el.focus();
    expect(focusReachedByKeyboard(el)).toBe(true);
  });
});
