import { describe, expect, it } from "vitest";

import { reviewCommand, type KeyLike } from "./reviewKeyboard";

function key(value: string, overrides: Partial<KeyLike> = {}): KeyLike {
  return {
    key: value,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: document.body,
    ...overrides,
  };
}

describe("the review keys", () => {
  it.each([
    ["ArrowUp", "previous-track"],
    ["ArrowDown", "next-track"],
    ["ArrowLeft", "previous-candidate"],
    ["ArrowRight", "next-candidate"],
    ["a", "accept"],
    ["r", "reject"],
    ["n", "skip"],
  ])("%s means %s", (value, command) => {
    expect(reviewCommand(key(value))).toBe(command);
  });

  it("ignores any other key", () => {
    expect(reviewCommand(key("x"))).toBeNull();
    expect(reviewCommand(key(" "))).toBeNull();
    expect(reviewCommand(key("Enter"))).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)("leaves %s combinations to the shell", (mod) => {
    expect(reviewCommand(key("a", { [mod]: true }))).toBeNull();
    expect(reviewCommand(key("ArrowDown", { [mod]: true }))).toBeNull();
  });

  it("does not take a capital letter as a decision", () => {
    expect(reviewCommand(key("A", { shiftKey: true }))).toBeNull();
    // With Caps Lock on, Shift gives a lowercase letter: still not a decision.
    expect(reviewCommand(key("a", { shiftKey: true }))).toBeNull();
    expect(reviewCommand(key("r", { shiftKey: true }))).toBeNull();
    // Shift with an arrow is still a move.
    expect(reviewCommand(key("ArrowDown", { shiftKey: true }))).toBe("next-track");
  });

  it.each(["input", "textarea", "select"])("types into a %s", (tag) => {
    const field = document.createElement(tag);
    expect(reviewCommand(key("a", { target: field }))).toBeNull();
    expect(reviewCommand(key("ArrowDown", { target: field }))).toBeNull();
  });

  it("types into an editable element", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not compute isContentEditable, so it is stated.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(reviewCommand(key("r", { target: editable }))).toBeNull();
  });

  it.each(["dialog", "menu", "listbox", "tree"])("leaves keys inside a %s to it", (role) => {
    const container = document.createElement("div");
    container.setAttribute("role", role);
    const button = document.createElement("button");
    container.appendChild(button);
    document.body.appendChild(container);
    expect(reviewCommand(key("a", { target: button }))).toBeNull();
    container.remove();
  });

  it("works when the window itself has the event", () => {
    expect(reviewCommand(key("a", { target: window }))).toBe("accept");
    expect(reviewCommand(key("a", { target: null }))).toBe("accept");
  });
});
