/**
 * A field with a fixed set of values is offered as a choice (CLEAN-13).
 *
 * The engine names the values and what each is called; the bar offers them
 * rather than a text box, and a chip reads the name.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { LibraryFilterVocabulary } from "../../api/cuepointBridge.types";
import { FilterBar } from "./FilterBar";
import { buildRule, choicesOf, describeRule, emptyDraft, toggleChoice, withField } from "./filterText";

const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "match_state",
      type: "text",
      label: "Match state",
      facetable: true,
      integer: false,
      unit: null,
      operators: ["is", "is_not", "any_of", "contains"],
      choices: [
        { value: "needs_review", label: "Needs review" },
        { value: "accepted", label: "Accepted" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      name: "genre",
      type: "text",
      label: "Genre",
      facetable: true,
      integer: false,
      unit: null,
      operators: ["is"],
      choices: null,
    },
  ],
  operators: {
    is: { arity: "single" },
    is_not: { arity: "single" },
    any_of: { arity: "list" },
    contains: { arity: "single" },
  },
  facetable: ["match_state", "genre"],
  sortable: [],
};

const state = VOCABULARY.fields[0]!;

describe("the choices, as data", () => {
  it("are the engine's, or none", () => {
    expect(choicesOf(state).map((choice) => choice.value)).toEqual([
      "needs_review",
      "accepted",
      "rejected",
    ]);
    expect(choicesOf(VOCABULARY.fields[1]!)).toEqual([]);
    expect(choicesOf(null)).toEqual([]);
  });

  it("toggle in and out, kept in the engine's order", () => {
    let draft = { ...emptyDraft(VOCABULARY), operator: "any_of" };
    draft = toggleChoice(draft, state, "rejected");
    draft = toggleChoice(draft, state, "needs_review");
    expect(draft.value).toBe("needs_review,rejected");
    draft = toggleChoice(draft, state, "needs_review");
    expect(draft.value).toBe("rejected");
  });

  it("build the rule a chip then names", () => {
    const draft = { ...emptyDraft(VOCABULARY), operator: "any_of", value: "needs_review,accepted" };
    const built = buildRule(VOCABULARY, draft);
    expect(built).toEqual({
      ok: true,
      rule: { field: "match_state", operator: "any_of", value: ["needs_review", "accepted"] },
    });
    if (!built.ok) return;
    expect(describeRule(VOCABULARY, built.rule)).toBe("Match state is any of Needs review, Accepted");
    expect(describeRule(VOCABULARY, { field: "match_state", operator: "is", value: "rejected" })).toBe(
      "Match state is Rejected",
    );
    // A word the engine does not name is shown as it is, not hidden.
    expect(describeRule(VOCABULARY, { field: "match_state", operator: "is", value: "odd" })).toBe(
      "Match state is odd",
    );
  });

  it("clear a value when the field changes to one without them", () => {
    const draft = { ...emptyDraft(VOCABULARY), value: "accepted" };
    expect(withField(VOCABULARY, draft, "genre").value).toBe("accepted");
  });
});

function bar(onFiltersChange = vi.fn(), onRequestFacet = vi.fn()) {
  render(
    <FilterBar
      vocabulary={VOCABULARY}
      filters={null}
      onFiltersChange={onFiltersChange}
      query=""
      onQueryChange={() => undefined}
      total={10}
      onRequestFacet={onRequestFacet}
    />,
  );
  return { onFiltersChange, onRequestFacet };
}

describe("the bar", () => {
  it("offers a choice rather than a text box, and asks for no facet", async () => {
    const { onFiltersChange, onRequestFacet } = bar();
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    const choice = screen.getByRole("combobox", { name: "Match state" });
    expect(within(choice).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose…",
      "Needs review",
      "Accepted",
      "Rejected",
    ]);
    expect(screen.queryByRole("textbox", { name: "Value" })).toBeNull();
    expect(onRequestFacet).not.toHaveBeenCalled();

    await userEvent.selectOptions(choice, "accepted");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "match_state", operator: "is", value: "accepted" }],
    });
  });

  it("offers every value to pick for any of", async () => {
    const { onFiltersChange } = bar();
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Condition" }), "any_of");

    const group = screen.getByRole("group", { name: "Match state — choose any" });
    await userEvent.click(within(group).getByRole("button", { name: "Rejected" }));
    await userEvent.click(within(group).getByRole("button", { name: "Needs review" }));
    expect(within(group).getByRole("button", { name: "Rejected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      match: "all",
      rules: [{ field: "match_state", operator: "any_of", value: ["needs_review", "rejected"] }],
    });
  });

  it("keeps a text box where a part of a word is asked for", async () => {
    bar();
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Condition" }), "contains");
    expect(screen.getByRole("textbox", { name: "Value" })).toBeInTheDocument();
  });

  it("still asks for the values of a field without choices", async () => {
    const { onRequestFacet } = bar();
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Field" }), "genre");
    expect(onRequestFacet).toHaveBeenCalledWith("genre");
  });
});
