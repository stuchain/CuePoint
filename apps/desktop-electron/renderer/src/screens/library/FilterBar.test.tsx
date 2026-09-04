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
      integer: false,
      operators: ["is", "contains", "any_of", "is_empty"],
    },
    {
      name: "bpm",
      type: "number",
      label: "BPM",
      facetable: false,
      integer: false,
      operators: ["gte", "between", "is_empty"],
    },
    {
      name: "rating",
      type: "number",
      label: "Rating",
      facetable: true,
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

  it("shows a rating as stars while it is typed", () => {
    show();
    openBuilder();
    chooseField("rating");
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "4" } });

    expect(screen.getByText("★★★★")).toBeInTheDocument();
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
    });
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
