import { describe, expect, it } from "vitest";

import { matchCommand, MATCH_KEYS, type KeyLike } from "./matchKeyboard";

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

describe("the One at a time keys", () => {
  it.each([
    ["ArrowUp", "previous-track"],
    ["ArrowDown", "next-track"],
    ["ArrowLeft", "previous-candidate"],
    ["ArrowRight", "next-candidate"],
    ["Enter", "correct"],
    ["n", "not-this"],
    ["s", "skip"],
    ["b", "play-preview"],
    ["y", "play-file"],
    ["Escape", "stop-preview"],
  ])("%s means %s", (value, command) => {
    expect(matchCommand(key(value))).toBe(command);
  });

  it("names every command's key for the shortcuts dialog", () => {
    expect(MATCH_KEYS).toEqual({
      "previous-track": "Up",
      "next-track": "Down",
      "previous-candidate": "Left",
      "next-candidate": "Right",
      correct: "Enter",
      "not-this": "N",
      skip: "S",
      "play-preview": "B",
      "play-file": "Y",
      "stop-preview": "Esc",
    });
  });

  it("leaves Space to the player", () => {
    expect(matchCommand(key(" "))).toBeNull();
    expect(matchCommand(key("Spacebar"))).toBeNull();
    expect(Object.values(MATCH_KEYS)).not.toContain("Space");
  });

  it("ignores any other key", () => {
    expect(matchCommand(key("x"))).toBeNull();
    // A and R were the old keys for Correct and Not this track.
    expect(matchCommand(key("a"))).toBeNull();
    expect(matchCommand(key("r"))).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)("leaves %s combinations to the shell", (mod) => {
    expect(matchCommand(key("s", { [mod]: true }))).toBeNull();
    expect(matchCommand(key("Enter", { [mod]: true }))).toBeNull();
    expect(matchCommand(key("ArrowDown", { [mod]: true }))).toBeNull();
    expect(matchCommand(key("b", { [mod]: true }))).toBeNull();
  });

  it("does not take a capital letter as a decision", () => {
    for (const letter of ["N", "n", "s", "b", "y"]) {
      expect(matchCommand(key(letter, { shiftKey: true }))).toBeNull();
    }
    expect(matchCommand(key("ArrowDown", { shiftKey: true }))).toBe("next-track");
  });

  it.each(["checkbox", "radio"])("does not treat a %s as typing: N still rejects there", (type) => {
    const box = document.createElement("input");
    box.type = type;
    document.body.append(box);
    try {
      expect(matchCommand(key("n", { target: box }))).toBe("not-this");
    } finally {
      box.remove();
    }
  });

  it("still treats a text input as typing", () => {
    const field = document.createElement("input");
    field.type = "search";
    document.body.append(field);
    try {
      expect(matchCommand(key("n", { target: field }))).toBeNull();
    } finally {
      field.remove();
    }
  });

  it.each(["input", "textarea", "select"])("types into a %s", (tag) => {
    const field = document.createElement(tag);
    expect(matchCommand(key("n", { target: field }))).toBeNull();
    expect(matchCommand(key("Enter", { target: field }))).toBeNull();
    expect(matchCommand(key("ArrowDown", { target: field }))).toBeNull();
    expect(matchCommand(key("Escape", { target: field }))).toBeNull();
  });

  it("types into an editable element", () => {
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(matchCommand(key("n", { target: editable }))).toBeNull();
  });

  it.each(["dialog", "menu", "listbox", "tree"])("leaves keys inside a %s to it", (role) => {
    const container = document.createElement("div");
    container.setAttribute("role", role);
    const button = document.createElement("button");
    container.appendChild(button);
    document.body.appendChild(container);
    expect(matchCommand(key("n", { target: button }))).toBeNull();
    container.remove();
  });

  it("works when the window itself has the event", () => {
    expect(matchCommand(key("Enter", { target: window }))).toBe("correct");
    expect(matchCommand(key("Enter", { target: null }))).toBe("correct");
  });

  it("leaves Enter on a button to the button, which it presses", () => {
    const skip = document.createElement("button");
    document.body.append(skip);
    try {
      expect(matchCommand(key("Enter", { target: skip }))).toBeNull();
      // The letters still decide from a focused button.
      expect(matchCommand(key("s", { target: skip }))).toBe("skip");
    } finally {
      skip.remove();
    }
  });

  it.each([
    ["checkbox", 'input type="checkbox"'],
    ["slider", 'div role="slider"'],
    ["option", 'div role="option"'],
    ["menuitem", 'div role="menuitem"'],
    ["switch", 'div role="switch"'],
    ["gridcell", 'div role="gridcell"'],
    ["row", 'div role="row"'],
    ["a tabbable element", 'div tabindex="0"'],
  ])("leaves Enter on %s to it", (_name, spec) => {
    const [tag, ...attrs] = spec.split(" ");
    const element = document.createElement(tag!);
    for (const attr of attrs) {
      const [name, value] = attr.split("=");
      element.setAttribute(name!, value!.replace(/"/g, ""));
    }
    document.body.append(element);
    try {
      expect(matchCommand(key("Enter", { target: element }))).toBeNull();
    } finally {
      element.remove();
    }
  });

  it("corrects on Enter from a part of the card that does not take focus", () => {
    const region = document.createElement("section");
    document.body.append(region);
    try {
      expect(matchCommand(key("Enter", { target: region }))).toBe("correct");
    } finally {
      region.remove();
    }
  });

  it("decides once: a held Enter, N or S does not repeat", () => {
    for (const value of ["Enter", "n", "s"]) {
      expect(matchCommand(key(value, { repeat: true }))).toBeNull();
      expect(matchCommand(key(value))).not.toBeNull();
    }
    // Looking at other results may be held.
    expect(matchCommand(key("ArrowRight", { repeat: true }))).toBe("next-candidate");
  });
});
