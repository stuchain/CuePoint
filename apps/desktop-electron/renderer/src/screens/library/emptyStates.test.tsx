/**
 * Every empty state, rendered from a real engine response (ORG-13).
 *
 * The payloads in `emptyLibrary.fixture.json` are not written here. They are
 * captured by `src/tests/unit/engine/test_empty_state_fixture.py`, which starts
 * the real engine over a real database in each of these states and asserts the
 * file still matches what came back. So these tests fail in two directions: if
 * the renderer stops handling an answer, and if the engine stops giving it.
 *
 * That is the point. An empty state written against a hand-made `{ values: [] }`
 * is a branch that runs, not a branch that happens — and the first assertion
 * this file ever made found the difference: an untagged library does not answer
 * with no rows. It answers with one row saying "no tag, 3 tracks", and the bar's
 * "No tags here yet." had been unreachable since ORG-12 because it counted rows.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type {
  CollectionNode,
  LibraryFacet,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";
import { CollectionsPane } from "./CollectionsPane";
import { FilterBar } from "./FilterBar";
import fixture from "./emptyLibrary.fixture.json";
import { emptyStateFor } from "./libraryEmpty";
import { buildCollectionTree, collectionRows } from "./collectionTree";

/**
 * The fixture is JSON, so it arrives as `any`-shaped data.
 *
 * Cast at the boundary rather than everywhere below, and only ever to the type
 * the bridge already declares for that payload — so a field the engine drops
 * is a type error here rather than an undefined at render time.
 */
const TAG_FACET = fixture.untouched.tag_facet as LibraryFacet;
const COLLECTIONS = fixture.untouched.collections.collections as CollectionNode[];
const SMART = fixture.smart_matches_nothing.collection as CollectionNode;
const REFUSAL = fixture.refused_rule.payload.error.message;

/** A vocabulary with a tag field, which is all the bar needs to draw chips. */
const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "tag",
      type: "tag",
      label: "Tag",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["has_tag", "any_of"],
    },
  ],
  operators: { has_tag: { arity: "single" }, any_of: { arity: "list" } },
  facetable: ["tag"],
  sortable: ["artist"],
};

describe("a library nobody has tagged yet", () => {
  it("says so rather than drawing an empty row of chips", () => {
    // The engine's real answer: one row, for the tracks that carry no tag.
    expect(TAG_FACET.values).toHaveLength(1);
    expect(TAG_FACET.values[0]!.value).toBeNull();

    render(
      <FilterBar
        vocabulary={VOCABULARY}
        filters={null}
        onFiltersChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        total={3}
        facet={TAG_FACET}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "tag" } });

    expect(screen.getByText("No tags here yet.")).toBeInTheDocument();
  });

  it("offers no chip for the tracks that have no tag", () => {
    // "Untagged" is a row in the facet and not a tag anyone can filter by
    // here; a chip for it would send an id of `null` to the engine.
    render(
      <FilterBar
        vocabulary={VOCABULARY}
        filters={null}
        onFiltersChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        total={3}
        facet={TAG_FACET}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "tag" } });

    const chips = screen.getByRole("group", { name: /^Tags/ });
    expect(chips.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("a library with no Collections", () => {
  it("explains what one is and offers to make the first", () => {
    expect(COLLECTIONS).toEqual([]);

    const tree = buildCollectionTree(COLLECTIONS);
    render(
      <CollectionsPane
        tree={tree}
        rows={collectionRows(tree, [])}
        selected={null}
        status="ready"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onPreviewDelete={vi.fn()}
        onDelete={vi.fn()}
        onDropTracks={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Create your first Collection" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your own list of tracks/)).toBeInTheDocument();
  });
});

describe("a Smart Collection that matches nothing", () => {
  it("shows the rules, because they are the reason", () => {
    // The engine really does answer zero for this saved rule set, and really
    // does hand the rules back with the node.
    expect(fixture.smart_matches_nothing.browse.total).toBe(0);
    const rules = SMART.rules!.rules;
    expect(rules).toHaveLength(1);

    const view = emptyStateFor({
      error: null,
      filtered: false,
      scope: "smart",
      playlistId: null,
      smartName: SMART.name,
      rules: rules.map((rule) => `Genre is ${String(rule.value)}`),
      emptiedByRefresh: false,
    });

    expect(view.headline).toBe("Nothing matches these rules right now.");
    expect(view.rules).toEqual(["Genre is Gabber"]);
    expect(view.hint).toContain(SMART.name);
  });
});

describe("a Collection holding nothing", () => {
  it("invites tracks into it", () => {
    expect(fixture.empty_collection.browse.total).toBe(0);
    expect(fixture.empty_collection.collection.track_count).toBe(0);

    const view = emptyStateFor({
      error: null,
      filtered: false,
      scope: "collection",
      playlistId: null,
      smartName: null,
      rules: [],
      emptiedByRefresh: false,
    });

    expect(view.headline).toBe("This Collection is empty.");
    expect(view.hint).toMatch(/Drop tracks onto it/);
  });

  it("says what happened when a refresh took its tracks", () => {
    const view = emptyStateFor({
      error: null,
      filtered: false,
      scope: "collection",
      playlistId: null,
      smartName: null,
      rules: [],
      emptiedByRefresh: true,
    });

    expect(view.hint).toMatch(/no longer in your Rekordbox export/);
    // The invitation is wrong here: these tracks were not missing, they were
    // taken (DEC-011).
    expect(view.hint).not.toMatch(/Drop tracks onto it/);
  });
});

describe("a rule the engine refused", () => {
  it("reaches the table as the refusal, not as an empty answer", () => {
    // The engine's own words, from its own 400.
    expect(fixture.refused_rule.status).toBe(400);
    expect(REFUSAL).toMatch(/no longer exists/);

    const view = emptyStateFor({
      error: REFUSAL,
      // Everything else would otherwise have an opinion; the refusal outranks
      // all of it, because a refused question has no answer to report.
      filtered: true,
      scope: "smart",
      playlistId: 4,
      smartName: "Closers",
      rules: ["Tag has Peak-time"],
      emptiedByRefresh: true,
    });

    expect(view.headline).toBe(REFUSAL);
    expect(view.rules).toEqual([]);
    expect(view.hint).toBeNull();
  });
});
