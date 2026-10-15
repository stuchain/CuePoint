/** Moving along the review from the keyboard: three bare keys, and never one that is someone else's. */
import { describe, expect, it } from "vitest";

import { MATCH_KEYS, matchCommand, type KeyLike } from "./matchKeyboard";

function press(key: string, init: Partial<KeyLike> = {}): KeyLike {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, ...init };
}

describe("matchCommand", () => {
  it("answers Up, Down and Esc", () => {
    expect(matchCommand(press("ArrowUp"))).toBe("previous-track");
    expect(matchCommand(press("ArrowDown"))).toBe("next-track");
    expect(matchCommand(press("Escape"))).toBe("close");
  });

  it("no longer answers the decision keys: a tick is the decision", () => {
    for (const key of ["Enter", "n", "s", "b", "y", "ArrowLeft", "ArrowRight"]) {
      expect(matchCommand(press(key))).toBeNull();
    }
  });

  it("leaves a modified key to the shell", () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(matchCommand(press("ArrowDown", init))).toBeNull();
    }
  });

  it("leaves a key typed into a field to the field", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(matchCommand(press("ArrowDown", { target: document.createElement(tag) }))).toBeNull();
    }
  });

  it("still answers on a tick, which takes no typed text", () => {
    const tick = document.createElement("input");
    tick.type = "checkbox";
    expect(matchCommand(press("ArrowDown", { target: tick }))).toBe("next-track");
  });

  it("leaves a key pressed inside a dialog or a menu to it", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inside = document.createElement("button");
    dialog.append(inside);
    expect(matchCommand(press("Escape", { target: inside }))).toBeNull();
  });

  it("names the keys for the shortcuts dialog", () => {
    expect(MATCH_KEYS).toEqual({ "previous-track": "Up", "next-track": "Down", close: "Esc" });
  });
});
