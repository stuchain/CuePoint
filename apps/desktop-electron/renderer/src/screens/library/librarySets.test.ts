/**
 * Sets in the Library, as pure functions (PREP-09), over the engine's answers.
 *
 * The kind audit's renderer half (fact 2): wherever the Library asks "does
 * this node hold tracks?" a Set answers yes, and wherever it asks "is this a
 * crate?" a Set answers no. Each question lives in one function, so each is
 * pinned here once, against the tree a real engine sent.
 */
import { describe, expect, it } from "vitest";

import { MEMBERSHIP_REVERT_REASON } from "../../components/shell/activityActions";
import { scopeOptions } from "../clean/cleanRules";
import {
  buildCollectionTree,
  canReorder,
  defaultSortForCollection,
  describeDeletion,
  holdsTracks,
  iconForKind,
  isCollection,
  isSet,
  kindLabel,
  rulesOf,
  setPickerNodes,
} from "./collectionTree";
import { batchConsequence, batchSummary } from "./libraryBatch";
import { emptyStateFor } from "./libraryEmpty";
import { referenceWarning } from "./libraryFormat";
import {
  newSetFromExplanation,
  newSetMadeLine,
  setSourceOf,
  type NewSetSource,
} from "./newSetFrom";
import {
  ADDED_TO_SET,
  CREATED_FROM_COLLECTION,
  DELETE_PREVIEW,
  EMPTY_SET,
  FRIDAY,
  GIGS,
  REFERENCES,
  SMART,
  TREE,
  WARMUP,
} from "./librarySets.testFixture";
import { setScopeNote } from "./setScope";
import { organizationMenuItems } from "./trackMenu";

const noop = () => undefined;

describe("the kind audit: what a Set answers (fact 2)", () => {
  it("holds tracks, as a Collection does and a folder and a Smart Collection do not", () => {
    expect(holdsTracks(FRIDAY)).toBe(true);
    expect(holdsTracks(WARMUP)).toBe(true);
    expect(holdsTracks(GIGS)).toBe(false);
    expect(holdsTracks(SMART)).toBe(false);
  });

  it("is not a crate", () => {
    expect(isCollection(FRIDAY)).toBe(false);
    expect(isCollection(WARMUP)).toBe(true);
    expect(isSet(FRIDAY)).toBe(true);
    expect(isSet(WARMUP)).toBe(false);
  });

  it("wears Prepare's flag and is called a Set", () => {
    expect(iconForKind(FRIDAY.kind)).toBe("prepare");
    expect(kindLabel("set")).toBe("Set");
    expect(kindLabel("collection")).toBe("Collection");
    expect(kindLabel("smart")).toBe("Smart Collection");
    expect(kindLabel("folder")).toBe("folder");
  });

  it("opens in its running order and carries no rules", () => {
    expect(defaultSortForCollection(FRIDAY)).toEqual({ sort: "collection_position", dir: "asc" });
    expect(rulesOf(FRIDAY)).toBeNull();
  });

  it("cannot be rearranged from the Library, whose rows are its tracks once each", () => {
    const view = {
      scope: "collection" as const,
      collectionId: FRIDAY.id,
      sort: "collection_position",
      dir: "asc" as const,
      q: "",
      filtered: false,
    };
    const answer = canReorder(view, FRIDAY);
    expect(answer.ok).toBe(false);
    expect(answer.ok ? "" : answer.why).toBe(
      "“Friday” is a Set: its running order is arranged in Prepare, where each entry has its own row.",
    );
    // A Collection in the same view still can.
    const plain = { ...WARMUP, entry_count: 2, track_count: 2 };
    expect(canReorder({ ...view, collectionId: plain.id }, plain)).toEqual({ ok: true });
  });
});

describe("the Set picker's tree", () => {
  const tree = buildCollectionTree(TREE);

  it("lists the Sets and the folders on the way to them, in tree order", () => {
    // Warm-up the Collection and Ada the Smart Collection are roots between
    // Gigs and Empty, and are left out.
    expect(setPickerNodes(tree).map((node) => `${node.kind}:${node.name}`)).toEqual([
      "folder:Gigs",
      "set:Friday",
      "set:Warm-up",
      "set:Ada",
      "set:Friday copy",
      "set:Empty",
      "set:Sunday",
    ]);
  });

  it("leaves out Collections, Smart Collections and folders with no Set under them", () => {
    const withoutSets = buildCollectionTree([
      GIGS,
      { ...WARMUP, parent_id: GIGS.id, depth: 1 },
      SMART,
    ]);
    expect(setPickerNodes(withoutSets)).toEqual([]);
  });

  it("keeps a folder whose Set is two folders down", () => {
    const inner = { ...GIGS, id: 900, name: "Inner", parent_id: GIGS.id, depth: 1 };
    const deep = { ...FRIDAY, id: 901, parent_id: 900, depth: 2 };
    const nested = buildCollectionTree([GIGS, inner, deep]);
    expect(setPickerNodes(nested).map((node) => node.name)).toEqual(["Gigs", "Inner", "Friday"]);
  });
});

describe("a delete that takes Sets", () => {
  it("names them and their plans, from the engine's preview", () => {
    expect(describeDeletion(DELETE_PREVIEW)).toBe(
      "This removes 1 folder and 4 Sets, with 17 track entries filed in them. " +
        "Each Set's chapters, planned times and notes go with it. No tracks are deleted.",
    );
  });

  it("says one Set's plan goes with it", () => {
    expect(
      describeDeletion({
        folders: 0,
        collections: 0,
        smart_collections: 0,
        sets: 1,
        entries: 6,
        nodes: 1,
      }),
    ).toBe(
      "This removes 1 Set, with 6 track entries filed in them. " +
        "The Set's chapters, planned times and notes go with it. No tracks are deleted.",
    );
  });

  it("reads an engine older than Sets as none", () => {
    expect(
      describeDeletion({ folders: 0, collections: 1, smart_collections: 0, entries: 0, nodes: 1 }),
    ).toBe("This removes 1 Collection. No tracks are deleted.");
  });
});

describe("the Set scope's note (fact 3)", () => {
  it("gives the numbers when a Set plays a track twice", () => {
    expect(setScopeNote(FRIDAY)).toBe(
      "“Friday” is a Set of 6 entries. The table lists each of its 5 tracks once, in the order they first play.",
    );
  });

  it("says less when the two numbers agree", () => {
    expect(setScopeNote(EMPTY_SET)).toBe(
      "“Empty” is a Set. The table lists each of its tracks once, in the order they first play.",
    );
  });
});

describe("the table's empty state", () => {
  const base = {
    error: null,
    filtered: false,
    scope: "collection" as const,
    playlistId: null,
    smartName: null,
    rules: [],
    emptiedByRefresh: false,
  };

  it("names an empty Set and how to fill it", () => {
    expect(emptyStateFor({ ...base, isSet: true })).toEqual({
      headline: "This Set is empty.",
      rules: [],
      hint: "Drop tracks onto it, or use Add to Set from the track menu.",
    });
  });

  it("says a refresh emptied it, not that nobody filled it", () => {
    const view = emptyStateFor({ ...base, isSet: true, emptiedByRefresh: true });
    expect(view.headline).toBe("This Set is empty.");
    expect(view.hint).toMatch(/last refresh removed them/);
  });

  it("still says Collection for a Collection", () => {
    expect(emptyStateFor(base).headline).toBe("This Collection is empty.");
  });
});

describe("the refresh warning (DEC-011, PREP-02)", () => {
  it("counts a Set's tracks as its own kind, from the engine's references", () => {
    const warning = referenceWarning({
      references: REFERENCES,
    } as unknown as Parameters<typeof referenceWarning>[0])!;
    expect(warning).toBe(
      "1 track you are about to remove carries your own work: 1 in 1 Collection, 1 in 1 Set. " +
        "Removing it removes that too.",
    );
  });
});

describe("Add to Set, as a batch", () => {
  const action = {
    kind: "add_to_collection" as const,
    value: FRIDAY.id,
    target: "Friday",
    holder: "set" as const,
  };

  it("reports what was added and what was already there, from the engine's result", () => {
    expect(batchSummary(action, ADDED_TO_SET)).toBe(
      "Added 1 track to “Friday” — 1 were already there.",
    );
  });

  it("says there is no undo for a Set, not for a Collection", () => {
    expect(batchSummary(action, { ...ADDED_TO_SET, changed: 40 })).toBe(
      "Added 40 tracks to “Friday” — 1 were already there. There is no undo for Set changes.",
    );
    expect(batchConsequence("add_to_collection", "set")).toBe(
      "It runs in the background, and there is no undo: adding tracks to or removing them from a Set cannot be reverted.",
    );
    expect(batchConsequence("add_to_collection")).toMatch(/from a Collection cannot be reverted/);
  });

  it("is said of both in Activity, which does not record which it was", () => {
    expect(MEMBERSHIP_REVERT_REASON).toMatch(/from a Collection or a Set cannot be reverted/);
  });
});

describe("the operations list", () => {
  const handlers = {
    onAddToCollection: noop,
    onRemoveFromCollection: noop,
    onAddTag: noop,
    onRemoveTag: noop,
    onRate: noop,
    onFavorite: noop,
  };

  it("offers Add to Set right after Add to Collection", () => {
    const ids = organizationMenuItems(
      { count: 2, collection: null },
      { ...handlers, onAddToSet: noop },
    ).map((item) => item.id);
    expect(ids.slice(0, 3)).toEqual(["add-to-collection", "add-to-set", "add-tag"]);
  });

  it("offers nothing new where no Set can be chosen", () => {
    const ids = organizationMenuItems({ count: 2, collection: null }, handlers).map(
      (item) => item.id,
    );
    expect(ids).not.toContain("add-to-set");
  });
});

describe("New Set from…", () => {
  const collection: NewSetSource = { kind: "collection", id: WARMUP.id, name: "Warm-up", parentId: null };
  const smart: NewSetSource = { kind: "smart", id: SMART.id, name: "Ada", parentId: null };
  const playlist: NewSetSource = { kind: "playlist", id: 2, name: "Sunday", parentId: null };

  it("sends a Collection and a Smart Collection as the node they are, and a playlist as one", () => {
    expect(setSourceOf(collection)).toEqual({ kind: "collection", id: WARMUP.id });
    expect(setSourceOf(smart)).toEqual({ kind: "collection", id: SMART.id });
    expect(setSourceOf(playlist)).toEqual({ kind: "playlist", id: 2 });
  });

  it("says what a copy means for each source", () => {
    expect(newSetFromExplanation(collection)).toBe(
      "The Set starts with the tracks in “Warm-up”, in its order and with any repeats, as one chapter. " +
        "It is a copy: “Warm-up” stays as it is, and changing either one leaves the other alone.",
    );
    expect(newSetFromExplanation(smart)).toBe(
      "The Set starts with the tracks “Ada” matches right now, in its saved order, as one chapter. " +
        "It is a copy: a track that starts matching later joins “Ada” and not the Set.",
    );
    expect(newSetFromExplanation(playlist)).toBe(
      "The Set starts with the tracks in the Rekordbox playlist “Sunday”, in its order, as one chapter. " +
        "It is a copy: refreshing from Rekordbox never changes the Set.",
    );
  });

  it("says what was made, repeats counted, from the engine's answer", () => {
    expect(
      newSetMadeLine(CREATED_FROM_COLLECTION.set.name, CREATED_FROM_COLLECTION.track_count),
    ).toBe("Made the Set “Warm-up” with 3 entries.");
    expect(newSetMadeLine("One", 1)).toBe("Made the Set “One” with 1 entry.");
  });
});

describe("Clean's scope picker", () => {
  it("offers a Set as a scope, labelled, and a folder not at all", () => {
    const options = scopeOptions([], TREE);
    const friday = options.find((option) => option.value === `collection:${FRIDAY.id}`);
    expect(friday).toMatchObject({ disabled: false });
    expect(friday?.label.trim()).toBe("Friday (Set)");
    const warmup = options.find((option) => option.value === `collection:${WARMUP.id}`);
    expect(warmup?.label.trim()).toBe("Warm-up");
    expect(options.find((option) => option.value === `folder:${GIGS.id}`)?.disabled).toBe(true);
  });
});
