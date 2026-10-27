/**
 * Track details, as PAGES-06 makes it (INS-1…INS-11, FLW-9, DEC-205).
 *
 * The panel answers its questions in a calmer order: what is this track (header, the key with
 * its source), where does it live, what does Beatport say, what is mine, what did Rekordbox
 * send and where are its cues. D16 (round 3) made it three tabs with no action row. Sections
 * fold and the panel remembers how.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  TrackMatches,
} from "../../api/cuepointBridge.types";
import { cleanMatchOpening } from "../clean/cleanLink";
import { TRACK_DETAILS_TAB_KEY, TrackDetailPanel } from "./TrackDetailPanel";

const TRACK: LibraryTrackRow = {
  id: 12,
  rekordbox_track_id: "900",
  title: "Strobe",
  artist: "deadmau5",
  remixer: null,
  album: null,
  label: "mau5trap",
  genre: "Progressive House",
  key: "8A",
  bpm: 128,
  year: 2009,
  duration_seconds: 634,
  rating: null,
  play_count: null,
  colour: null,
  date_added: null,
  comment: null,
  bitrate: null,
  file_path: "/music/strobe.mp3",
  effective_rating: null,
  rating_source: null,
  favorite: false,
  effective_key: "8A",
  key_name: "A minor",
  key_source: "beatport",
  effective_bpm: 128,
  effective_genre: "Progressive House",
  effective_label: "mau5trap",
  effective_year: 2009,
  overridden: [],
  override_sources: {},
  match_state: "accepted",
};

function detailOf(track: LibraryTrackRow = TRACK): LibraryTrackDetail {
  return {
    track,
    playlists: [],
    playlist_count: 0,
    metadata: {
      track_id: 12,
      rating: null,
      rekordbox_rating: null,
      effective_rating: null,
      rating_source: null,
      favorite: false,
      notes: null,
      created_at: null,
      updated_at: null,
    },
    tags: [],
    collections: [],
    marks: {
      read: true,
      hot_cues: 1,
      memory_cues: 0,
      cues: [{ start_ms: 32100, end_ms: null, kind: "cue", hot_cue: 0, name: "Drop", color: null }],
      beat_grid: { markers: 1, bpm: 128, variable: false, min_bpm: 128, max_bpm: 128 },
    },
  } as LibraryTrackDetail;
}

function matchesOf(state: "accepted" | "not_matched" | "no_match" | "needs_review" | "rejected"): TrackMatches {
  return {
    track_id: 12,
    track: {} as TrackMatches["track"],
    state: {
      track_id: 12,
      state,
      decided_by: state === "accepted" ? "user" : null,
      attempt_id: null,
      candidate_id: null,
      newer_attempt_id: null,
      disputed: false,
      decided_at: null,
    },
    candidate: null,
    attempts: [],
    total: 0,
  };
}

function Where() {
  const location = useLocation();
  return (
    <div data-testid="where" data-path={location.pathname}>
      {JSON.stringify(location.state)}
    </div>
  );
}

type Props = Partial<React.ComponentProps<typeof TrackDetailPanel>>;

function show(props: Props = {}, detail: LibraryTrackDetail = detailOf()) {
  return render(
    <MemoryRouter>
      <TrackDetailPanel detail={detail} onReveal={vi.fn()} {...props} />
      <Where />
    </MemoryRouter>,
  );
}

function where(): { path: string; state: unknown } {
  const node = screen.getByTestId("where");
  return {
    path: node.getAttribute("data-path") ?? "",
    state: JSON.parse(node.textContent || "null"),
  };
}

const section = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
/** The folded body a section's button controls (the shared Disclosure has no region of its own). */
const bodyOf = (name: string) => document.getElementById(section(name).getAttribute("aria-controls") ?? "") as HTMLElement;
/** Chooses one of the panel's tabs. */
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

let bridge: Record<string, ReturnType<typeof vi.fn>>;
let player: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  localStorage.clear();
  player = {
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue({ ok: true }),
    addToQueue: vi.fn().mockResolvedValue({ ok: true }),
  };
  bridge = {
    getTrackMatches: vi.fn().mockResolvedValue(matchesOf("accepted")),
    setTrackOverrides: vi.fn().mockResolvedValue({ track: TRACK }),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 12, limit: 50, changes: [] }),
    player,
  } as unknown as typeof bridge;
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  localStorage.clear();
});

describe("the tabs", () => {
  it("offers Overview, Beatport and Yours as tabs, Overview chosen (D16)", async () => {
    show();
    const list = screen.getByRole("tablist");
    expect(within(list).getAllByRole("tab").map((item) => item.textContent)).toEqual([
      "Overview",
      "Beatport",
      "Yours",
    ]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Overview" })).toBeVisible();
    await waitFor(() => expect(screen.getByTestId("track-fact-beatport")).toHaveTextContent("Confirmed"));
  });

  it("makes the Confirmed row a link to the Beatport tab (M127)", async () => {
    show();
    fireEvent.click(await within(await screen.findByTestId("track-fact-beatport")).findByRole("button", { name: "Confirmed" }));
    expect(screen.getByRole("tab", { name: "Beatport" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows one panel at a time and keeps the others mounted, hidden", () => {
    show();
    expect(screen.queryByRole("tabpanel", { name: "Yours" })).toBeNull();
    tab("Yours");
    expect(screen.getByRole("tab", { name: "Yours" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Yours" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "Overview" })).toBeNull();
    // Hidden, not removed: what is typed in Yours is not thrown away by a click elsewhere.
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
  });

  it("keeps the header, then the tabs, then the facts", () => {
    show();
    const head = document.querySelector(".cp-track-detail__head") as HTMLElement;
    const tablist = screen.getByRole("tablist");
    const facts = screen.getByLabelText("Facts");
    expect(head.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tablist.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("remembers the last tab in one key, for the next track and the next visit", () => {
    const first = show();
    tab("Yours");
    expect(localStorage.getItem(TRACK_DETAILS_TAB_KEY)).toBe("yours");
    first.unmount();
    show();
    expect(screen.getByRole("tab", { name: "Yours" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Yours" })).toBeVisible();
  });

  it("opens on Overview when the remembered tab is nonsense or not offered", () => {
    // "where" was a tab before D16 folded it into Overview.
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "where");
    const first = show();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    first.unmount();
    // Beatport is not offered where the build cannot read matches.
    delete (bridge as Record<string, unknown>).getTrackMatches;
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "beatport");
    show();
    expect(screen.queryByRole("tab", { name: "Beatport" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("works with storage that throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    tab("Yours");
    expect(screen.getByRole("tab", { name: "Yours" })).toHaveAttribute("aria-selected", "true");
    get.mockRestore();
    set.mockRestore();
  });

  it("has no tab for Yours when the track has no id", () => {
    show({}, detailOf({ ...TRACK, id: null as unknown as number }));
    expect(screen.queryByRole("tab", { name: "Yours" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Beatport" })).toBeNull();
  });
});

describe("the facts grid", () => {
  it("labels key, BPM and genre, and no longer carries a Cue points row (M126)", async () => {
    show();
    const facts = screen.getByLabelText("Facts");
    expect(within(facts).getByTestId("track-key").querySelector("dt")).toHaveTextContent("Key");
    expect(within(facts).getByTestId("track-fact-bpm")).toHaveTextContent("BPM128");
    expect(within(facts).getByTestId("track-fact-genre")).toHaveTextContent("GenreProgressive House");
    expect(within(facts).queryByTestId("track-fact-cues")).toBeNull();
    await waitFor(() => expect(within(facts).getByTestId("track-fact-beatport")).toHaveTextContent("BeatportConfirmed"));
  });

  it("puts the Camelot wheel's button beside the key chip, on the key's own row", () => {
    show();
    const key = screen.getByTestId("track-key");
    expect(within(key).getByRole("button", { name: "Show 8A on the Camelot wheel" })).toBeInTheDocument();
    expect(key).toHaveTextContent("A minor");
    expect(key.querySelector(".cp-track-detail__keyrow")).toContainElement(
      within(key).getByRole("button", { name: "Show 8A on the Camelot wheel" }),
    );
  });

  it("titles the Cue points disclosure with its summary, and puts the grid inside it (M126)", () => {
    show();
    expect(section("Cue points")).toHaveTextContent(/Cue points.*1 hot/);
    expect(within(bodyOf("Cue points")).getByText("Beat grid 128 BPM")).toBeInTheDocument();
  });

  it("says a track without cues has none, with its grid inside (M126)", () => {
    const detail = detailOf();
    show({}, { ...detail, marks: { ...detail.marks!, cues: [], hot_cues: 0, beat_grid: { ...detail.marks!.beat_grid!, bpm: 124 } } });
    expect(section("Cue points")).toHaveTextContent("none");
    const body = bodyOf("Cue points");
    expect(within(body).getByText("No cues")).toBeInTheDocument();
    expect(within(body).getByText("Beat grid 124 BPM")).toBeInTheDocument();
  });

  it("puts the peak beside the loudness, in the same facts (M130)", async () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.waveforms = undefined;
    show();
    expect(screen.queryByTestId("track-fact-peak")).toBeNull();
  });

  it("leaves out a fact the track does not have", () => {
    show({}, detailOf({ ...TRACK, genre: null, bpm: null }));
    expect(screen.queryByTestId("track-fact-genre")).toBeNull();
    expect(screen.queryByTestId("track-fact-bpm")).toBeNull();
    expect(screen.getByTestId("track-key")).toBeInTheDocument();
  });

  it("opens the cue points and the Rekordbox details from the foot of Overview", () => {
    show();
    expect(section("Cue points")).toHaveAttribute("aria-expanded", "false");
    expect(section("From your Rekordbox file")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(section("Cue points"));
    expect(screen.getByText(/Drop/)).toBeVisible();
    fireEvent.click(section("From your Rekordbox file"));
    expect(screen.getByText("Bitrate")).toBeVisible();
    fireEvent.click(section("From your Rekordbox file"));
    expect(screen.queryByText("Bitrate")).not.toBeVisible();
  });

  it("draws the artwork above the sticky head, outside it, so it scrolls away", () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.getTrackArtwork = vi
      .fn()
      .mockResolvedValue(null);
    const { container } = show();
    const head = container.querySelector(".cp-sticky-head") as HTMLElement;
    const art = container.querySelector(".cp-track-detail__art") as HTMLElement;
    expect(art.querySelector(".cp-track-detail__artwork")).not.toBeNull();
    expect(head).not.toContainElement(art);
    expect(head.querySelector(".cp-track-detail__idtext")).toContainElement(
      within(head).getByRole("heading", { level: 2 }),
    );
  });

  it("has Yours' rating, History and the rest of the person's layer on the Yours tab", async () => {
    show();
    tab("Yours");
    expect(screen.getByRole("radio", { name: /3 stars?/ })).toBeInTheDocument();
    await waitFor(() => expect(section("History")).toHaveTextContent("History · none yet"));
  });

  it("summarizes History in its heading", async () => {
    bridge.getTrackHistory.mockResolvedValue({
      track_id: 12,
      limit: 50,
      changes: [
        { id: 1, track_id: 12, field: "cuepoint_bpm", old_value: null, new_value: 126, source: "cuepoint", changed_at: "2026-09-16T10:00:00Z", batch_id: null },
        { id: 2, track_id: 12, field: "cuepoint_genre", old_value: null, new_value: "House", source: "cuepoint", changed_at: "2026-09-16T10:00:00Z", batch_id: null },
      ],
    });
    show();
    tab("Yours");
    await waitFor(() => expect(section("History")).toHaveTextContent("History · 2 changes"));
  });

  it("remembers a fold in the sections key", () => {
    show();
    fireEvent.click(section("From your Rekordbox file"));
    const stored = JSON.parse(localStorage.getItem("cuepoint-ui-track-details-sections") ?? "{}");
    expect(stored).toEqual({ details: true });
  });
});

describe("Edit values… (INS-4, DEC-205)", () => {
  it("keeps the value boxes out of the panel", () => {
    show();
    tab("Yours");
    expect(screen.queryByLabelText("Your key")).toBeNull();
    expect(screen.queryByLabelText("Your BPM")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit values…" })).toBeInTheDocument();
  });

  it("has no explanatory paragraph under Edit values…", () => {
    const { container } = show();
    expect(container.querySelector(".cp-track-values__lead")).toBeNull();
    expect(screen.queryByText(/going back returns to Beatport/)).toBeNull();
  });

  it("keeps Edit values… inside the Your values disclosure, open so the button is in reach (M136)", () => {
    show();
    tab("Yours");
    expect(section("Your values")).toHaveAttribute("aria-expanded", "true");
    expect(within(bodyOf("Your values")).getByRole("button", { name: "Edit values…" })).toBeInTheDocument();
  });

  it("opens the disclosure by itself when an edited value exists", () => {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
    show(
      {},
      detailOf({
        ...TRACK,
        effective_bpm: 126,
        overridden: ["bpm"],
        override_sources: { bpm: "cuepoint" },
      }),
    );
    expect(section("Your values")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/BPM/, { selector: ".cp-track-values__field" })).toBeInTheDocument();
  });

  it("opens the shared editor for this track, showing what each value is now", async () => {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit values…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    expect(dialog).toHaveTextContent("1 track");
    expect(dialog).toHaveTextContent("Now: Progressive House");
    fireEvent.change(within(dialog).getByLabelText("BPM value"), { target: { value: "126" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change 1 track" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: 126 }),
    );
  });

  it("reads the track again after a saved value", async () => {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
    const onTrackChanged = vi.fn();
    show({ onTrackChanged });
    fireEvent.click(screen.getByRole("button", { name: "Edit values…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByLabelText("Genre value"), { target: { value: "House" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change 1 track" }));
    await waitFor(() => expect(onTrackChanged).toHaveBeenCalled());
  });

  it("goes back to Rekordbox's value for a field, and says so", async () => {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
    show(
      {},
      detailOf({
        ...TRACK,
        effective_bpm: 126,
        overridden: ["bpm"],
        override_sources: { bpm: "cuepoint" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo your BPM, back to Rekordbox's" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: null }),
    );
  });

  it("sends your key back to Beatport's key, or to none (DEC-201)", async () => {
    localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
    const edited = {
      ...TRACK,
      effective_key: "9A",
      key_source: "yours" as const,
      overridden: ["key" as const],
      override_sources: { key: "cuepoint" as const },
    };
    const withKey = matchesOf("accepted");
    withKey.candidate = { key: "8A", score: 90 } as TrackMatches["candidate"];
    bridge.getTrackMatches.mockResolvedValue(withKey);
    const first = show({}, detailOf(edited));
    fireEvent.click(await screen.findByRole("button", { name: "Undo your key, back to Beatport's" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, key: null }),
    );
    first.unmount();
    bridge.getTrackMatches.mockResolvedValue(matchesOf("no_match"));
    show({}, detailOf(edited));
    expect(await screen.findByRole("button", { name: "Undo your key, back to no key" })).toBeInTheDocument();
  });

  it.each(["needs_review", "rejected"] as const)(
    "does not offer Beatport's key to go back to when the match is %s",
    async (state) => {
      localStorage.setItem(TRACK_DETAILS_TAB_KEY, "yours");
      const edited = {
        ...TRACK,
        effective_key: "9A",
        key_source: "yours" as const,
        overridden: ["key" as const],
        override_sources: { key: "cuepoint" as const },
      };
      const proposed = matchesOf(state);
      proposed.candidate = { key: "8A", score: 90 } as TrackMatches["candidate"];
      bridge.getTrackMatches.mockResolvedValue(proposed);
      show({}, detailOf(edited));
      expect(await screen.findByRole("button", { name: "Undo your key, back to no key" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Undo your key, back to Beatport's" })).toBeNull();
    },
  );

  it("reads \"4 selected · Edit values…\" on one line, the link calling onEditValues (K5)", () => {
    const onEditValues = vi.fn();
    show({ selectionCount: 4, onEditValues });
    expect(screen.getByRole("status")).toHaveTextContent("4 selected");
    const link = screen.getByRole("button", { name: "Edit values for 4 tracks…" });
    expect(link).toHaveAttribute("title", "Edit values for 4 tracks — the fields below change only this one");
    expect(link).toHaveTextContent("Edit values…");
    expect(link.closest("p")).toContainElement(screen.getByRole("status"));
    fireEvent.click(link);
    expect(onEditValues).toHaveBeenCalledTimes(1);
    // The panel itself goes nowhere: the host opens the dialog.
    expect(where().path).not.toBe("/clean");
  });

  it("reads just \"4 selected\" when the host cannot edit a selection", () => {
    show({ selectionCount: 4 });
    expect(screen.getByRole("status")).toHaveTextContent(/^4 selected$/);
    expect(screen.queryByRole("button", { name: "Edit values for 4 tracks…" })).toBeNull();
  });

  it("does not offer the selection line for a single track", () => {
    show({ selectionCount: 1, onEditValues: vi.fn() });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit values for \d/ })).toBeNull();
  });

  it("says edits here still change this one track", () => {
    show({ selectionCount: 4, onEditValues: vi.fn() });
    expect(screen.getByRole("status")).toHaveTextContent(/4 selected/);
    expect(screen.queryByRole("button", { name: /Change all/ })).toBeNull();
  });
});

describe("the key with its source (FLW-9, DEC-201)", () => {
  const keyRow = () => screen.getByTestId("track-key");

  it("reads Beatport's key with its name and source", () => {
    show();
    expect(keyRow()).toHaveTextContent("A minor · Beatport");
    expect(keyRow().querySelector(".cp-track-detail__keymeta")).toHaveAttribute("title", "Key from Beatport");
  });

  it("reads your key as yours", () => {
    show({}, detailOf({ ...TRACK, effective_key: "9A", key_name: "E minor", key_source: "yours" }));
    expect(keyRow()).toHaveTextContent("E minor · yours");
  });

  it("reads no key as No Beatport key, with Match on Beatport for this one track", async () => {
    show(
      {},
      detailOf({ ...TRACK, effective_key: null, key_name: null, key_source: null, match_state: "no_match" }),
    );
    bridge.getTrackMatches.mockResolvedValue(matchesOf("no_match"));
    expect(keyRow()).toHaveTextContent("—");
    fireEvent.click(await within(keyRow()).findByRole("button", { name: "Match on Beatport" }));
    expect(where().path).toBe("/clean");
    expect(cleanMatchOpening({ state: where().state, key: "k" })?.tracks).toEqual({ ids: [12] });
  });

  it("leaves Rekordbox's unused key out of the Rekordbox file's details (K5)", () => {
    show();
    fireEvent.click(section("From your Rekordbox file"));
    const details = bodyOf("From your Rekordbox file");
    expect(within(details).queryByText("Key (not used)")).toBeNull();
    expect(within(details).queryByText("Key")).toBeNull();
  });
});

describe("an unmatched track (INS-5)", () => {
  it("shows one sentence and one action, and the action starts a match", async () => {
    bridge.getTrackMatches.mockResolvedValue(matchesOf("not_matched"));
    show(
      {},
      detailOf({ ...TRACK, effective_key: null, key_name: null, key_source: null, match_state: "not_matched" }),
    );
    tab("Beatport");
    const beatport = screen.getByRole("tabpanel", { name: "Beatport" });
    expect(await within(beatport).findByText(/Not looked up on Beatport yet\. Matching finds this track/)).toBeInTheDocument();
    const action = within(beatport).getByRole("button", { name: "Match on Beatport" });
    // The key's own cell, on the Overview tab, offers the same one.
    expect(
      within(screen.getByTestId("track-key")).getByRole("button", { name: "Match on Beatport", hidden: true }),
    ).toBeInTheDocument();
    expect(beatport.querySelector(".cp-track-beatport__table")).toBeNull();
    fireEvent.click(action);
    expect(where().path).toBe("/clean");
    expect(cleanMatchOpening({ state: where().state, key: "k" })?.tracks).toEqual({ ids: [12] });
  });

  it("no longer offers Apply for a field", async () => {
    show();
    tab("Beatport");
    await screen.findByText(/Confirmed by you/);
    expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
  });
});

describe("no action row under the title (D16, M123)", () => {
  it("has no Play, Queue or Similar: the selection bar and the row's menu are their home", () => {
    show();
    expect(screen.queryByRole("group", { name: "Actions for this track" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Similar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Similar/ })).toBeNull();
  });
});

describe("plain words (INS-6…10)", () => {
  it("says None on the playlists and Collections lines of a track in none, no sentence about how to add (INS-10, M132)", () => {
    show();
    expect(screen.queryByText(/Select the track and choose/)).toBeNull();
    expect(screen.queryByText(/drag it onto one/)).toBeNull();
    expect(screen.queryByText(/right-click/i)).toBeNull();
    expect(screen.getByTestId("track-fact-collections")).toHaveTextContent("In CollectionsNone");
    expect(screen.getByTestId("track-fact-playlists")).toHaveTextContent("In playlistsNone");
    expect(screen.queryByTestId("track-fact-sets")).toBeNull();
  });

  it("offers Add to… beside the Collections when the page can open its picker (D16)", () => {
    const onAddToCollection = vi.fn();
    show({ onAddToCollection });
    fireEvent.click(within(screen.getByTestId("track-fact-collections")).getByRole("button", { name: "Add to…" }));
    expect(onAddToCollection).toHaveBeenCalledTimes(1);
  });

  it("does not offer Add to… on a page that has no picker", () => {
    show();
    expect(screen.queryByRole("button", { name: "Add to…" })).toBeNull();
  });

  it("empty-state text invites a click", () => {
    render(<TrackDetailPanel detail={null} />);
    expect(
      screen.getByText("Select a track to see its details"),
    ).toBeInTheDocument();
  });

  it("calls the imported record From your Rekordbox file (M415)", () => {
    show();
    expect(screen.queryByText("Details from Rekordbox")).toBeNull();
    expect(section("From your Rekordbox file")).toBeInTheDocument();
  });
});
