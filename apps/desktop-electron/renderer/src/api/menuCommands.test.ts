/**
 * What the menu's size commands mean (FLW-20): they step the Size setting through
 * `SCALE_OPTIONS` and never zoom.
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_SCALE, SCALE_OPTIONS } from "../tokens/scale";
import { MENU_COMMAND_IDS, sizeAfterCommand } from "./menuCommands";

describe("sizeAfterCommand", () => {
  it("steps to the next larger size, and stops at the largest", () => {
    expect(sizeAfterCommand("size-bigger", 1)).toBe(1.5);
    expect(sizeAfterCommand("size-bigger", 1.5)).toBe(2);
    expect(sizeAfterCommand("size-bigger", 2)).toBe(3);
    expect(sizeAfterCommand("size-bigger", 3)).toBe(3);
  });

  it("steps to the next smaller size, and stops at the smallest", () => {
    expect(sizeAfterCommand("size-smaller", 3)).toBe(2);
    expect(sizeAfterCommand("size-smaller", 1.5)).toBe(1);
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

  it.each(["size:7", "size:", "size:abc", "size:1.25", "settings", "", "size-huge"])(
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
