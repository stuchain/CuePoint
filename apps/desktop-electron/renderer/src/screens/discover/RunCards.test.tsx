/**
 * A dig's results as rows of cards (Results tab), over a faked bridge whose
 * answers are the engine's own (`discoverPage.fixture.json`, written by
 * `test_discover_page_fixture.py`): the rows and what each holds, ticking and
 * the bar it raises, adding ticked cards to the wantlist and to a playlist (a
 * new one or one that exists), opening a card, "Everything", and a dig made
 * before cards, which is the single list it always was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type {
  DiscoverAnswer,
  DiscoverGroupCard,
  DiscoverOptions,
  DiscoverRunGroups,
  DiscoverRunHeader,
  DiscoverRunList,
  DiscoverRunTracksPage,
} from "../../api/cuepointBridge.types";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { RunDetail } from "./RunDetail";
import type { DiscoverTools } from "./discoverTools";
import fixture from "./discoverPage.fixture.json";
import { HIDE_OWNED_STORAGE_KEY } from "./useHideOwned";

const LOADED = { timeout: 3000 };

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;
let tools: DiscoverTools;
let notify: Fn;
let push: Fn;

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const RUNS = fixture.runs.value as unknown as DiscoverRunList;
const HEADER = fixture.run_header.value as unknown as DiscoverRunHeader;
const HIDDEN = fixture.run_tracks_hidden.value as unknown as DiscoverRunTracksPage;
const ARTISTS = fixture.run_groups_artists.value as unknown as DiscoverRunGroups;
const GENRE = fixture.run_groups_genre.value as unknown as DiscoverRunGroups;
const LIBRARY = fixture.run_groups_library.value as unknown as DiscoverRunGroups;
const SUMMARY = fixture.run_group_summary.value;
const PLAYLISTS = fixture.playlists_listed.value;

function value<T>(of: T): DiscoverAnswer<T> {
  return { value: of, refusal: null };
}

/** A page of tracks echoing the window asked, as the engine does. */
function page(params: Record<string, unknown>): DiscoverAnswer<DiscoverRunTracksPage> {
  return value({
    ...HIDDEN,
    run_id: Number(params.run_id),
    window: {
      owned: (params.owned as "hide") ?? "hide",
      sort: (params.sort as "position") ?? "position",
      dir: (params.dir as "asc") ?? "asc",
      offset: Number(params.offset ?? 0),
      limit: Number(params.limit ?? 100),
    },
  });
}

function install(overrides: Record<string, Fn> = {}) {
  bridge = {
    getDiscoveryRun: vi.fn(async () =>
      value({ ...HEADER, run: RUNS.runs.find((run) => run.id === 1)! }),
    ),
    getDiscoveryRunGroups: vi.fn(async () => value(ARTISTS)),
    getDiscoveryRunTracks: vi.fn(async (params: Record<string, unknown>) => page(params)),
    getDiscoveryGroupTracks: vi.fn(async (params: Record<string, unknown>) => page(params)),
    getDiscoveryGroupSummary: vi.fn(async () => value(SUMMARY)),
    addToWantlist: vi.fn(async () => value({ ...fixture.wantlist_added.value })),
    getBeatportPlaylists: vi.fn(async () => value(PLAYLISTS)),
    ...overrides,
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
}

function renderRun(onGone = () => {}) {
  return render(
    <ScaleProvider>
      <RunDetail runId={1} tools={tools} version={0} onGone={onGone} />
    </ScaleProvider>,
  );
}

const card = (name: RegExp | string) => screen.findByRole("button", { name });

beforeEach(() => {
  localStorage.removeItem(HIDE_OWNED_STORAGE_KEY);
  notify = vi.fn();
  push = vi.fn(async () => null);
  tools = {
    options: OPTIONS,
    beatportState: "ok",
    pushing: false,
    push: push as unknown as DiscoverTools["push"],
    notify: notify as unknown as DiscoverTools["notify"],
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("a dig's results as rows of cards", () => {
  it("draws the three rows when artists were chosen, each card a button with a name", async () => {
    install();
    renderRun();
    expect(await screen.findByRole("region", { name: "Your artists' charts" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your artists' new releases" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your labels" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Genre charts" })).not.toBeInTheDocument();
    expect(await card("Chart Mara's September, 3 tracks")).toBeInTheDocument();
    expect(await card("Artist Mara Veil, 1 chart · 1 new")).toBeInTheDocument();
    expect(await card("Label NIGHTFALL-AUDIO, 3 new")).toBeInTheDocument();
    // The cards, not a table, are what the tab holds.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says which row's count counts what", async () => {
    install();
    renderRun();
    const charts = await screen.findByRole("region", { name: "Your artists' charts" });
    expect(charts).toHaveTextContent("1 · in your genres");
    expect(screen.getByRole("region", { name: "Your labels" })).toHaveTextContent("3 · new releases");
  });

  it("calls row one 'Genre charts' when the engine says no artist was chosen", async () => {
    install({ getDiscoveryRunGroups: vi.fn(async () => value(GENRE)) });
    renderRun();
    const row = await screen.findByRole("region", { name: "Genre charts" });
    expect(within(row).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("region", { name: "Your artists' charts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your artists' new releases" })).not.toBeInTheDocument();
  });

  it("calls the artists row 'Your artists' and never says '0 new' where releases were not looked up", async () => {
    install({ getDiscoveryRunGroups: vi.fn(async () => value(LIBRARY)) });
    renderRun();
    const row = await screen.findByRole("region", { name: "Your artists" });
    expect(row.textContent).not.toContain("new");
    expect(screen.queryByRole("region", { name: "Your artists' new releases" })).not.toBeInTheDocument();
    expect(within(row).getAllByRole("button").every((b) => !/ new/.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
  });

  it("says what a dig left out on purpose", async () => {
    install({
      getDiscoveryRunGroups: vi.fn(async () =>
        value({ ...ARTISTS, notes: ["Only the first 200 of the 240 artists you chose were looked up: a dig reads at most 200."] }),
      ),
    });
    renderRun();
    expect(await screen.findByText(/Only the first 200 of the 240 artists/)).toBeInTheDocument();
  });

  it("keeps ticks and open rows when a card is opened and closed again", async () => {
    const many: DiscoverGroupCard[] = Array.from({ length: 8 }, (_, i) => ({
      ...ARTISTS.rows[0]!.cards[0]!,
      key: String(100 + i),
      name: `Chart ${i + 1}`,
    }));
    install({
      getDiscoveryRunGroups: vi.fn(async () =>
        value({ ...ARTISTS, rows: [{ id: "charts" as const, cards: many }] }),
      ),
    });
    renderRun();
    const row = await screen.findByRole("region", { name: "Your artists' charts" });
    fireEvent.click(within(row).getByRole("button", { name: "See all" }));
    fireEvent.click(within(row).getByRole("checkbox", { name: "Tick Chart 2" }));
    fireEvent.click(within(row).getByRole("button", { name: /^Chart Chart 3,/ }));
    fireEvent.click(await screen.findByRole("button", { name: "All results" }));
    const back = await screen.findByRole("region", { name: "Your artists' charts" });
    expect(within(back).getAllByRole("listitem")).toHaveLength(8);
    expect(within(back).getByRole("checkbox", { name: "Tick Chart 2" })).toBeChecked();
  });

  it("shows six cards of a long row and the rest under 'See all'", async () => {
    const many: DiscoverGroupCard[] = Array.from({ length: 8 }, (_, i) => ({
      ...ARTISTS.rows[0]!.cards[0]!,
      key: String(100 + i),
      name: `Chart ${i + 1}`,
    }));
    install({
      getDiscoveryRunGroups: vi.fn(async () =>
        value({ ...ARTISTS, rows: [{ id: "charts" as const, cards: many }] }),
      ),
    });
    renderRun();
    const row = await screen.findByRole("region", { name: "Your artists' charts" });
    expect(within(row).getAllByRole("listitem")).toHaveLength(6);
    const seeAll = within(row).getByRole("button", { name: "See all" });
    expect(seeAll).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(seeAll);
    expect(within(row).getAllByRole("listitem")).toHaveLength(8);
    expect(within(row).getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  });

  it("has no 'See all' when the whole row is showing", async () => {
    install();
    renderRun();
    const row = await screen.findByRole("region", { name: "Your artists' charts" });
    expect(within(row).queryByRole("button", { name: "See all" })).not.toBeInTheDocument();
  });

  it("draws a card's picture from a thumbnail the preload made, and lets it go", async () => {
    const release = vi.fn();
    const art = vi.fn(async () => "blob:thumb");
    const withArt = {
      ...ARTISTS,
      rows: ARTISTS.rows.map((row) => ({
        ...row,
        cards: row.cards.map((c) => ({ ...c, has_art: c.kind === "artist" })),
      })),
    };
    install({
      getDiscoveryRunGroups: vi.fn(async () => value(withArt)),
      getDiscoveryGroupArt: art,
      releaseTrackArtwork: release,
    });
    const { unmount } = renderRun();
    await card("Artist Mara Veil, 1 chart · 1 new");
    await waitFor(() =>
      expect(art).toHaveBeenCalledWith({ run_id: 1, kind: "artist", key: "mara veil", size: "inspector" }),
    );
    const artist = screen.getByRole("button", { name: "Artist Mara Veil, 1 chart · 1 new" });
    await waitFor(() => expect(artist.querySelector("img")).toHaveAttribute("src", "blob:thumb"));
    // Only the card that has a picture asks for one.
    expect(art).toHaveBeenCalledTimes(1);
    unmount();
    expect(release).toHaveBeenCalledWith("blob:thumb");
  });
});

describe("ticking cards", () => {
  it("raises a bar with the engine's count of distinct tracks and the owned ones", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tick NIGHTFALL-AUDIO" }));
    const bar = await screen.findByRole("group", { name: "Ticked cards" });
    await waitFor(
      () =>
        expect(bar).toHaveTextContent(
          "Ticked: Mara Veil, NIGHTFALL-AUDIO · 5 tracks · 1 already in your library",
        ),
      LOADED,
    );
    expect(bridge.getDiscoveryGroupSummary).toHaveBeenLastCalledWith({
      run_id: 1,
      groups: [
        { kind: "artist", key: "mara veil" },
        { kind: "label", key: "nightfall audio" },
      ],
    });
  });

  it("does not open a card to tick it, and untick drops the bar", async () => {
    install();
    renderRun();
    const tick = await screen.findByRole("checkbox", { name: "Tick Mara Veil" });
    fireEvent.click(tick);
    expect(await screen.findByRole("group", { name: "Ticked cards" })).toBeInTheDocument();
    expect(bridge.getDiscoveryGroupTracks).not.toHaveBeenCalled();
    fireEvent.click(tick);
    expect(screen.queryByRole("group", { name: "Ticked cards" })).not.toBeInTheDocument();
  });

  it("adds the ticked cards to the wantlist and says the owned ones were left out", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    const bar = await screen.findByRole("group", { name: "Ticked cards" });
    await waitFor(() => expect(bar).toHaveTextContent(`${SUMMARY.tracks} tracks`), LOADED);
    fireEvent.click(within(bar).getByRole("button", { name: "Add to wantlist" }));
    await waitFor(() =>
      expect(bridge.addToWantlist).toHaveBeenCalledWith({
        run_id: 1,
        groups: [{ kind: "artist", key: "mara veil" }],
      }),
    );
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        `${fixture.wantlist_added.value.message} 1 track already in your library was left out.`,
        "success",
      ),
    );
  });

  it("adds the ticked cards to a new playlist, by name, with the library's tracks left to the push", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Playlist name"), { target: { value: "Friday finds" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({
        name: "Friday finds",
        include_owned: false,
        run_id: 1,
        groups: [{ kind: "artist", key: "mara veil" }],
      }),
    );
  });

  it("adds the ticked cards to a playlist the user already has", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to playlist…" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(bridge.getBeatportPlaylists).toHaveBeenCalled());
    const existing = within(dialog).getByRole("radio", { name: "A playlist I already have" });
    await waitFor(() => expect(existing).toBeEnabled());
    fireEvent.click(existing);
    expect(dialog).toHaveTextContent("Adds the");
    fireEvent.change(within(dialog).getByLabelText("Playlist"), { target: { value: "700002" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to playlist" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({
        name: "Warm-up",
        include_owned: false,
        run_id: 1,
        groups: [{ kind: "artist", key: "mara veil" }],
        playlist_id: "700002",
      }),
    );
  });

  it("counts in the dialog only the tracks that will go: the owned ones are skipped", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    const bar = await screen.findByRole("group", { name: "Ticked cards" });
    await waitFor(() => expect(bar).toHaveTextContent(`${SUMMARY.tracks} tracks`), LOADED);
    fireEvent.click(within(bar).getByRole("button", { name: "Add to playlist…" }));
    const dialog = await screen.findByRole("dialog");
    const going = SUMMARY.tracks - SUMMARY.owned;
    expect(dialog).toHaveTextContent(`the ${going} tracks on the ticked card`);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Include tracks already in your library" }));
    expect(dialog).toHaveTextContent(`the ${SUMMARY.tracks} tracks on the ticked card`);
  });

  it("keeps the dialog open and says why when the push is refused", async () => {
    install();
    push.mockResolvedValueOnce({
      code: "INVALID_REQUEST",
      message: "Already in your library: all 3 tracks",
      reason: null,
      retry_after: null,
      job_id: null,
      job_type: null,
    });
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Already in your library");
  });

  it("will not add to a playlist while Beatport cannot be asked", async () => {
    install();
    tools = { ...tools, beatportState: "no_token" };
    renderRun();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Tick Mara Veil" }));
    expect(await screen.findByRole("button", { name: "Add to playlist…" })).toBeDisabled();
  });
});

describe("opening a card, and Everything", () => {
  it("opens a card's tracks, asked for by that card, with a way back", async () => {
    install();
    renderRun();
    fireEvent.click(await card("Artist Mara Veil, 1 chart · 1 new"));
    await waitFor(() =>
      expect(bridge.getDiscoveryGroupTracks).toHaveBeenCalledWith(
        expect.objectContaining({ run_id: 1, groups: [{ kind: "artist", key: "mara veil" }], owned: "hide" }),
      ),
    );
    expect(await screen.findByRole("table", { name: "Mara Veil" })).toBeInTheDocument();
    expect(bridge.getDiscoveryRunTracks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "All results" }));
    expect(await screen.findByRole("region", { name: "Your labels" })).toBeInTheDocument();
  });

  it("adds a card's whole table to a playlist when nothing in it is ticked", async () => {
    install();
    renderRun();
    fireEvent.click(await card("Label NIGHTFALL-AUDIO, 3 new"));
    await screen.findByRole("table", { name: "NIGHTFALL-AUDIO" });
    fireEvent.click(await screen.findByRole("button", { name: "Make a Beatport playlist…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Make playlist" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: 1,
          groups: [{ kind: "label", key: "nightfall audio" }],
          include_owned: false,
        }),
      ),
    );
  });

  it("opens the whole dig as one list, with a From column, from the Everything button", async () => {
    install();
    renderRun();
    fireEvent.click(await screen.findByRole("button", { name: "Everything · 5 tracks" }));
    const table = await screen.findByRole("table", { name: "Tracks this dig found" });
    expect(within(table).getByText("From")).toBeInTheDocument();
    expect(bridge.getDiscoveryRunTracks).toHaveBeenCalled();
    expect(bridge.getDiscoveryGroupTracks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "All results" }));
    expect(await screen.findByRole("region", { name: "Your artists' charts" })).toBeInTheDocument();
  });

  it("shows a dig made before cards as its one list, with no way back to cards", async () => {
    install({
      getDiscoveryRunGroups: vi.fn(async () =>
        value({ ...ARTISTS, grouped: false, rows: [], charts_mode: null }),
      ),
    });
    renderRun();
    expect(await screen.findByRole("table", { name: "Tracks this dig found" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All results" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your labels" })).not.toBeInTheDocument();
  });

  it("falls back to the one list when the cards cannot be read, and says so", async () => {
    install({
      getDiscoveryRunGroups: vi.fn(async () => ({
        value: null,
        refusal: {
          code: "INVALID_REQUEST",
          message: "Not now",
          reason: null,
          retry_after: null,
          job_id: null,
          job_type: null,
        },
      })),
    });
    renderRun();
    expect(await screen.findByRole("table", { name: "Tracks this dig found" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Not now");
  });

  it("tells the page when the dig is gone", async () => {
    const gone = vi.fn();
    install({
      getDiscoveryRunGroups: vi.fn(async () => ({
        value: null,
        refusal: {
          code: "DISCOVERY_RUN_NOT_FOUND",
          message: "No discovery run 1",
          reason: null,
          retry_after: null,
          job_id: null,
          job_type: null,
        },
      })),
    });
    renderRun(gone);
    await waitFor(() => expect(gone).toHaveBeenCalled());
  });
});
