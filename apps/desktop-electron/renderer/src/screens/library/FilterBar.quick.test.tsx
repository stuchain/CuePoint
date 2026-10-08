/**
 * The filter row's new parts (PAGES-05B): the Field list grouped by the engine's
 * groups (LIB-7), the Key, BPM and Genre quick filters (FLW-4), and "In
 * playlist" (FLW-7).
 */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type {
  FilterRuleSet,
  LibraryFilterVocabulary,
  LibraryQuickFacets,
} from "../../api/cuepointBridge.types";
import { FilterBar, type FilterSourceOption } from "./FilterBar";

const field = (
  name: string,
  label: string,
  group: string,
  type: LibraryFilterVocabulary["fields"][number]["type"] = "text",
  operators: string[] = ["is", "any_of", "is_empty"],
) => ({
  name,
  type,
  label,
  group,
  facetable: false,
  unit: null,
  integer: false,
  operators,
});

/** Fields in the order the engine sends them: one run per group. */
const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    field("title", "Title", "Track"),
    field("key", "Key", "Track"),
    field("bpm", "BPM", "Track", "number", ["between", "gte", "lte", "is_empty"]),
    field("cuepoint_key", "Your key", "Your notes and ratings"),
    field("key_rekordbox", "Key from Rekordbox (not used)", "Rekordbox only"),
    field("match_state", "Beatport match", "Beatport match"),
    field("in_playlist", "In playlist", "Where it is", "source", ["any_of"]),
  ],
  operators: {
    is: { arity: "single" },
    gte: { arity: "single" },
    lte: { arity: "single" },
    between: { arity: "pair" },
    any_of: { arity: "list" },
    is_empty: { arity: "none" },
  },
  facetable: [],
  sortable: ["artist"],
};

const FACETS: LibraryQuickFacets = {
  keys: [
    { value: "2A", count: 7 },
    { value: "8A", count: 12 },
    { value: "10A", count: 3 },
  ],
  no_key: 5,
  bpm: { min: 95, max: 128, missing: 1 },
  genres: [
    { value: "House", count: 1204 },
    { value: "Techno", count: 380 },
  ],
  genres_total: 40,
  genres_truncated: true,
};

const SOURCES: FilterSourceOption[] = [
  { kind: "playlist", id: 3, name: "Warm-up", depth: 0 },
  { kind: "collection", id: 9, name: "Crate", depth: 0 },
  { kind: "set", id: 11, name: "Friday", depth: 0 },
];

/** The bar holding its own rules, as the Library page does. */
function Harness({
  quickFacets = FACETS,
  initial = null,
  onChange,
  onMatchTracks,
  onOpenKeys,
  onRequest = () => {},
}: {
  quickFacets?: LibraryQuickFacets | null;
  initial?: FilterRuleSet | null;
  onChange?: (next: FilterRuleSet | null) => void;
  onMatchTracks?: () => void;
  onOpenKeys?: () => void;
  onRequest?: () => void;
}) {
  const [filters, setFilters] = useState<FilterRuleSet | null>(initial);
  return (
    <FilterBar
      vocabulary={VOCABULARY}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next);
        onChange?.(next);
      }}
      query=""
      onQueryChange={() => {}}
      sources={SOURCES}
      names={{
        source: new Map([
          ["playlist:3", "Warm-up"],
          ["collection:9", "Crate"],
          ["set:11", "Friday (Set)"],
        ]),
      }}
      quickFacets={quickFacets}
      onRequestQuickFacets={onRequest}
      onMatchTracks={onMatchTracks}
      onOpenKeys={onOpenKeys}
    />
  );
}

describe("the Field list is grouped by the engine's groups (LIB-7)", () => {
  it("draws one option group per group the engine sent, in its order", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));

    const select = screen.getByLabelText("Field");
    const groups = Array.from(select.querySelectorAll("optgroup")).map((group) => ({
      label: group.label,
      options: Array.from(group.querySelectorAll("option")).map((option) => option.textContent),
    }));

    expect(groups).toEqual([
      { label: "Track", options: ["Title", "Key", "BPM"] },
      { label: "Your notes and ratings", options: ["Your key"] },
      { label: "Rekordbox only", options: ["Key from Rekordbox (not used)"] },
      { label: "Beatport match", options: ["Beatport match"] },
      { label: "Where it is", options: ["In playlist"] },
    ]);
  });

  it("draws a field list with no groups as it always did", () => {
    const flat: LibraryFilterVocabulary = {
      ...VOCABULARY,
      fields: VOCABULARY.fields.map(({ group: _group, ...rest }) => rest),
    };
    render(
      <FilterBar
        vocabulary={flat}
        filters={null}
        onFiltersChange={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(screen.getByLabelText("Field").querySelectorAll("optgroup")).toHaveLength(0);
    expect(within(screen.getByLabelText("Field")).getAllByRole("option")).toHaveLength(7);
  });
});

describe("the quick filters (FLW-4)", () => {
  it("sit in the row after Search: Key, BPM, Genre, then Add filter", () => {
    render(<Harness />);
    const names = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.replace(/\s+/g, " ").trim())
      .filter((text) => text && ["Key ▾", "BPM ▾", "Genre ▾", "Add filter"].includes(text));
    expect(names).toEqual(["Key ▾", "BPM ▾", "Genre ▾", "Add filter"]);
  });

  it("are not drawn where nobody asked for them", () => {
    render(
      <FilterBar
        vocabulary={VOCABULARY}
        filters={null}
        onFiltersChange={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Key ▾" })).toBeNull();
  });

  it("asks the engine for the view when a dropdown opens", () => {
    const onRequest = vi.fn();
    render(<Harness onRequest={onRequest} />);
    expect(onRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("lists the keys with their counts and No Beatport key as its own line", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    const list = within(screen.getByRole("dialog", { name: "Key" }));
    const lines = list.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent);
    expect(lines).toEqual(["2A7", "8A12", "10A3", "No Beatport key: 5"]);
  });

  it("turns a choice into a chip, and a second into one 'any of' chip", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^8A/ }));

    expect(onChange).toHaveBeenLastCalledWith({
      match: "all",
      rules: [{ field: "key", operator: "is", value: "8A" }],
    });
    const chips = screen.getByRole("list", { name: "Active filters" });
    expect(within(chips).getByText("Key is 8A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^2A/ }));
    expect(within(chips).getByText("Key is any of 8A, 2A")).toBeInTheDocument();
    expect(within(chips).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows what the rules already choose as ticked", () => {
    render(
      <Harness
        initial={{ match: "all", rules: [{ field: "key", operator: "is", value: "8a" }] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key 1 ▾" }));
    expect(screen.getByRole("checkbox", { name: /^8A/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^2A/ })).not.toBeChecked();
  });

  it("makes 'No Beatport key' an ordinary 'is empty' chip", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "No Beatport key: 5" }));
    expect(screen.getByText("Key is empty")).toBeInTheDocument();
  });

  /** The whole library's Key answer, which the empty Key list is told apart by. */
  function libraryKeys(values: Array<{ value: string | null; count: number }>) {
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getLibraryFacet: vi.fn().mockResolvedValue({
        field: "key",
        values,
        truncated: false,
        total_values: values.length,
        range: null,
      }),
    };
  }

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  it("says keys come from matching when no track has one, with Match tracks…", async () => {
    libraryKeys([{ value: null, count: 40 }]);
    const onMatchTracks = vi.fn();
    render(
      <Harness
        quickFacets={{ ...FACETS, keys: [], no_key: 40 }}
        onMatchTracks={onMatchTracks}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "Key" }));
    expect(
      await panel.findByText("No tracks have a Beatport key yet. Keys come from matching."),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: "Match tracks…" }));
    expect(onMatchTracks).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Key" })).toBeNull();
  });

  it("says only this view has no key when the library has some", async () => {
    libraryKeys([
      { value: "8A", count: 12 },
      { value: null, count: 28 },
    ]);
    const answer = (window as unknown as { cuepoint: { getLibraryFacet: unknown } }).cuepoint;
    render(
      <Harness quickFacets={{ ...FACETS, keys: [], no_key: 4 }} onMatchTracks={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "Key" }));
    expect(await panel.findByText("No track here has a Beatport key.")).toBeInTheDocument();
    await waitFor(() => expect(answer.getLibraryFacet).toHaveBeenCalled());
    expect(panel.queryByText(/Keys come from matching/)).toBeNull();
    expect(panel.queryByRole("button", { name: "Match tracks…" })).toBeNull();
  });

  it("offers the view's BPM range as two boxes and Apply", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "BPM ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "BPM" }));
    expect(panel.getByText("This view runs from 95 to 128 BPM.")).toBeInTheDocument();
    expect(panel.getByLabelText("From")).toHaveAttribute("placeholder", "95");
    expect(panel.getByLabelText("To")).toHaveAttribute("placeholder", "128");

    fireEvent.change(panel.getByLabelText("From"), { target: { value: "122" } });
    fireEvent.change(panel.getByLabelText("To"), { target: { value: "126" } });
    fireEvent.click(panel.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenLastCalledWith({
      match: "all",
      rules: [{ field: "bpm", operator: "between", value: [122, 126] }],
    });
    expect(screen.getByText("BPM is between 122 and 126")).toBeInTheDocument();
  });

  it("will not apply a BPM that is not a number", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "BPM ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "BPM" }));
    fireEvent.change(panel.getByLabelText("From"), { target: { value: "fast" } });
    expect(panel.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(panel.getByRole("alert")).toHaveTextContent("BPM takes numbers.");
  });

  it("lists the genres with counts and says when it is only the most common", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Genre ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "Genre" }));
    expect(panel.getByText(/The 2 most common of 40/)).toBeInTheDocument();
    fireEvent.click(panel.getByRole("checkbox", { name: /^Techno/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      match: "all",
      rules: [{ field: "genre", operator: "is", value: "Techno" }],
    });
  });

  it("closes on Escape and shows how many choices a button holds", () => {
    render(
      <Harness
        initial={{
          match: "all",
          rules: [{ field: "key", operator: "any_of", value: ["8A", "9A"] }],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Key 2 ▾" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Key 2 ▾" }));
    expect(screen.getByRole("dialog", { name: "Key" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Key" })).toBeNull();
  });
});

describe("the row's end", () => {
  it("offers Clear all filters while there are any, and Save beside it", () => {
    render(
      <FilterBar
        vocabulary={VOCABULARY}
        filters={{ match: "all", rules: [{ field: "key", operator: "is", value: "8A" }] }}
        onFiltersChange={() => {}}
        query=""
        onQueryChange={() => {}}
        onSaveSmart={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as Smart Collection…" })).toBeInTheDocument();
  });

  it("keeps the chips in the same row as the search box", () => {
    render(
      <Harness
        initial={{ match: "all", rules: [{ field: "key", operator: "is", value: "8A" }] }}
      />,
    );
    const row = screen.getByLabelText("Search").closest(".cp-filter-bar__row");
    expect(row).toContainElement(screen.getByRole("list", { name: "Active filters" }));
  });
});

describe("In playlist (FLW-7)", () => {
  function pick(...names: string[]) {
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "in_playlist" } });
    for (const name of names) fireEvent.click(screen.getByRole("checkbox", { name }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
  }

  it("is a list of playlists, Collections and Sets, under their own headings", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add filter" }));
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "in_playlist" } });
    const list = within(screen.getByRole("group", { name: "In playlist — choose any" }));
    expect(list.getByText("Rekordbox playlists")).toBeInTheDocument();
    expect(list.getByText("Collections")).toBeInTheDocument();
    expect(list.getByText("Sets")).toBeInTheDocument();
    expect(screen.getByLabelText("Rule")).toHaveValue("any_of");
  });

  it("builds one rule naming every ticked source by kind and id", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pick("Warm-up", "Crate", "Friday");
    expect(onChange).toHaveBeenLastCalledWith({
      match: "all",
      rules: [
        {
          field: "in_playlist",
          operator: "any_of",
          value: [
            { kind: "playlist", id: 3 },
            { kind: "collection", id: 9 },
            { kind: "set", id: 11 },
          ],
        },
      ],
    });
    expect(screen.getByText("In playlist is any of Warm-up, Crate, Friday (Set)")).toBeInTheDocument();
  });

  it("will not add a rule with nothing ticked", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pick();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("the Key list's link to the Keys page (PAGES-16)", () => {
  it("offers 'See these on the Keys page' under the keys, and opens the page", () => {
    const onOpenKeys = vi.fn();
    render(<Harness onOpenKeys={onOpenKeys} />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    const panel = within(screen.getByRole("dialog", { name: "Key" }));
    fireEvent.click(panel.getByRole("button", { name: "See these on the Keys page" }));
    expect(onOpenKeys).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Key" })).toBeNull();
  });

  it("leaves the in-place filter as it was: the ticks are still rules", () => {
    const onChange = vi.fn();
    render(<Harness onOpenKeys={() => {}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /8A/ }));
    expect(onChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "key", operator: "is", value: "8A" }],
    });
  });

  it("is not drawn where the page has no Keys page to open", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Key ▾" }));
    expect(screen.queryByRole("button", { name: "See these on the Keys page" })).toBeNull();
  });
});
