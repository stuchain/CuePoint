/**
 * The key summary (STATS-06, DEC-206): the counts from the population route, "No Beatport key",
 * and Open in Keys carrying the scope as ticked sources.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { CollectionNode, KeysPopulation } from "../../api/cuepointBridge.types";
import { keysOpening } from "../keys/keysLink";
import { KeySummary } from "./KeySummary";
import { keysScopeFor } from "./statisticsKeys";

const POPULATION: KeysPopulation = {
  total: 2212,
  no_key: 372,
  keys: [
    { code: "7A", count: 118 },
    { code: "8A", count: 142 },
    { code: "9A", count: 131 },
    { code: "1A", count: 5 },
  ],
};

const node = (
  id: number,
  kind: CollectionNode["kind"],
  rules: CollectionNode["rules"] = null,
): CollectionNode => ({
  id,
  parent_id: null,
  kind,
  name: `C${id}`,
  position: id,
  depth: 0,
  rules,
  sort: null,
  dir: null,
  frozen_from_id: null,
  frozen_at: null,
  entry_count: 0,
  track_count: 0,
  broken: false,
  problem: null,
  created_at: "x",
  updated_at: "x",
});

const COLLECTIONS = [
  node(10, "collection"),
  node(11, "set"),
  node(12, "smart", {
    match: "all",
    rules: [{ field: "key", operator: "any_of", value: ["8A"] }],
  }),
  node(13, "smart", {
    match: "all",
    rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 4 }] }],
  }),
];

let population: ReturnType<typeof vi.fn>;

function Where() {
  const location = useLocation();
  const opening = keysOpening(location);
  return (
    <p data-testid="where" data-sources={JSON.stringify(opening?.sources ?? null)}>
      {location.pathname}
    </p>
  );
}

function renderSummary(scope: string, answer: KeysPopulation = POPULATION) {
  population = vi.fn().mockResolvedValue(answer);
  (window as unknown as { cuepoint: unknown }).cuepoint = { getKeysPopulation: population };
  return render(
    <MemoryRouter initialEntries={["/statistics"]}>
      <KeySummary scope={scope} collections={COLLECTIONS} refresh={0} />
      <Where />
    </MemoryRouter>,
  );
}

const ticked = () => JSON.parse(screen.getByTestId("where").getAttribute("data-sources")!);

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the key summary (STATS-06)", () => {
  it("says how many tracks have a key, the three commonest and those with none", async () => {
    renderSummary("library");
    expect(
      await screen.findByText(
        "1,840 of 2,212 tracks have a Beatport key · most common 8A (142), 9A (131), 7A (118) · No Beatport key: 372",
      ),
    ).toBeInTheDocument();
    expect(population).toHaveBeenCalledWith({ sources: [{ kind: "all" }] });
  });

  it("says 'No Beatport key: 0' and names no commonest key when none is held", async () => {
    renderSummary("library", { total: 4, no_key: 4, keys: [] });
    expect(
      await screen.findByText("0 of 4 tracks have a Beatport key · No Beatport key: 4"),
    ).toBeInTheDocument();
  });

  it("opens Keys on the whole library from the whole library", async () => {
    const user = userEvent.setup();
    renderSummary("library");
    await screen.findByText(/have a Beatport key/);
    await user.click(screen.getByRole("button", { name: "Open in Keys" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/keys");
    expect(ticked()).toEqual([]);
  });

  it("counts, and opens Keys on, a playlist", async () => {
    const user = userEvent.setup();
    renderSummary("playlist:7");
    await screen.findByText(/have a Beatport key/);
    expect(population).toHaveBeenCalledWith({ sources: [{ kind: "playlist", id: 7 }] });
    await user.click(screen.getByRole("button", { name: "Open in Keys" }));
    expect(ticked()).toEqual([{ kind: "playlist", id: 7 }]);
  });

  it("counts, and opens Keys on, a Collection and a Set by their own kind", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSummary("collection:10");
    await screen.findByText(/have a Beatport key/);
    expect(population).toHaveBeenCalledWith({ sources: [{ kind: "collection", id: 10 }] });
    await user.click(screen.getByRole("button", { name: "Open in Keys" }));
    expect(ticked()).toEqual([{ kind: "collection", id: 10 }]);
    unmount();

    renderSummary("collection:11");
    await screen.findByText(/have a Beatport key/);
    expect(population).toHaveBeenCalledWith({ sources: [{ kind: "set", id: 11 }] });
  });

  it("ticks a Smart Collection's own places when its rules are only places", async () => {
    const user = userEvent.setup();
    renderSummary("collection:13");
    await screen.findByText(/have a Beatport key/);
    expect(population).toHaveBeenCalledWith({ sources: [{ kind: "playlist", id: 4 }] });
    await user.click(screen.getByRole("button", { name: "Open in Keys" }));
    expect(ticked()).toEqual([{ kind: "playlist", id: 4 }]);
  });

  it("does not count a Smart Collection Keys cannot take, and says what Open in Keys does", async () => {
    const user = userEvent.setup();
    renderSummary("collection:12");
    expect(await screen.findByText(/not a Smart Collection's rules, so it opens on your whole library/)).toBeInTheDocument();
    expect(population).not.toHaveBeenCalled();
    expect(screen.queryByText(/have a Beatport key/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open in Keys" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/keys");
    expect(ticked()).toEqual([]);
  });

  it("refuses an In-playlist rule with a second rule, and one with another operator", async () => {
    const withPlace = (operator: string, extra: boolean): CollectionNode[] => [
      node(20, "smart", {
        match: "all",
        rules: [
          { field: "in_playlist", operator, value: [{ kind: "playlist", id: 4 }] },
          ...(extra ? [{ field: "key", operator: "any_of", value: ["8A"] }] : []),
        ],
      }),
    ];
    expect(keysScopeFor("collection:20", withPlace("any_of", true)).kind).toBe("unsupported");
    expect(keysScopeFor("collection:20", withPlace("none_of", false)).kind).toBe("unsupported");
    expect(keysScopeFor("collection:20", withPlace("any_of", false))).toEqual({
      kind: "sources",
      picked: [{ kind: "playlist", id: 4 }],
    });
  });

  it("keeps the last numbers on screen while the same scope is read again", async () => {
    const { rerender } = renderSummary("library");
    await screen.findByText(/have a Beatport key/);
    population.mockReturnValue(new Promise(() => {}));
    rerender(
      <MemoryRouter initialEntries={["/statistics"]}>
        <KeySummary scope="library" collections={COLLECTIONS} refresh={1} />
        <Where />
      </MemoryRouter>,
    );
    expect(screen.getByText(/have a Beatport key/)).toBeInTheDocument();
    expect(screen.queryByText("Reading keys…")).toBeNull();
  });

  it("offers Try again when the keys cannot be read", async () => {
    population = vi.fn().mockRejectedValue(new Error("boom"));
    (window as unknown as { cuepoint: unknown }).cuepoint = { getKeysPopulation: population };
    render(
      <MemoryRouter>
        <KeySummary scope="library" collections={[]} refresh={0} />
      </MemoryRouter>,
    );
    expect(await screen.findByText("The keys could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
