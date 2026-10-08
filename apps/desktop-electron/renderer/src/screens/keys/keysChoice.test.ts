import { describe, expect, it } from "vitest";

import {
  EMPTY_CHOICE,
  chooseKey,
  chooseNone,
  choiceRules,
  choiceWords,
  modeFromEvent,
} from "./keysChoice";

const ORDER = ["1A", "1B", "2A", "5A", "8A", "8B", "9A"];

describe("choosing keys on the Keys page (PAGES-16)", () => {
  it("a plain click chooses that key alone", () => {
    const one = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    expect(one.keys).toEqual(["8A"]);
    expect(chooseKey(one, "9A", ORDER, "only").keys).toEqual(["9A"]);
  });

  it("a plain click on the only chosen key lets go of it", () => {
    const one = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    expect(chooseKey(one, "8A", ORDER, "only").keys).toEqual([]);
  });

  it("Ctrl or Command adds and removes one key", () => {
    let choice = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    choice = chooseKey(choice, "9A", ORDER, "toggle");
    expect(choice.keys).toEqual(["8A", "9A"]);
    choice = chooseKey(choice, "8A", ORDER, "toggle");
    expect(choice.keys).toEqual(["9A"]);
  });

  it("Shift chooses the run between the last key clicked and this one, in list order", () => {
    let choice = chooseKey(EMPTY_CHOICE, "1B", ORDER, "only");
    choice = chooseKey(choice, "5A", ORDER, "range");
    expect(choice.keys).toEqual(["1B", "2A", "5A"]);
    // Backwards too.
    choice = chooseKey(chooseKey(EMPTY_CHOICE, "9A", ORDER, "only"), "8A", ORDER, "range");
    expect(choice.keys).toEqual(["8A", "8B", "9A"]);
  });

  it("Shift with nothing chosen yet chooses just that key", () => {
    expect(chooseKey(EMPTY_CHOICE, "5A", ORDER, "range").keys).toEqual(["5A"]);
  });

  it("keeps the keys in Camelot order whatever order they were clicked in", () => {
    let choice = chooseKey(EMPTY_CHOICE, "9A", ORDER, "only");
    choice = chooseKey(choice, "1A", ORDER, "toggle");
    expect(choice.keys).toEqual(["1A", "9A"]);
  });

  it("remembers the last key clicked, for 'mix with'", () => {
    let choice = chooseKey(EMPTY_CHOICE, "9A", ORDER, "only");
    choice = chooseKey(choice, "1A", ORDER, "toggle");
    expect(choice.anchor).toBe("1A");
    choice = chooseKey(choice, "1A", ORDER, "toggle");
    expect(choice.anchor).toBe("9A");
  });

  it("'No Beatport key' stands alone: it replaces keys, and a key replaces it", () => {
    const keys = chooseKey(chooseKey(EMPTY_CHOICE, "8A", ORDER, "only"), "9A", ORDER, "toggle");
    const none = chooseNone(keys);
    expect(none).toMatchObject({ keys: [], none: true });
    expect(chooseKey(none, "8A", ORDER, "toggle")).toMatchObject({ keys: ["8A"], none: false });
    expect(chooseNone(none)).toMatchObject({ none: false });
  });

  it("reads Ctrl, Command and Shift from a click", () => {
    expect(modeFromEvent({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe("only");
    expect(modeFromEvent({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe("toggle");
    expect(modeFromEvent({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe("toggle");
    expect(modeFromEvent({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe("range");
  });
});

describe("the rules a choice makes (FLW-7, PAGES-16)", () => {
  const playlist = { kind: "playlist", id: 4 } as const;
  const set = { kind: "set", id: 9 } as const;

  it("is nothing before a key is chosen", () => {
    expect(choiceRules(EMPTY_CHOICE, [playlist])).toBeNull();
  });

  it("is 'Key is' for one key and 'Key is any of' for several", () => {
    const one = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    expect(choiceRules(one, [])).toEqual({
      match: "all",
      rules: [{ field: "key", operator: "is", value: "8A" }],
    });
    const two = chooseKey(one, "9A", ORDER, "toggle");
    expect(choiceRules(two, [])).toEqual({
      match: "all",
      rules: [{ field: "key", operator: "any_of", value: ["8A", "9A"] }],
    });
  });

  it("adds 'In playlist is any of' for the ticked sources, playlists included", () => {
    const one = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    expect(choiceRules(one, [playlist, set])).toEqual({
      match: "all",
      rules: [
        { field: "key", operator: "is", value: "8A" },
        { field: "in_playlist", operator: "any_of", value: [playlist, set] },
      ],
    });
  });

  it("asks for the tracks with no key when 'No Beatport key' is chosen", () => {
    expect(choiceRules(chooseNone(EMPTY_CHOICE), [playlist])).toEqual({
      match: "all",
      rules: [
        { field: "key", operator: "is_empty" },
        { field: "in_playlist", operator: "any_of", value: [playlist] },
      ],
    });
  });

  it("says what is chosen in words", () => {
    const one = chooseKey(EMPTY_CHOICE, "8A", ORDER, "only");
    expect(choiceWords(one)).toBe("8A");
    expect(choiceWords(chooseKey(one, "9A", ORDER, "toggle"))).toBe("8A and 9A");
    expect(choiceWords(chooseKey(chooseKey(one, "9A", ORDER, "toggle"), "1A", ORDER, "toggle"))).toBe(
      "1A, 8A and 9A",
    );
    expect(choiceWords(chooseNone(EMPTY_CHOICE))).toBe("No Beatport key");
  });
});
