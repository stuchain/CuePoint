/**
 * The table's empty sentence (ORG-13).
 *
 * Six situations produce no rows and only one of them is "you have no music".
 * The order they are decided in is the whole of this module, so it is the whole
 * of this file: each test pairs the situation it is about with the ones it has
 * to beat.
 *
 * `emptyStates.test.tsx` renders these against the engine's real answers.
 */
import { describe, expect, it } from "vitest";

import { emptyStateFor, type EmptyStateInput } from "./libraryEmpty";

/** Nothing narrowing anything: the library, whole. */
const NOTHING: EmptyStateInput = {
  error: null,
  filtered: false,
  scope: null,
  playlistId: null,
  smartName: null,
  rules: [],
  emptiedByRefresh: false,
};

function view(overrides: Partial<EmptyStateInput> = {}) {
  return emptyStateFor({ ...NOTHING, ...overrides });
}

describe("a refusal", () => {
  it("is the sentence, in the engine's words", () => {
    expect(view({ error: "Tag 'has_tag' names tag 9999" }).headline).toBe(
      "Tag 'has_tag' names tag 9999",
    );
  });

  it("beats every other reason there could be no rows", () => {
    // A refused question has no answer, so nothing else may describe one.
    const refused = view({
      error: "That rule cannot be run",
      filtered: true,
      scope: "smart",
      playlistId: 3,
      smartName: "Closers",
      rules: ["Tag has Peak-time"],
      emptiedByRefresh: true,
    });
    expect(refused.headline).toBe("That rule cannot be run");
    expect(refused.rules).toEqual([]);
    expect(refused.hint).toBeNull();
  });
});

describe("a Smart Collection", () => {
  it("shows the rules it is asking", () => {
    const shown = view({
      scope: "smart",
      smartName: "Closers",
      rules: ["Genre is Techno", "BPM is between 120 and 124"],
    });
    expect(shown.headline).toBe("Nothing matches these rules right now.");
    expect(shown.rules).toEqual(["Genre is Techno", "BPM is between 120 and 124"]);
  });

  it("says which Collection keeps asking", () => {
    expect(view({ scope: "smart", smartName: "Closers", rules: ["Genre is Techno"] }).hint)
      .toMatch(/^Closers keeps asking this/);
  });

  it("still shows the rules when a search has narrowed them further", () => {
    // The search box holds its own text and the bar collapses the clauses into
    // a count, so this is the only place the rules are readable.
    const searched = view({
      scope: "smart",
      smartName: "Closers",
      filtered: true,
      rules: ["Genre is Techno"],
    });
    expect(searched.headline).toBe("Nothing inside these rules matches this search.");
    expect(searched.rules).toEqual(["Genre is Techno"]);
  });

  it("is recognised by the scope even before a name is in hand", () => {
    // The page attaches the name after the tree answers; the scope arrives
    // first, and the sentence must not be "no tracks match this search" for
    // the frame in between.
    const unnamed = view({ scope: "smart", rules: ["Genre is Techno"] });
    expect(unnamed.headline).toBe("Nothing matches these rules right now.");
    expect(unnamed.hint).toBeNull();
  });

  it("is recognised by the name even when the rules have been edited", () => {
    // An edited Smart Collection browses by rules rather than by id, so the
    // scope is null and the attachment is the only thing that knows.
    expect(view({ smartName: "Closers", filtered: true, rules: ["Genre is Techno"] }).rules)
      .toEqual(["Genre is Techno"]);
  });
});

describe("a search that matched nothing", () => {
  it("says the search is why", () => {
    expect(view({ filtered: true }).headline).toBe("No tracks match this search.");
  });

  it("beats an empty playlist, because the search is the newer fact", () => {
    // "This playlist is empty" while a search term is in the box sends someone
    // looking for a broken import.
    expect(view({ filtered: true, playlistId: 3 }).headline).toBe(
      "No tracks match this search.",
    );
  });

  it("beats an empty Collection for the same reason", () => {
    expect(view({ filtered: true, scope: "collection" }).headline).toBe(
      "No tracks match this search.",
    );
  });
});

describe("an empty playlist", () => {
  it("says so", () => {
    expect(view({ playlistId: 3 }).headline).toBe("This playlist is empty.");
  });
});

describe("an empty Collection", () => {
  it("invites tracks into it", () => {
    const invited = view({ scope: "collection" });
    expect(invited.headline).toBe("This Collection is empty.");
    expect(invited.hint).toMatch(/Drop tracks onto it/);
  });

  it("says what happened instead when a refresh emptied it", () => {
    // DEC-011: these tracks were not missing, they were taken, and the user
    // was warned before it happened. Inviting them to drop more in would be
    // answering a question nobody asked.
    const emptied = view({ scope: "collection", emptiedByRefresh: true });
    expect(emptied.hint).toMatch(/no longer in your Rekordbox export/);
    expect(emptied.hint).not.toMatch(/Drop tracks/);
  });

  it("does not claim a refresh emptied a playlist", () => {
    // The flag is about a Collection; a playlist that a refresh emptied is a
    // Rekordbox fact and reads as one.
    expect(view({ playlistId: 3, emptiedByRefresh: true }).headline).toBe(
      "This playlist is empty.",
    );
  });
});

describe("a library with nothing in it", () => {
  it("says the plainest thing", () => {
    const nothing = view();
    expect(nothing.headline).toBe("No tracks yet.");
    expect(nothing.rules).toEqual([]);
    expect(nothing.hint).toBeNull();
  });
});

describe("every answer", () => {
  it("has a sentence", () => {
    // A headline that could be empty is an empty state with no state in it.
    const cases: Partial<EmptyStateInput>[] = [
      {},
      { filtered: true },
      { playlistId: 1 },
      { scope: "collection" },
      { scope: "collection", emptiedByRefresh: true },
      { scope: "smart", rules: ["Genre is Techno"] },
      { smartName: "Closers", rules: [] },
      { error: "refused" },
    ];
    for (const input of cases) {
      expect(view(input).headline.length).toBeGreaterThan(0);
    }
  });

  it("only lists rules when rules are what is being asked", () => {
    // Clauses under "this playlist is empty" would be describing a filter the
    // reader is not looking at.
    for (const input of [{}, { filtered: true }, { playlistId: 1 }, { scope: "collection" as const }]) {
      expect(view({ ...input, rules: ["Genre is Techno"] }).rules).toEqual([]);
    }
  });
});
