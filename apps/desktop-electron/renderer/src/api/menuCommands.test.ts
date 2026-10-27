/**
 * What the menu's size commands mean (FLW-20): they step the Size setting through
 * `SCALE_OPTIONS` and never zoom.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_SCALE, SCALE_OPTIONS } from "../tokens/scale";
import {
  MENU_COMMAND_IDS,
  NEW_MENU_COMMAND_IDS,
  RETIRED_MENU_COMMAND_IDS,
  sizeAfterCommand,
  undoTarget,
} from "./menuCommands";

describe("sizeAfterCommand", () => {
  it("steps to the next larger size, and stops at the largest", () => {
    expect(sizeAfterCommand("size-bigger", 1)).toBe(1.25);
    expect(sizeAfterCommand("size-bigger", 1.25)).toBe(1.5);
    expect(sizeAfterCommand("size-bigger", 1.5)).toBe(2);
    expect(sizeAfterCommand("size-bigger", 2)).toBe(3);
    expect(sizeAfterCommand("size-bigger", 3)).toBe(3);
  });

  it("skips a size too big for the screen when stepping up, and stays at the end", () => {
    // 700 / 1.5 = 466 < 560, and 700 / 1.25 = 560 is just enough.
    expect(sizeAfterCommand("size-bigger", 1, 700)).toBe(1.25);
    expect(sizeAfterCommand("size-bigger", 1.25, 700)).toBe(1.25);
    // 1000 / 2 = 500 is too big, 1000 / 1.5 is not.
    expect(sizeAfterCommand("size-bigger", 1.5, 1000)).toBe(1.5);
    expect(sizeAfterCommand("size-bigger", 1.25, 1000)).toBe(1.5);
    expect(sizeAfterCommand("size-bigger", 1.5, 1200)).toBe(2);
  });

  it("steps to the next smaller size, and stops at the smallest", () => {
    expect(sizeAfterCommand("size-smaller", 3)).toBe(2);
    expect(sizeAfterCommand("size-smaller", 1.5)).toBe(1.25);
    expect(sizeAfterCommand("size-smaller", 1.25)).toBe(1);
    expect(sizeAfterCommand("size-smaller", 1)).toBe(1);
  });

  it("goes back to the default size, 1.5×", () => {
    expect(DEFAULT_SCALE).toBe(1.5);
    expect(sizeAfterCommand("size-default", 3)).toBe(DEFAULT_SCALE);
  });

  it("sets the size a radio item names", () => {
    for (const option of SCALE_OPTIONS) {
      expect(sizeAfterCommand(`size:${option}`, 1)).toBe(option);
    }
  });

  it.each(["size:7", "size:", "size:abc", "size:1.75", "settings", "", "size-huge"])(
    "answers null to %j: no size changes",
    (command) => {
      expect(sizeAfterCommand(command, 1.5)).toBeNull();
    },
  );
});

describe("the command ids", () => {
  it("are unique", () => {
    expect(new Set(MENU_COMMAND_IDS).size).toBe(MENU_COMMAND_IDS.length);
  });
});

describe("the ids main sends that the shell does not answer yet", () => {
  it("are new, and not already in the shell's list", () => {
    expect([...NEW_MENU_COMMAND_IDS]).toEqual(["export-rekordbox", "undo"]);
    for (const id of NEW_MENU_COMMAND_IDS) {
      expect((MENU_COMMAND_IDS as readonly string[]).includes(id), id).toBe(false);
    }
  });

  it("keep the retired ids in the shell's list until their handlers go", () => {
    for (const id of RETIRED_MENU_COMMAND_IDS) {
      expect((MENU_COMMAND_IDS as readonly string[]).includes(id), id).toBe(true);
    }
  });
});

describe("what undo undoes (M456)", () => {
  const el = (html: string): Element => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild!;
  };

  it("is a typed edit in a text field, a text area or an editable element", () => {
    expect(undoTarget(el('<input type="text">'))).toBe("text");
    expect(undoTarget(el("<input>"))).toBe("text");
    expect(undoTarget(el('<input type="search">'))).toBe("text");
    expect(undoTarget(el("<textarea></textarea>"))).toBe("text");
    expect(undoTarget(el('<div contenteditable="true"></div>'))).toBe("text");
    expect(undoTarget(el("<div contenteditable></div>"))).toBe("text");
  });

  it("is the newest change anywhere else", () => {
    expect(undoTarget(null)).toBe("change");
    expect(undoTarget(undefined)).toBe("change");
    expect(undoTarget(el("<button>x</button>"))).toBe("change");
    expect(undoTarget(el('<input type="checkbox">'))).toBe("change");
    expect(undoTarget(el('<input type="range">'))).toBe("change");
    expect(undoTarget(el('<div tabindex="0"></div>'))).toBe("change");
    expect(undoTarget(el('<div contenteditable="false"></div>'))).toBe("change");
  });
});
