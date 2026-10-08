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
    expect(view({ error: "Tag 'has_tag' names tag 9999" }).title).toBe(
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
    expect(refused.title).toBe("That rule cannot be run");
    expect(refused.rules).toEqual([]);
    expect(refused.hint).toBeNull();
  });

  it("offers a way out: clear what narrows the view, else try again", () => {
    expect(view({ error: "refused", filtered: true }).action).toEqual({
      id: "clear-all",
      label: "Clear search and filters",
    });
    expect(view({ error: "refused" }).action).toEqual({ id: "retry", label: "Ask again" });
  });
});

describe("a Smart Collection", () => {
  it("shows the rules it is asking", () => {
    const shown = view({
      scope: "smart",
      smartName: "Closers",
      rules: ["Genre is Techno", "BPM is between 120 and 124"],
    });
    expect(shown.title).toBe("Nothing matches these rules right now.");
    expect(shown.rules).toEqual(["Genre is Techno", "BPM is between 120 and 124"]);
    expect(shown.action).toEqual({ id: "edit-rules", label: "Edit the rules" });
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
      searching: true,
      rules: ["Genre is Techno"],
    });
    expect(searched.title).toBe("Nothing inside these rules matches this search.");
    expect(searched.rules).toEqual(["Genre is Techno"]);
    expect(searched.action).toEqual({ id: "clear-search", label: "Clear the search" });
  });

  it("offers the rules, not a search to clear, when filters changed and no search is typed", () => {
    const changed = view({
      scope: "smart",
      smartName: "Closers",
      filtered: true,
      searching: false,
      filtering: true,
      rules: ["Genre is Techno"],
    });
    expect(changed.title).toBe("Nothing matches these rules as you changed them.");
    expect(changed.action).toEqual({ id: "edit-rules", label: "Edit the rules" });
  });

  it("is recognised by the scope even before a name is in hand", () => {
    // The page attaches the name after the tree answers; the scope arrives
    // first, and the sentence must not be "no tracks match this search" for
    // the frame in between.
    const unnamed = view({ scope: "smart", rules: ["Genre is Techno"] });
    expect(unnamed.title).toBe("Nothing matches these rules right now.");
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
    expect(view({ filtered: true }).title).toBe("No tracks match this search.");
  });

  it("says what to try, and offers to clear both (LIB-5)", () => {
    const shown = view({ filtered: true });
    expect(shown.hint).toBe("Try fewer words, or clear the search and filters.");
    expect(shown.action).toEqual({ id: "clear-all", label: "Clear search and filters" });
  });

  it("offers only the thing that is narrowing the view", () => {
    expect(view({ filtered: true, searching: true, filtering: false }).action).toEqual({
      id: "clear-search",
      label: "Clear the search",
    });
    const filters = view({ filtered: true, searching: false, filtering: true });
    expect(filters.title).toBe("No tracks match these filters.");
    expect(filters.action).toEqual({ id: "clear-filters", label: "Clear all filters" });
  });

  it("beats an empty playlist, because the search is the newer fact", () => {
    // "This playlist is empty" while a search term is in the box sends someone
    // looking for a broken import.
    expect(view({ filtered: true, playlistId: 3 }).title).toBe(
      "No tracks match this search.",
    );
  });

  it("beats an empty Collection for the same reason", () => {
    expect(view({ filtered: true, scope: "collection" }).title).toBe(
      "No tracks match this search.",
    );
  });
});

describe("an empty playlist", () => {
  it("says so, where playlists come from, and offers the check (LIB-5, DEC-208)", () => {
    const empty = view({ playlistId: 3 });
    expect(empty.title).toBe("This playlist is empty.");
    expect(empty.hint).toBe(
      "Playlists come from Rekordbox. Add tracks to it there, then Check Rekordbox for changes.",
    );
    expect(empty.action).toEqual({
      id: "check-rekordbox",
      label: "Check Rekordbox for changes",
    });
  });
});

describe("an empty Collection", () => {
  it("invites tracks into it", () => {
    const invited = view({ scope: "collection" });
    expect(invited.title).toBe("This Collection is empty.");
    expect(invited.hint).toMatch(/Drop tracks onto it/);
    expect(invited.action).toEqual({ id: "show-library", label: "Browse the whole library" });
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
    expect(view({ playlistId: 3, emptiedByRefresh: true }).title).toBe(
      "This playlist is empty.",
    );
  });
});

describe("a library with nothing in it", () => {
  it("says the export is empty and what to do about it (LIB-5)", () => {
    const nothing = view();
    expect(nothing.title).toBe("This Rekordbox export has no tracks in it.");
    expect(nothing.rules).toEqual([]);
    expect(nothing.hint).toBe("Export again from Rekordbox and import that file.");
    expect(nothing.action).toEqual({ id: "import", label: "Import another file…" });
  });
});

describe("every answer", () => {
  it("leaves no empty table without a next step (LIB-5)", () => {
    const cases: Partial<EmptyStateInput>[] = [
      {},
      { filtered: true },
      { playlistId: 1 },
      { scope: "collection" },
      { scope: "collection", isSet: true },
      { scope: "collection", emptiedByRefresh: true },
      { scope: "smart", rules: ["Genre is Techno"] },
      { scope: "smart", filtered: true, rules: ["Genre is Techno"] },
      { error: "refused" },
    ];
    for (const input of cases) {
      const action = view(input).action;
      expect(action, JSON.stringify(input)).toBeDefined();
      expect(action!.label.length).toBeGreaterThan(0);
    }
  });

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
      expect(view(input).title.length).toBeGreaterThan(0);
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
