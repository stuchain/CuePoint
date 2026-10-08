/**
 * Clean's match window (PAGES-07B, FLW-13, CLN-10).
 *
 * The one place many tracks are matched. The properties worth the most: the
 * tracks an opener passes arrive chosen, the window says how many tracks the
 * choice will search for (the not-yet-looked-up ones, unless it is told to look
 * up again), and a run is started with exactly the selection that was shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { LibraryHealth, LibrarySearchResponse } from "../../api/cuepointBridge.types";
import { MatchWindow } from "./MatchWindow";
import type { CleanTracks } from "./cleanTracks";
import { cleanMatchOpening, cleanMatchState } from "./cleanLink";
import fixture from "./cleanEmpty.fixture.json";

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;

const HEALTH = {
  ...(fixture.untouched.health as LibraryHealth),
  track_count: 3880,
  counts: (fixture.untouched.health as LibraryHealth).counts.map((entry) =>
    entry.id === "not_matched" ? { ...entry, count: 1204 } : entry,
  ),
} as LibraryHealth;

function answer(params: Record<string, unknown>, total: number): LibrarySearchResponse {
  return {
    query: "",
    total,
    limit: 1,
    offset: 0,
    tracks: [],
    library_empty: false,
    mode: "browse",
    scope: (params.playlistId as number | null) ?? null,
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}

beforeEach(() => {
  bridge = {
    getLibraryPlaylists: vi.fn().mockResolvedValue({
      playlists: [
        { id: 10, parent_id: null, name: "Friday", kind: "playlist", depth: 0, position: 0, path: "Friday", track_count: 2 },
      ],
      total: 1,
    }),
    getCollections: vi.fn().mockResolvedValue({
      collections: [
        { id: 7, parent_id: null, kind: "set", name: "Saturday", position: 0, depth: 0, rules: null, entry_count: 5, track_count: 5 },
      ],
      total: 1,
    }),
    // Friday has 40 tracks, 9 of them not looked up yet.
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => {
      const rules = (params.filters as { rules: Array<{ field: string }> } | null)?.rules ?? [];
      const notYet = rules.some((rule) => rule.field === "match_state");
      const where = rules.some((rule) => rule.field === "in_playlist");
      const key = rules.some((rule) => rule.field === "key");
      if (key) return answer(params, notYet ? 25 : 40);
      return answer(params, where ? (notYet ? 9 : 40) : 0);
    }),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function show(tracks: CleanTracks | null = null) {
  const onStart = vi.fn();
  const onClose = vi.fn();
  render(<MatchWindow open tracks={tracks} health={HEALTH} onStart={onStart} onClose={onClose} />);
  return { onStart, onClose, dialog: screen.getByRole("dialog", { name: "Match tracks" }) };
}

const NOT_YET = { match: "all", rules: [{ field: "match_state", operator: "is", value: "not_matched" }] };

describe("which tracks", () => {
  it("opens on the tracks not looked up yet, with how many", () => {
    const { dialog } = show();
    const choice = within(dialog).getByRole("radio", { name: /^Tracks not looked up yet/ });
    expect(choice).toBeChecked();
    expect(choice.closest("label")).toHaveTextContent("1,204");
    expect(within(dialog).getByRole("radio", { name: /^All tracks/ }).closest("label")).toHaveTextContent("3,880");
    expect(within(dialog).queryByRole("radio", { name: /you chose/ })).toBeNull();
  });

  it("matches what has not been looked up, and nothing is asked again", () => {
    const { dialog, onStart } = show();
    const again = within(dialog).getByRole("checkbox", {
      name: "Look up tracks that already have a match again",
    });
    expect(again).toBeDisabled();
    expect(again).not.toBeChecked();
    expect(dialog).toHaveTextContent("CuePoint will search Beatport for 1,204 tracks.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    expect(onStart).toHaveBeenCalledWith({ query: { filters: NOT_YET } }, false);
  });

  it("can match every track, and look up the ones that already have a match again", () => {
    const { dialog, onStart } = show();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^All tracks/ }));
    const again = within(dialog).getByRole("checkbox", {
      name: "Look up tracks that already have a match again",
    });
    expect(again).toBeEnabled();
    // Left off, only what has not been looked up is searched, with its count.
    expect(dialog).toHaveTextContent("CuePoint will search Beatport for 1,204 tracks.");
    expect(dialog).toHaveTextContent("only the 1,204 not looked up yet");

    fireEvent.click(again);
    expect(dialog).toHaveTextContent("CuePoint will search Beatport for 3,880 tracks.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    expect(onStart).toHaveBeenCalledWith({ query: {} }, true);
  });

  it("takes the chosen playlists, Collections and Sets, and counts what is not looked up in them", async () => {
    const { dialog, onStart } = show();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Tracks in chosen playlists/ }));
    expect(within(dialog).getByRole("button", { name: "Start matching" })).toBeDisabled();

    fireEvent.click(await within(dialog).findByRole("checkbox", { name: "Friday" }));
    await waitFor(() => expect(dialog).toHaveTextContent("only the 9 not looked up yet"));
    expect(dialog).toHaveTextContent("CuePoint will search Beatport for 9 tracks.");

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Look up tracks that already have a match again" }));
    await waitFor(() => expect(dialog).toHaveTextContent("CuePoint will search Beatport for 40 tracks."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    expect(onStart).toHaveBeenCalledWith(
      {
        query: {
          filters: {
            match: "all",
            rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 10 }] }],
          },
        },
      },
      true,
    );
  });
});

describe("tracks passed in arrive chosen", () => {
  it("from the Library, as ids", () => {
    const opening = cleanMatchOpening({ state: cleanMatchState([4, 5, 6]), key: "k" })!;
    const { dialog, onStart } = show(opening.tracks);
    const chosen = within(dialog).getByRole("radio", { name: /^The 3 tracks you chose/ });
    expect(chosen).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /^Tracks not looked up yet/ })).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    expect(onStart).toHaveBeenCalledWith({ track_ids: [4, 5, 6] }, false);
  });

  it("from a filter, as a described selection with the count the Library showed", async () => {
    const opening = cleanMatchOpening({
      state: cleanMatchState({
        query: { filters: { match: "all", rules: [{ field: "key", operator: "is_empty" }] } },
        count: 40,
      }),
      key: "k",
    })!;
    const { dialog, onStart } = show(opening.tracks);
    expect(within(dialog).getByRole("radio", { name: /^The 40 tracks you chose/ })).toBeChecked();
    // A track with no key may have been looked up already: say how many have not.
    await waitFor(() => expect(dialog).toHaveTextContent("only the 25 not looked up yet"));

    fireEvent.click(within(dialog).getByRole("button", { name: "Start matching" }));
    expect(onStart).toHaveBeenCalledWith(
      { query: { filters: { match: "all", rules: [{ field: "key", operator: "is_empty" }] } } },
      false,
    );
  });

  it("can be set aside for the tracks not looked up yet", () => {
    const { dialog } = show({ ids: [4, 5] });
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Tracks not looked up yet/ }));
    expect(dialog).toHaveTextContent("CuePoint will search Beatport for 1,204 tracks.");
  });

  it("do not say how many of them were looked up, which only the engine knows", () => {
    const { dialog } = show({ ids: [4, 5, 6] });
    expect(dialog).toHaveTextContent(
      "CuePoint will search Beatport for those of the 3 tracks that have not been looked up yet.",
    );
  });
});

describe("the window", () => {
  it("says what matching is and that it runs in the background", () => {
    const { dialog } = show();
    expect(dialog).toHaveTextContent("It runs in the background, and you can keep using the app.");
  });

  it("starts nothing when cancelled", () => {
    const { dialog, onStart, onClose } = show();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("will not start when there is nothing to match", () => {
    const onStart = vi.fn();
    const empty = {
      ...HEALTH,
      counts: HEALTH.counts.map((entry) => (entry.id === "not_matched" ? { ...entry, count: 0 } : entry)),
    };
    render(<MatchWindow open tracks={null} health={empty} onStart={onStart} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Start matching" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Every track has been looked up.");
  });
});
