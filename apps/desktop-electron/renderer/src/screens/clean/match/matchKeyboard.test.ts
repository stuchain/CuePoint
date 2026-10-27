/** Moving along the review from the keyboard: three bare keys, and never one that is someone else's. */
import { describe, expect, it } from "vitest";

import { MATCH_KEYS, isSelectAll, matchCommand, type KeyLike } from "./matchKeyboard";

function press(key: string, init: Partial<KeyLike> = {}): KeyLike {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: document.body, ...init };
}

describe("matchCommand", () => {
  it("answers Up, Down and Esc", () => {
    expect(matchCommand(press("ArrowUp"))).toBe("previous-track");
    expect(matchCommand(press("ArrowDown"))).toBe("next-track");
    expect(matchCommand(press("Escape"))).toBe("close");
  });

  it("answers Home and End, which go to the first and the last track", () => {
    expect(matchCommand(press("Home"))).toBe("first-track");
    expect(matchCommand(press("End"))).toBe("last-track");
    expect(matchCommand(press("Home", { target: document.createElement("input") }))).toBeNull();
  });

  it("leaves the arrows, Home and End to a slider, but not Esc", () => {
    const slider = document.createElement("input");
    slider.type = "range";
    for (const key of ["ArrowUp", "ArrowDown", "Home", "End"]) {
      expect(matchCommand(press(key, { target: slider }))).toBeNull();
    }
    expect(matchCommand(press("Escape", { target: slider }))).toBe("close");
  });

  it("no longer answers the decision keys: a tick is the decision", () => {
    for (const key of ["Enter", "s", "b", "y", "ArrowLeft", "ArrowRight"]) {
      expect(matchCommand(press(key))).toBeNull();
    }
  });

  it("answers a bare N as the next track to check (M508), but not Shift+N or one typed in a field", () => {
    expect(matchCommand(press("n"))).toBe("next-to-check");
    expect(matchCommand(press("N", { shiftKey: true }))).toBeNull();
    expect(matchCommand(press("n", { target: document.createElement("input") }))).toBeNull();
    expect(matchCommand(press("n", { ctrlKey: true }))).toBeNull();
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

  it("answers Ctrl+A and Command+A outside a field, as every track list does", () => {
    expect(isSelectAll(press("a", { ctrlKey: true }))).toBe(true);
    expect(isSelectAll(press("A", { metaKey: true }))).toBe(true);
    expect(isSelectAll(press("a"))).toBe(false);
    expect(isSelectAll(press("a", { ctrlKey: true, target: document.createElement("input") }))).toBe(false);
  });

  it("leaves the arrows to a candidate's radio group, which moves the pick (not the track)", () => {
    const group = document.createElement("ul");
    group.setAttribute("role", "radiogroup");
    const radio = document.createElement("input");
    radio.type = "radio";
    group.append(radio);
    document.body.append(group);
    expect(matchCommand(press("ArrowDown", { target: radio }))).toBeNull();
    expect(matchCommand(press("ArrowUp", { target: radio }))).toBeNull();
    group.remove();
    expect(matchCommand(press("ArrowDown", { target: document.body }))).toBe("next-track");
  });

  it("names the keys for the shortcuts dialog", () => {
    expect(MATCH_KEYS).toEqual({
      "previous-track": "Up",
      "next-track": "Down",
      "first-track": "Home",
      "last-track": "End",
      close: "Esc",
      "select-all": "Ctrl+A",
      play: "Enter",
      tick: "Ctrl+Space",
    });
  });
});
