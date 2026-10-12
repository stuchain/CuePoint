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
    ["a", "correct"],
    ["r", "not-this"],
    ["n", "skip"],
    ["b", "play-preview"],
    ["y", "play-file"],
    ["Escape", "stop-preview"],
  ])("%s means %s", (value, command) => {
    expect(matchCommand(key(value), "one")).toBe(command);
  });

  it("names every command's key for the shortcuts dialog", () => {
    expect(MATCH_KEYS).toEqual({
      "previous-track": "Up",
      "next-track": "Down",
      "previous-candidate": "Left",
      "next-candidate": "Right",
      correct: "A",
      "not-this": "R",
      skip: "N",
      "play-preview": "B",
      "play-file": "Y",
      "stop-preview": "Esc",
    });
  });

  it("leaves Space to the player", () => {
    expect(matchCommand(key(" "), "one")).toBeNull();
    expect(matchCommand(key("Spacebar"), "one")).toBeNull();
    expect(Object.values(MATCH_KEYS)).not.toContain("Space");
  });

  it("ignores any other key", () => {
    expect(matchCommand(key("x"), "one")).toBeNull();
    expect(matchCommand(key("Enter"), "one")).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)("leaves %s combinations to the shell", (mod) => {
    expect(matchCommand(key("a", { [mod]: true }), "one")).toBeNull();
    expect(matchCommand(key("ArrowDown", { [mod]: true }), "one")).toBeNull();
    expect(matchCommand(key("b", { [mod]: true }), "one")).toBeNull();
  });

  it("does not take a capital letter as a decision", () => {
    for (const letter of ["A", "a", "r", "b", "y"]) {
      expect(matchCommand(key(letter, { shiftKey: true }), "one")).toBeNull();
    }
    expect(matchCommand(key("ArrowDown", { shiftKey: true }), "one")).toBe("next-track");
  });

  it.each(["checkbox", "radio"])("does not treat a %s as typing: A still corrects there", (type) => {
    const box = document.createElement("input");
    box.type = type;
    document.body.append(box);
    try {
      expect(matchCommand(key("a", { target: box }), "one")).toBe("correct");
    } finally {
      box.remove();
    }
  });

  it("still treats a text input as typing", () => {
    const field = document.createElement("input");
    field.type = "search";
    document.body.append(field);
    try {
      expect(matchCommand(key("a", { target: field }), "one")).toBeNull();
    } finally {
      field.remove();
    }
  });

  it.each(["input", "textarea", "select"])("types into a %s", (tag) => {
    const field = document.createElement(tag);
    expect(matchCommand(key("a", { target: field }), "one")).toBeNull();
    expect(matchCommand(key("ArrowDown", { target: field }), "one")).toBeNull();
    expect(matchCommand(key("Escape", { target: field }), "one")).toBeNull();
  });

  it("types into an editable element", () => {
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(matchCommand(key("r", { target: editable }), "one")).toBeNull();
  });

  it.each(["dialog", "menu", "listbox", "tree"])("leaves keys inside a %s to it", (role) => {
    const container = document.createElement("div");
    container.setAttribute("role", role);
    const button = document.createElement("button");
    container.appendChild(button);
    document.body.appendChild(container);
    expect(matchCommand(key("a", { target: button }), "one")).toBeNull();
    container.remove();
  });

  it("works when the window itself has the event", () => {
    expect(matchCommand(key("a", { target: window }), "one")).toBe("correct");
    expect(matchCommand(key("a", { target: null }), "one")).toBe("correct");
  });
});

describe("over the Table", () => {
  it("keeps the table's own arrows and Enter, and takes only Esc", () => {
    expect(matchCommand(key("ArrowDown"), "table")).toBeNull();
    expect(matchCommand(key("a"), "table")).toBeNull();
    expect(matchCommand(key("Enter"), "table")).toBeNull();
    expect(matchCommand(key("Escape"), "table")).toBe("stop-preview");
  });
});
