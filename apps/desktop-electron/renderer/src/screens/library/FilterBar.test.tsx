/**
 * The filter bar (LIBUI-08, DEC-043).
 *
 * Three properties:
 *
 * **It holds no query.** It is given a rule set and hands one back; it issues
 * no request and knows nothing about the table it narrows. That is what makes
 * it reusable by Phase 6's Smart Collection editor, which saves rules instead
 * of applying them — asserted by rendering it against a rule set it did not
 * build.
 * **It cannot offer a clause the engine would refuse**, because the fields,
 * the operators and their arity all come from the engine's own answer.
 * **The count is the engine's**, never the number of rows in hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";

import type {
  FilterRuleSet,
  LibraryFacet,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";
import { FilterBar } from "./FilterBar";
import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { useFacet, useFilterVocabulary } from "./useFilterVocabulary";

const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "genre",
      type: "text",
      label: "Genre",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["is", "contains", "any_of", "is_empty"],
    },
    {
      name: "bpm",
      type: "number",
      label: "BPM",
      facetable: false,
      unit: null,
      integer: false,
      operators: ["gte", "between", "is_empty"],
    },
    {
      name: "rating",
      type: "number",
      label: "Rating",
      facetable: true,
      unit: "stars",
      integer: true,
      operators: ["gte", "is_empty"],
    },
  ],
  operators: {
    is: { arity: "single" },
    contains: { arity: "single" },
    gte: { arity: "single" },
    between: { arity: "pair" },
    any_of: { arity: "list" },
    is_empty: { arity: "none" },
  },
  facetable: ["genre", "rating"],
  sortable: ["artist", "bpm"],
};

const GENRE_FACET: LibraryFacet = {
  field: "genre",
  values: [
    { value: "Deep House", count: 1204 },
    { value: "Techno", count: 380 },
    { value: null, count: 12 },
  ],
  truncated: false,
  total_values: 3,
  range: null,
};

/** The vocabulary with CuePoint's own three kinds in it (ORG-05, ORG-12). */
const ORGANIZATION_VOCABULARY: LibraryFilterVocabulary = {
  ...VOCABULARY,
  operators: {
    ...VOCABULARY.operators,
    has_tag: { arity: "single" },
    in_collection: { arity: "single" },
  },
  fields: [
    ...VOCABULARY.fields,
    {
      name: "favorite",
      type: "bool",
      label: "Favorite",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["is"],
    },
    {
      name: "tag",
      type: "tag",
      label: "Tag",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["has_tag", "any_of", "is_empty"],
    },
    {
      name: "collection",
      type: "collection",
      label: "Collection",
      facetable: false,
      unit: null,
      integer: false,
      operators: ["in_collection"],
    },
  ],
};

const TAG_FACET: LibraryFacet = {
  field: "tag",
  values: [
    { value: "7", label: "Peak-time", count: 412 },
    { value: "9", label: "Closer", count: 8 },
  ],
  truncated: false,
  total_values: 2,
  range: null,
};

const COLLECTIONS = [
  { id: 2, name: "Sets", depth: 0, selectable: false },
  { id: 4, name: "Closers", depth: 1, selectable: true },
];

function show(
  props: Partial<React.ComponentProps<typeof FilterBar>> = {},
): { onFiltersChange: ReturnType<typeof vi.fn>; onQueryChange: ReturnType<typeof vi.fn> } {
  const onFiltersChange = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <FilterBar
      vocabulary={VOCABULARY}
      filters={null}
      onFiltersChange={onFiltersChange}
      query=""
      onQueryChange={onQueryChange}
      total={0}
      {...props}
    />,
  );
  return { onFiltersChange, onQueryChange };
}

function openBuilder() {
  fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
}

function chooseField(name: string) {
  fireEvent.change(screen.getByLabelText("Field"), { target: { value: name } });
}

function chooseOperator(name: string) {
  fireEvent.change(screen.getByLabelText("Condition"), { target: { value: name } });
}

describe("the search box", () => {
  it("reports what was typed", () => {
    const { onQueryChange } = show();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "deadmau5" } });

    expect(onQueryChange).toHaveBeenCalledWith("deadmau5");
  });

  it("shows the query it is given", () => {
    show({ query: "house" });
    expect(screen.getByLabelText("Search")).toHaveValue("house");
  });
});

describe("the count", () => {
  it("is the engine's number, not a count of rows in hand", () => {
    show({ total: 47913 });
    expect(screen.getByRole("status")).toHaveTextContent("47,913 tracks");
  });

  it("reads properly for one track", () => {
    show({ total: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("1 track");
  });
});

describe("building a clause", () => {
  it("offers only the fields the engine described", () => {
    show();
    openBuilder();

    const options = within(screen.getByLabelText("Field")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Genre",
      "BPM",
      "Rating",
    ]);
  });

  it("offers every field kind the engine describes (ORG-12)", () => {
    // The acceptance criterion, as one assertion: no field the engine offers
    // is missing from the bar. ORG-05 put tag, Collection and favorite rules
    // in the engine and the bar had controls for none of them; it now has all
    // three, so the list is the engine's whole answer.
    show({ vocabulary: ORGANIZATION_VOCABULARY });
    openBuilder();

    const options = within(screen.getByLabelText("Field")).getAllByRole("option");
    expect(options.map((option) => option.getAttribute("value"))).toEqual(
      ORGANIZATION_VOCABULARY.fields.map((entry) => entry.name),
    );
  });

  it("offers only the operators that field allows", () => {
    show();
    openBuilder();
    chooseField("bpm");

    const options = within(screen.getByLabelText("Condition")).getAllByRole("option");
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "gte",
      "between",
      "is_empty",
    ]);
  });

  it("adds a text clause", () => {
    const { onFiltersChange } = show();
    openBuilder();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "genre", operator: "is", value: "House" }],
    });
  });

  it("asks for two values for a range, and only then", () => {
    show();
    openBuilder();
    expect(screen.queryByLabelText("To")).not.toBeInTheDocument();

    chooseField("bpm");
    chooseOperator("between");

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("adds a range", () => {
    const { onFiltersChange } = show();
    openBuilder();
    chooseField("bpm");
    chooseOperator("between");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "128" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "bpm", operator: "between", value: [120, 128] }],
    });
  });

  it("asks for no value at all for an emptiness clause", () => {
    const { onFiltersChange } = show();
    openBuilder();
    chooseOperator("is_empty");
    expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "genre", operator: "is_empty" }],
    });
  });

  it("keeps the clauses already there", () => {
    const existing: FilterRuleSet = {
      match: "all",
      rules: [{ field: "bpm", operator: "gte", value: 128 }],
    };
    const { onFiltersChange } = show({ filters: existing });
    openBuilder();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onFiltersChange.mock.calls[0]![0].rules).toHaveLength(2);
  });

  it("says why a clause could not be added, rather than doing nothing", () => {
    const { onFiltersChange } = show();
    openBuilder();
    chooseField("bpm");
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "fast" } });

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent("BPM takes numbers");
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it("closes the builder once a clause is added", () => {
    show();
    openBuilder();
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.queryByLabelText("Condition")).not.toBeInTheDocument();
  });

  it("switches the operator when the new field cannot use it", () => {
    show();
    openBuilder();
    chooseOperator("contains");

    chooseField("bpm");

    expect(screen.getByLabelText("Condition")).toHaveValue("gte");
  });
});

describe("the values a field takes", () => {
  it("asks for them when a facetable field is chosen", () => {
    const onRequestFacet = vi.fn();
    show({ onRequestFacet });

    openBuilder();

    expect(onRequestFacet).toHaveBeenCalledWith("genre");
  });

  it("does not ask for a field that has no useful values", () => {
    const onRequestFacet = vi.fn();
    show({ onRequestFacet });
    openBuilder();
    onRequestFacet.mockClear();

    chooseField("bpm");

    expect(onRequestFacet).not.toHaveBeenCalled();
  });

  it("offers them with their counts", () => {
    show({ facet: GENRE_FACET });
    openBuilder();

    const options = document.querySelectorAll("#cp-filter-values option");
    expect(options).toHaveLength(3);
    expect(options[0]!.getAttribute("label")).toBe("Deep House — 1,204");
  });

  it("shows the range of a number field", () => {
    show({
      facet: {
        field: "bpm",
        values: [],
        truncated: false,
        total_values: 0,
        range: { field: "bpm", min: 95, max: 128, missing: 4 },
      },
    });
    openBuilder();
    chooseField("bpm");

    expect(screen.getByText("95 – 128")).toBeInTheDocument();
  });

  it("ignores a facet for a different field", () => {
    show({ facet: GENRE_FACET });
    openBuilder();
    chooseField("bpm");

    expect(document.querySelector("#cp-filter-values")).toBeNull();
  });

  it("shows a rating as stars rather than as a number to type (ORG-12)", () => {
    show();
    openBuilder();
    chooseField("rating");

    const four = screen.getByRole("button", { name: "★★★★" });
    fireEvent.click(four);
    expect(four).toHaveAttribute("aria-pressed", "true");
  });
});

describe("active clauses", () => {
  const filters: FilterRuleSet = {
    match: "all",
    rules: [
      { field: "genre", operator: "is", value: "House" },
      { field: "bpm", operator: "between", value: [120, 128] },
    ],
  };

  it("renders a rule set it did not build", () => {
    // The reuse guard Phase 6 depends on: the bar is given rules and shows
    // them, whoever made them.
    show({ filters });

    expect(screen.getByText("Genre is House")).toBeInTheDocument();
    expect(screen.getByText("BPM is between 120 and 128")).toBeInTheDocument();
  });

  it("removes the first and leaves the rest", () => {
    const { onFiltersChange } = show({ filters });

    fireEvent.click(screen.getByRole("button", { name: "Remove filter: Genre is House" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "bpm", operator: "between", value: [120, 128] }],
    });
  });

  it("removes the one that was clicked, not the first", () => {
    // The chip's index is what identifies it; a removal that always took the
    // first clause would look right until a user removed the second.
    const { onFiltersChange } = show({ filters });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove filter: BPM is between 120 and 128" }),
    );

    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "genre", operator: "is", value: "House" }],
    });
  });

  it("clears them all at once", () => {
    const { onFiltersChange } = show({ filters });

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onFiltersChange).toHaveBeenCalledWith(null);
  });

  it("offers nothing to clear when nothing is filtered", () => {
    show();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("shows no chips when nothing is filtered", () => {
    show();
    expect(screen.queryByLabelText("Active filters")).not.toBeInTheDocument();
  });
});

describe("before the vocabulary arrives", () => {
  it("still renders, and offers nothing it cannot back up", () => {
    render(
      <FilterBar
        vocabulary={null}
        filters={null}
        onFiltersChange={vi.fn()}
        query=""
        onQueryChange={vi.fn()}
        total={0}
      />,
    );
    openBuilder();

    expect(within(screen.getByLabelText("Field")).queryAllByRole("option")).toHaveLength(0);
  });
});

describe("the hooks behind it", () => {
  let getLibraryFilterFields: ReturnType<typeof vi.fn>;
  let getLibraryFacet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getLibraryFilterFields = vi.fn(async () => VOCABULARY);
    getLibraryFacet = vi.fn(async () => GENRE_FACET);
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getLibraryFilterFields,
      getLibraryFacet,
    };
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    vi.restoreAllMocks();
  });

  it("fetches the vocabulary once", async () => {
    const { result } = renderHook(() => useFilterVocabulary());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.vocabulary?.fields).toHaveLength(3);
    expect(getLibraryFilterFields).toHaveBeenCalledTimes(1);
  });

  it("says when the vocabulary could not be read", async () => {
    getLibraryFilterFields.mockRejectedValueOnce(new Error("Engine offline"));

    const { result } = renderHook(() => useFilterVocabulary());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Engine offline");
  });

  it("says when there is no bridge", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    const { result } = renderHook(() => useFilterVocabulary());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("asks for a facet scoped by the current view", async () => {
    const query = {
      ...DEFAULT_LIBRARY_QUERY,
      q: "deadmau5",
      playlistId: 7,
      filters: { match: "all" as const, rules: [{ field: "bpm", operator: "gte", value: 128 }] },
    };
    const { result } = renderHook(() => useFacet(query));

    act(() => result.current.load("genre"));

    await waitFor(() => expect(result.current.facet).not.toBeNull());
    expect(getLibraryFacet).toHaveBeenCalledWith({
      field: "genre",
      q: "deadmau5",
      playlistId: 7,
      filters: query.filters,
      collectionId: null,
    });
  });

  it("asks for a facet scoped by the Collection the table is in (ORG-12)", async () => {
    // A tag list inside a Collection has to offer the tags that Collection's
    // tracks carry. The library's would offer one that empties the table the
    // moment it is chosen.
    const query = {
      ...DEFAULT_LIBRARY_QUERY,
      scope: "collection" as const,
      collectionId: 4,
    };
    const { result } = renderHook(() => useFacet(query));

    act(() => result.current.load("tag"));

    await waitFor(() => expect(result.current.facet).not.toBeNull());
    expect(getLibraryFacet).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "collection", collectionId: 4 }),
    );
  });

  it("re-reads a facet when the table moves to another scope", async () => {
    // The callback closes over the query. One that did not list the scope in
    // its dependencies would keep answering for the Collection the user left,
    // which is the same bug as not passing the scope at all and harder to see.
    const { result, rerender } = renderHook(({ query }) => useFacet(query), {
      initialProps: { query: DEFAULT_LIBRARY_QUERY },
    });

    act(() => result.current.load("genre"));
    await waitFor(() => expect(result.current.facet).not.toBeNull());

    rerender({
      query: { ...DEFAULT_LIBRARY_QUERY, scope: "collection" as const, collectionId: 4 },
    });
    act(() => result.current.load("genre"));

    await waitFor(() => expect(getLibraryFacet).toHaveBeenCalledTimes(2));
    expect(getLibraryFacet.mock.calls[1][0]).toMatchObject({
      scope: "collection",
      collectionId: 4,
    });
  });

  it("leaves the scope out when the table is in none", async () => {
    const { result } = renderHook(() => useFacet(DEFAULT_LIBRARY_QUERY));

    act(() => result.current.load("genre"));

    await waitFor(() => expect(result.current.facet).not.toBeNull());
    expect("scope" in getLibraryFacet.mock.calls[0][0]).toBe(false);
  });

  it("asks for nothing until a field is chosen", () => {
    renderHook(() => useFacet(DEFAULT_LIBRARY_QUERY));
    expect(getLibraryFacet).not.toHaveBeenCalled();
  });

  it("says when a facet could not be read", async () => {
    getLibraryFacet.mockRejectedValueOnce(new Error("Engine offline"));
    const { result } = renderHook(() => useFacet(DEFAULT_LIBRARY_QUERY));

    act(() => result.current.load("genre"));

    await waitFor(() => expect(result.current.error).toBe("Engine offline"));
    expect(result.current.loading).toBe(false);
  });

  it("forgets a facet when asked to", async () => {
    const { result } = renderHook(() => useFacet(DEFAULT_LIBRARY_QUERY));
    act(() => result.current.load("genre"));
    await waitFor(() => expect(result.current.facet).not.toBeNull());

    act(() => result.current.clear());

    expect(result.current.facet).toBeNull();
  });
});

describe("the controls CuePoint's own fields need (ORG-12)", () => {
  const openOn = (field: string, props = {}) => {
    const handles = show({ vocabulary: ORGANIZATION_VOCABULARY, ...props });
    openBuilder();
    chooseField(field);
    return handles;
  };

  describe("a favorite", () => {
    it("is chosen rather than typed", () => {
      openOn("favorite");
      expect(screen.getByLabelText("Favorite").tagName).toBe("SELECT");
    });

    it("adds a clause whose value is a boolean, not the word", () => {
      const { onFiltersChange } = openOn("favorite");
      fireEvent.change(screen.getByLabelText("Favorite"), { target: { value: "true" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "favorite", operator: "is", value: true }],
      });
    });

    it("offers 'no' as well, which is a question of its own", () => {
      const { onFiltersChange } = openOn("favorite");
      fireEvent.change(screen.getByLabelText("Favorite"), { target: { value: "false" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "favorite", operator: "is", value: false }],
      });
    });
  });

  describe("a tag", () => {
    it("is chosen from the facet, by name", () => {
      // The rule carries the id because a rule has to survive a rename; the
      // chip a user clicks carries the name, because nobody knows an id.
      openOn("tag", { facet: TAG_FACET });
      expect(screen.getByRole("button", { name: /Peak-time/ })).toBeInTheDocument();
    });

    it("shows how many tracks carry each one", () => {
      openOn("tag", { facet: TAG_FACET });
      expect(screen.getByRole("button", { name: /Peak-time/ })).toHaveTextContent("412");
    });

    it("adds a clause carrying the id, not the name", () => {
      const { onFiltersChange } = openOn("tag", { facet: TAG_FACET });
      fireEvent.click(screen.getByRole("button", { name: /Peak-time/ }));
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "tag", operator: "has_tag", value: 7 }],
      });
    });

    it("says which chip is chosen", () => {
      openOn("tag", { facet: TAG_FACET });
      fireEvent.click(screen.getByRole("button", { name: /Peak-time/ }));
      expect(screen.getByRole("button", { name: /Peak-time/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: /Closer/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    it("holds one at a time for an operator that takes one", () => {
      const { onFiltersChange } = openOn("tag", { facet: TAG_FACET });
      fireEvent.click(screen.getByRole("button", { name: /Peak-time/ }));
      fireEvent.click(screen.getByRole("button", { name: /Closer/ }));
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "tag", operator: "has_tag", value: 9 }],
      });
    });

    it("collects several for an operator that takes a list", () => {
      const { onFiltersChange } = openOn("tag", { facet: TAG_FACET });
      chooseOperator("any_of");
      fireEvent.click(screen.getByRole("button", { name: /Peak-time/ }));
      fireEvent.click(screen.getByRole("button", { name: /Closer/ }));
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "tag", operator: "any_of", value: [7, 9] }],
      });
    });

    it("asks for no value at all when the operator takes none", () => {
      const { onFiltersChange } = openOn("tag", { facet: TAG_FACET });
      chooseOperator("is_empty");
      expect(screen.queryByRole("button", { name: /Peak-time/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "tag", operator: "is_empty" }],
      });
    });

    it("says there are none rather than showing an empty row", () => {
      openOn("tag");
      expect(screen.getByText("No tags here yet.")).toBeInTheDocument();
    });

    it("does not put tag ids in the text suggestions", () => {
      // A datalist of "7" and "9" attached to nothing at all.
      openOn("tag", { facet: TAG_FACET });
      expect(document.querySelector("#cp-filter-values")).toBeNull();
    });

    it("does not buy a pass over the library for a yes-or-no control", () => {
      // A favorite is facetable — "how many tracks are starred" is a real
      // question — and its control has nowhere to put the answer.
      const onRequestFacet = vi.fn();
      show({ vocabulary: ORGANIZATION_VOCABULARY, onRequestFacet });
      openBuilder();
      onRequestFacet.mockClear();
      chooseField("favorite");
      expect(onRequestFacet).not.toHaveBeenCalled();
    });

    it("still asks for the values of a field whose control shows them", () => {
      const onRequestFacet = vi.fn();
      show({ vocabulary: ORGANIZATION_VOCABULARY, onRequestFacet });
      openBuilder();
      chooseField("tag");
      expect(onRequestFacet).toHaveBeenCalledWith("tag");
    });

    it("leaves the other tags choosable once one is chosen", () => {
      // The facet is computed over every filter except this field's own, so
      // choosing one tag must not empty the row it was chosen from.
      const handles = show({ vocabulary: ORGANIZATION_VOCABULARY, facet: TAG_FACET });
      openBuilder();
      chooseField("tag");
      fireEvent.click(screen.getByRole("button", { name: /Peak-time/ }));
      expect(screen.getByRole("button", { name: /Closer/ })).toBeEnabled();
      expect(handles).toBeDefined();
    });
  });

  describe("a Collection", () => {
    it("is chosen from the tree", () => {
      openOn("collection", { collections: COLLECTIONS });
      const options = within(screen.getByLabelText("Collection")).getAllByRole("option");
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        "Choose…",
        "Sets",
        "Closers",
      ]);
    });

    it("draws a folder and refuses to let it be chosen", () => {
      // A folder holds nodes, not tracks. A tree with its folders removed is a
      // list whose indentation lies.
      openOn("collection", { collections: COLLECTIONS });
      const options = within(screen.getByLabelText("Collection")).getAllByRole("option");
      expect(options[1]).toBeDisabled();
      expect(options[2]).not.toBeDisabled();
    });

    it("adds a clause carrying the id", () => {
      const { onFiltersChange } = openOn("collection", { collections: COLLECTIONS });
      fireEvent.change(screen.getByLabelText("Collection"), { target: { value: "4" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "collection", operator: "in_collection", value: 4 }],
      });
    });

    it("says so rather than sending nothing when none was chosen", () => {
      const { onFiltersChange } = openOn("collection", { collections: COLLECTIONS });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("Choose a collection");
    });
  });

  describe("a rating", () => {
    it("is chosen in stars rather than typed as a number", () => {
      openOn("rating");
      expect(screen.getByRole("button", { name: "★★★★" })).toBeInTheDocument();
    });

    it("offers unrated as one of the choices", () => {
      openOn("rating");
      expect(screen.getByRole("button", { name: "unrated" })).toBeInTheDocument();
    });

    it("adds the number behind the stars", () => {
      const { onFiltersChange } = openOn("rating");
      fireEvent.click(screen.getByRole("button", { name: "★★★★" }));
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      expect(onFiltersChange).toHaveBeenCalledWith({
        match: "all",
        rules: [{ field: "rating", operator: "gte", value: 4 }],
      });
    });

    it("draws stars for any layer the engine calls stars, not for `rating` alone", () => {
      // DEC-057's two layers. The bar holds no list of their names.
      show({
        vocabulary: {
          ...ORGANIZATION_VOCABULARY,
          fields: [
            {
              name: "cuepoint_rating",
              type: "number",
              label: "CuePoint rating",
              facetable: false,
              unit: "stars",
              integer: true,
              operators: ["gte"],
            },
          ],
        },
      });
      openBuilder();
      expect(screen.getByRole("button", { name: "★★★★★" })).toBeInTheDocument();
    });

    it("types a number for a field the engine gave no unit", () => {
      openOn("bpm");
      expect(screen.getByLabelText("Value")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "★★★★" })).not.toBeInTheDocument();
    });
  });

  describe("reading the chips back", () => {
    it("names a tag rather than showing the id the rule carries", () => {
      show({
        vocabulary: ORGANIZATION_VOCABULARY,
        filters: { match: "all", rules: [{ field: "tag", operator: "has_tag", value: 7 }] },
        names: { tag: new Map([[7, "Peak-time"]]) },
      });
      expect(screen.getByText("Tag has Peak-time")).toBeInTheDocument();
    });

    it("names a Collection the same way", () => {
      show({
        vocabulary: ORGANIZATION_VOCABULARY,
        filters: {
          match: "all",
          rules: [{ field: "collection", operator: "in_collection", value: 4 }],
        },
        names: { collection: new Map([[4, "Closers"]]) },
      });
      expect(screen.getByText("Collection is in Closers")).toBeInTheDocument();
    });
  });
});

describe("saving what was narrowed (ORG-12)", () => {
  const HOUSE: FilterRuleSet = {
    match: "all",
    rules: [{ field: "genre", operator: "is", value: "House" }],
  };
  const HOUSE_AND_FAST: FilterRuleSet = {
    match: "all",
    rules: [...HOUSE.rules, { field: "bpm", operator: "gte", value: 128 }],
  };
  const SMART = { id: 4, name: "Closers", saved: HOUSE };

  it("offers to save a rule set that is not already a Collection's", () => {
    const onSaveSmart = vi.fn();
    show({ filters: HOUSE, onSaveSmart });
    fireEvent.click(screen.getByRole("button", { name: "Save as Smart Collection…" }));
    expect(onSaveSmart).toHaveBeenCalled();
  });

  it("offers nothing to save when there are no rules", () => {
    show({ filters: null, onSaveSmart: vi.fn() });
    expect(screen.queryByRole("button", { name: /Save as/ })).not.toBeInTheDocument();
  });

  it("names the Collection whose rules are on screen", () => {
    show({ filters: HOUSE, smart: SMART });
    expect(screen.getByText("Smart Collection “Closers”")).toBeInTheDocument();
  });

  it("offers no update while the rules are still what was saved", () => {
    show({ filters: HOUSE, smart: SMART, onUpdateSmart: vi.fn() });
    expect(screen.queryByRole("button", { name: /Update/ })).not.toBeInTheDocument();
  });

  it("says it is modified once the rules differ", () => {
    show({ filters: HOUSE_AND_FAST, smart: SMART });
    expect(screen.getByText(/modified/)).toBeInTheDocument();
  });

  it("offers to update the Collection, by name", () => {
    const onUpdateSmart = vi.fn();
    show({ filters: HOUSE_AND_FAST, smart: SMART, onUpdateSmart });
    fireEvent.click(screen.getByRole("button", { name: "Update “Closers”" }));
    expect(onUpdateSmart).toHaveBeenCalled();
  });

  it("offers to keep the rules as a plain filter instead", () => {
    // Narrowing a saved question is a thing people do all day. Rewriting one
    // is a thing they do deliberately, and neither is the obvious default.
    const onDetachSmart = vi.fn();
    show({ filters: HOUSE_AND_FAST, smart: SMART, onDetachSmart });
    fireEvent.click(screen.getByRole("button", { name: "Keep as a filter" }));
    expect(onDetachSmart).toHaveBeenCalled();
  });

  it("does not write anything by itself", () => {
    // The bar holds no query and issues no request; editing a chip while a
    // Smart Collection is open reports the rules and nothing more.
    const onUpdateSmart = vi.fn();
    const { onFiltersChange } = show({
      filters: HOUSE_AND_FAST,
      smart: SMART,
      onUpdateSmart,
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove filter/ })[1]);
    expect(onFiltersChange).toHaveBeenCalled();
    expect(onUpdateSmart).not.toHaveBeenCalled();
  });

  it("offers a second Collection as well as an update, once modified", () => {
    show({
      filters: HOUSE_AND_FAST,
      smart: SMART,
      onSaveSmart: vi.fn(),
      onUpdateSmart: vi.fn(),
    });
    expect(
      screen.getByRole("button", { name: "Save as a new Smart Collection…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update “Closers”" })).toBeInTheDocument();
  });
});

describe("a question the engine refused (ORG-12)", () => {
  it("says what it said, beside the clauses that caused it", () => {
    show({ problem: "Genre cannot be filtered with 'gte'" });
    expect(screen.getByRole("alert")).toHaveTextContent("Genre cannot be filtered");
  });

  it("offers to ask again", () => {
    const onRetry = vi.fn();
    show({ problem: "The engine is not answering", onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("says nothing when there is nothing wrong", () => {
    show();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the tag vocabulary (ORG-12)", () => {
  it("is reachable from the bar that uses it", () => {
    const onManageTags = vi.fn();
    show({ onManageTags });
    fireEvent.click(screen.getByRole("button", { name: "Tags…" }));
    expect(onManageTags).toHaveBeenCalled();
  });

  it("is not offered by a bar that was given no way to open it", () => {
    show();
    expect(screen.queryByRole("button", { name: "Tags…" })).not.toBeInTheDocument();
  });
});
