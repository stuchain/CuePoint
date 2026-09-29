/**
 * What fits at the insertion point, asked of the engine (PREP-11).
 *
 * One request for the gap the selection stops at; only the answer to the gap
 * asked about now is drawn; each refusal is its next step (PREP-08): a stale
 * gap re-reads the Set, a gone Set leaves the page, anything else is said.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import type { SetAnswer, SetSuggestions, SetSuggestionsRequest } from "../../api/cuepointBridge.types";
import { answered, refused } from "./prepare.testFixture";
import { SOURCE_IDS, SOURCE_REFUSALS, SUGGESTIONS } from "./prepareSource.testFixture";
import { SUGGESTION_DELAY_MS, useSetSuggestions } from "./useSetSuggestions";

const [OPEN_ONE, OPEN_TWO, BRIDGE] = SOURCE_IDS.build_entries;

function gap(before: number, after: number | null): SetSuggestionsRequest {
  return { set_id: SOURCE_IDS.build, before_entry_id: before, after_entry_id: after, against: null, limit: 50 };
}

let suggestions: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  suggestions = vi.fn(async () => answered(SUGGESTIONS.both));
  (window as unknown as { cuepoint: unknown }).cuepoint = { sets: { suggestions } };
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

async function settle(ms = SUGGESTION_DELAY_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function hook(initial: SetSuggestionsRequest | null, revision: unknown = 0) {
  const onStale = vi.fn();
  const onGone = vi.fn();
  const view = renderHook(
    ({ request, rev }: { request: SetSuggestionsRequest | null; rev: unknown }) =>
      useSetSuggestions({ request, revision: rev, onStale, onGone }),
    { initialProps: { request: initial, rev: revision } },
  );
  return { ...view, onStale, onGone };
}

describe("asking", () => {
  it("waits for the gap to settle, then asks once", async () => {
    const view = hook(gap(OPEN_ONE, OPEN_TWO));
    expect(view.result.current.loading).toBe(true);
    await settle(SUGGESTION_DELAY_MS - 1);
    // A gap passed on the way to another is never asked about.
    expect(suggestions).not.toHaveBeenCalled();
    view.rerender({ request: gap(OPEN_TWO, BRIDGE), rev: 0 });
    view.rerender({ request: gap(OPEN_ONE, OPEN_TWO), rev: 0 });
    await settle();
    expect(suggestions).toHaveBeenCalledTimes(1);
    expect(suggestions).toHaveBeenCalledWith(gap(OPEN_ONE, OPEN_TWO));
    expect(view.result.current.answer).toEqual(SUGGESTIONS.both);
    expect(view.result.current.loading).toBe(false);
  });

  it("asks again when the Set is re-read, keeping the answer on screen meanwhile", async () => {
    const view = hook(gap(OPEN_ONE, OPEN_TWO), 1);
    await settle();
    view.rerender({ request: gap(OPEN_ONE, OPEN_TWO), rev: 2 });
    expect(view.result.current.answer).toEqual(SUGGESTIONS.both);
    await settle();
    expect(suggestions).toHaveBeenCalledTimes(2);
  });

  it("asks nothing, and shows nothing, with no gap", async () => {
    const view = hook(null);
    await settle();
    expect(suggestions).not.toHaveBeenCalled();
    expect(view.result.current).toMatchObject({ answer: null, loading: false, problem: null });
  });
});

describe("answers", () => {
  it("draws nothing for a new gap until its own answer comes", async () => {
    const view = hook(gap(OPEN_ONE, OPEN_TWO));
    await settle();
    expect(view.result.current.answer).toEqual(SUGGESTIONS.both);
    view.rerender({ request: gap(BRIDGE, null), rev: 0 });
    expect(view.result.current.answer).toBeNull();
    expect(view.result.current.loading).toBe(true);
    suggestions.mockResolvedValueOnce(answered(SUGGESTIONS.end));
    await settle();
    expect(view.result.current.answer).toEqual(SUGGESTIONS.end);
  });

  it("never draws the last gap's list under this gap's words", async () => {
    let finish: (answer: SetAnswer<SetSuggestions>) => void = () => {};
    suggestions.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const view = hook(gap(OPEN_ONE, OPEN_TWO));
    await settle();
    view.rerender({ request: gap(BRIDGE, null), rev: 0 });
    await act(async () => finish(answered(SUGGESTIONS.both)));
    expect(view.result.current.answer).toBeNull();
    suggestions.mockResolvedValueOnce(answered(SUGGESTIONS.end));
    await settle();
    expect(view.result.current.answer).toEqual(SUGGESTIONS.end);
  });

  it("hands a stale gap to the page to re-read, and a gone Set to leave", async () => {
    suggestions.mockResolvedValueOnce(refused(SOURCE_REFUSALS.stale));
    const view = hook(gap(OPEN_ONE, BRIDGE));
    await settle();
    expect(view.onStale).toHaveBeenCalledWith(SOURCE_REFUSALS.stale);
    expect(view.result.current.problem).toBeNull();

    suggestions.mockResolvedValueOnce(refused(SOURCE_REFUSALS.setGone));
    view.rerender({ request: gap(OPEN_ONE, OPEN_TWO), rev: 1 });
    await settle();
    expect(view.onGone).toHaveBeenCalledWith(SOURCE_REFUSALS.setGone);

    const entryGone = { ...SOURCE_REFUSALS.setGone, reason: "entry" as const };
    suggestions.mockResolvedValueOnce(refused(entryGone));
    view.rerender({ request: gap(OPEN_ONE, OPEN_TWO), rev: 2 });
    await settle();
    expect(view.onStale).toHaveBeenLastCalledWith(entryGone);
  });

  it("says any other refusal, or a failure, and asks again on retry", async () => {
    suggestions.mockResolvedValueOnce(refused(SOURCE_REFUSALS.emptySet));
    const view = hook(gap(OPEN_ONE, OPEN_TWO));
    await settle();
    expect(view.result.current.problem).toBe(SOURCE_REFUSALS.emptySet.message);
    suggestions.mockRejectedValueOnce(new Error("engine unavailable"));
    act(() => view.result.current.retry());
    await settle();
    expect(view.result.current.problem).toBe("engine unavailable");
    act(() => view.result.current.retry());
    await settle();
    expect(view.result.current.problem).toBeNull();
    expect(view.result.current.answer).toEqual(SUGGESTIONS.both);
  });
});
