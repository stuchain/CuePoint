/**
 * A Beatport table's rows, a window at a time (DISCOVER-10).
 *
 * The rules the Library's window keeps, over Discover's answers: the first
 * page is asked for at once, a page is asked for once, an answer to another
 * question is dropped, a refusal is a state — and a reload keeps the rows on
 * screen until their new answers land, while a new question drops them.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DiscoverAnswer, DiscoverRefusal } from "../../api/cuepointBridge.types";
import { PAGE_SIZE } from "../library/useTrackWindow";
import { useBeatportWindow } from "./useBeatportWindow";

interface Row {
  id: number;
  label: string;
}

interface Page {
  rows: Row[];
  total: number;
  window: { key: string };
}

function rows(total: number, label = "v1"): Row[] {
  return Array.from({ length: total }, (_, index) => ({ id: index + 1, label }));
}

/** A fetch over `data`, answering each call when told to, or at once. */
function engine(data: () => { rows: Row[]; key: string }, held = false) {
  const pending: Array<() => void> = [];
  const fetch = vi.fn((offset: number, limit: number) => {
    const { rows: all, key } = data();
    const page: DiscoverAnswer<Page> = {
      value: { rows: all.slice(offset, offset + limit), total: all.length, window: { key } },
      refusal: null,
    };
    if (!held) return Promise.resolve(page);
    return new Promise<DiscoverAnswer<Page>>((resolve) => pending.push(() => resolve(page)));
  });
  return { fetch, release: () => pending.splice(0).forEach((go) => go()) };
}

function mount(key: string, fetch: (o: number, l: number) => Promise<DiscoverAnswer<Page>>) {
  return renderHook(
    ({ question }) =>
      useBeatportWindow<Row, Page>({
        key: question,
        fetch,
        answers: (page) => page.window.key === question,
      }),
    { initialProps: { question: key } },
  );
}

describe("useBeatportWindow", () => {
  it("asks for the first page at once and draws it", async () => {
    const { fetch } = engine(() => ({ rows: rows(250), key: "a" }));
    const { result } = mount("a", fetch);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.total).toBe(250));
    expect(fetch).toHaveBeenCalledWith(0, PAGE_SIZE);
    expect(result.current.source.getRow(0)).toEqual({ id: 1, label: "v1" });
    expect(result.current.source.getRow(PAGE_SIZE)).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.page?.total).toBe(250);
  });

  it("asks for the pages a window needs, once each, in one request", async () => {
    const { fetch } = engine(() => ({ rows: rows(1000), key: "a" }));
    const { result } = mount("a", fetch);
    await waitFor(() => expect(result.current.total).toBe(1000));
    act(() => result.current.source.requestWindow?.(250, 290));
    act(() => result.current.source.requestWindow?.(250, 290));
    await waitFor(() => expect(result.current.source.getRow(300)).toBeDefined());
    // Pages 1 to 3, the prefetch margin included, as one contiguous request.
    expect(fetch.mock.calls).toEqual([
      [0, PAGE_SIZE],
      [PAGE_SIZE, 3 * PAGE_SIZE],
    ]);
  });

  it("drops an answer to the question before", async () => {
    let key = "a";
    const { fetch, release } = engine(() => ({ rows: rows(3, key), key }), true);
    const { result, rerender } = mount("a", fetch);
    key = "b";
    rerender({ question: "b" });
    // The first question's answer lands after the second was asked.
    await act(async () => release());
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.source.getRow(0)?.label).toBe("b");
  });

  it("keeps the newest reload's answer when an older one lands after it", async () => {
    // The same question asked twice: the echoed windows are identical, so only
    // the identity of the asking can tell the older answer from the newer.
    let late: () => void = () => {};
    let calls = 0;
    const fetch = vi.fn((offset: number, limit: number) => {
      calls += 1;
      const label = calls === 2 ? "old" : "new";
      const page = {
        value: { rows: rows(3, label).slice(offset, offset + limit), total: 3, window: { key: "a" } },
        refusal: null,
      } as DiscoverAnswer<Page>;
      if (calls === 2) return new Promise<DiscoverAnswer<Page>>((resolve) => (late = () => resolve(page)));
      return Promise.resolve(page);
    });
    const { result } = mount("a", fetch);
    await waitFor(() => expect(result.current.total).toBe(3));
    act(() => result.current.reload());
    act(() => result.current.reload());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.source.getRow(0)?.label).toBe("new"));
    await act(async () => late());
    expect(result.current.source.getRow(0)?.label).toBe("new");
  });

  it("drops an answer whose echoed window is not the one asked", async () => {
    const fetch = vi.fn(async () => ({
      value: { rows: rows(2), total: 2, window: { key: "other" } },
      refusal: null,
    }));
    const { result } = mount("a", fetch);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.total).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it("keeps the rows on screen through a reload, and replaces them when it lands", async () => {
    let version = "v1";
    const { fetch, release } = engine(() => ({ rows: rows(5, version), key: "a" }), true);
    const { result } = mount("a", fetch);
    await act(async () => release());
    await waitFor(() => expect(result.current.source.getRow(0)?.label).toBe("v1"));

    version = "v2";
    act(() => result.current.reload());
    // Asked again, and still showing what it had meanwhile.
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(result.current.source.getRow(0)?.label).toBe("v1");
    expect(result.current.loading).toBe(false);

    await act(async () => release());
    await waitFor(() => expect(result.current.source.getRow(0)?.label).toBe("v2"));
  });

  it("shrinks when a reload finds fewer rows, and empties when it finds none", async () => {
    let count = 150;
    const { fetch } = engine(() => ({ rows: rows(count), key: "a" }));
    const { result } = mount("a", fetch);
    await waitFor(() => expect(result.current.total).toBe(150));
    act(() => result.current.source.requestWindow?.(100, 140));
    await waitFor(() => expect(result.current.source.getRow(120)).toBeDefined());

    count = 40;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.total).toBe(40));
    expect(result.current.source.getRow(120)).toBeUndefined();
    expect(result.current.loadedRows()).toHaveLength(40);

    count = 0;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.total).toBe(0));
    expect(result.current.loadedRows()).toEqual([]);
  });

  it("drops the rows at once for a new question", async () => {
    const { fetch, release } = engine(() => ({ rows: rows(5), key: "b" }), true);
    const first = engine(() => ({ rows: rows(5), key: "a" }));
    const { result, rerender } = renderHook(
      ({ question, ask }) =>
        useBeatportWindow<Row, Page>({
          key: question,
          fetch: ask,
          answers: (page) => page.window.key === question,
        }),
      { initialProps: { question: "a", ask: first.fetch } },
    );
    await waitFor(() => expect(result.current.total).toBe(5));
    rerender({ question: "b", ask: fetch });
    expect(result.current.source.getRow(0)).toBeUndefined();
    expect(result.current.loading).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(result.current.total).toBe(5));
  });

  it("holds a refusal as a state, with the refusal kept", async () => {
    const refusal: DiscoverRefusal = {
      code: "DISCOVERY_RUN_NOT_FOUND",
      message: "No discovery run 41",
      reason: null,
      retry_after: null,
      job_id: null,
      job_type: null,
    };
    const fetch = vi.fn(async () => ({ value: null, refusal }) as DiscoverAnswer<Page>);
    const { result } = mount("a", fetch);
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("No discovery run 41");
    expect(result.current.refusal).toEqual(refusal);
    expect(result.current.loading).toBe(false);
  });

  it("holds a failure as a state, and asks again on reload", async () => {
    let fail = true;
    const fetch = vi.fn(async () => {
      if (fail) throw new Error("engine gone");
      return { value: { rows: rows(1), total: 1, window: { key: "a" } }, refusal: null };
    });
    const { result } = mount("a", fetch);
    await waitFor(() => expect(result.current.error).toBe("engine gone"));
    expect(result.current.refusal).toBeNull();
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.status).toBe("ready");
  });

  it("asks nothing while it is not enabled", async () => {
    const fetch = vi.fn();
    const { result } = renderHook(() =>
      useBeatportWindow<Row, Page>({ key: "a", enabled: false, fetch, answers: () => true }),
    );
    await act(async () => {});
    act(() => result.current.source.requestWindow?.(0, 10));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.loading).toBe(false);
  });
});
