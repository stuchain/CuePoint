/**
 * Track details, as PAGES-06 makes it (INS-1…INS-11, FLW-9, DEC-205).
 *
 * The panel answers six questions in a calmer order: what is this track and
 * what can I do with it (header, five buttons, the key with its source), what
 * is mine, what did Rekordbox send, where are its cues, where does it live,
 * and what does Beatport say. Sections fold and the panel remembers how.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  TrackMatches,
} from "../../api/cuepointBridge.types";
import { cleanFixOpening, cleanMatchOpening } from "../clean/cleanLink";
import { TrackDetailPanel } from "./TrackDetailPanel";

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

const SECTIONS_KEY = "cuepoint-ui-track-details-sections";
const section = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

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

describe("the order (INS-3)", () => {
  it("reads Yours, Details from Rekordbox, Cue points, Where it is, Beatport, History", async () => {
    show();
    await screen.findByText(/Beatport · Accepted/);
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => (heading.textContent ?? "").replace(/^[▾▸]/, ""));
    const order = ["Yours", "Details from Rekordbox", "Cue points", "Where it is", "Beatport", "History"];
    const at = order.map((name) => names.findIndex((text) => text.startsWith(name)));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("opens the header, Yours and Details, and folds Beatport and History", async () => {
    show();
    expect(section("Yours")).toHaveAttribute("aria-expanded", "true");
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "true");
    expect(section("Beatport")).toHaveAttribute("aria-expanded", "false");
    expect(section("History")).toHaveAttribute("aria-expanded", "false");
    await screen.findByText(/Beatport · Accepted/);
  });

  it("summarizes a folded section in its heading", async () => {
    bridge.getTrackHistory.mockResolvedValue({
      track_id: 12,
      limit: 50,
      changes: [
        { id: 1, track_id: 12, field: "cuepoint_bpm", old_value: null, new_value: 126, source: "cuepoint", changed_at: "2026-09-16T10:00:00Z", batch_id: null },
        { id: 2, track_id: 12, field: "cuepoint_genre", old_value: null, new_value: "House", source: "cuepoint", changed_at: "2026-09-16T10:00:00Z", batch_id: null },
      ],
    });
    show();
    expect(await screen.findByText(/Beatport · Accepted/)).toBeInTheDocument();
    expect(await screen.findByText(/History · 2 changes/)).toBeInTheDocument();
  });
});

describe("folding and remembering (INS-3)", () => {
  it("folds a section and brings it back", () => {
    show();
    fireEvent.click(section("Details from Rekordbox"));
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bitrate")).not.toBeVisible();
    fireEvent.click(section("Details from Rekordbox"));
    expect(screen.getByText("Bitrate")).toBeVisible();
  });

  it("remembers every fold in one key", () => {
    show();
    fireEvent.click(section("Details from Rekordbox"));
    fireEvent.click(section("Beatport"));
    const stored = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}");
    expect(Object.values(stored)).toHaveLength(2);
  });

  it("restores the folds on a fresh mount, and for the next track", () => {
    const first = show();
    fireEvent.click(section("Details from Rekordbox"));
    fireEvent.click(section("Beatport"));
    first.unmount();
    show();
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "false");
    expect(section("Beatport")).toHaveAttribute("aria-expanded", "true");
  });

  it("works with storage that throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show();
    fireEvent.click(section("Yours"));
    expect(section("Yours")).toHaveAttribute("aria-expanded", "false");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("Edit values… (INS-4, DEC-205)", () => {
  it("keeps the value boxes out of the panel", () => {
    show();
    expect(screen.queryByLabelText("Your key")).toBeNull();
    expect(screen.queryByLabelText("Your BPM")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit values…" })).toBeInTheDocument();
  });

  it("folds the disclosure when nothing is edited", () => {
    show();
    expect(section("Your values")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the disclosure by itself when an edited value exists", () => {
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
    show();
    fireEvent.click(screen.getByRole("button", { name: "Edit values…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    expect(dialog).toHaveTextContent("1 track");
    expect(dialog).toHaveTextContent("Now: Progressive House");
    fireEvent.change(within(dialog).getByLabelText("BPM value"), { target: { value: "126" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: 126 }),
    );
  });

  it("reads the track again after a saved value", async () => {
    const onTrackChanged = vi.fn();
    show({ onTrackChanged });
    fireEvent.click(screen.getByRole("button", { name: "Edit values…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    fireEvent.change(within(dialog).getByLabelText("Genre value"), { target: { value: "House" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(onTrackChanged).toHaveBeenCalled());
  });

  it("goes back to Rekordbox's value for a field, and says so", async () => {
    show(
      {},
      detailOf({
        ...TRACK,
        effective_bpm: 126,
        overridden: ["bpm"],
        override_sources: { bpm: "cuepoint" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Go back to Rekordbox's BPM" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: null }),
    );
  });

  it("sends your key back to Beatport's key, or to none (DEC-201)", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Go back to Beatport's key" }));
    await waitFor(() =>
      expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, key: null }),
    );
    first.unmount();
    bridge.getTrackMatches.mockResolvedValue(matchesOf("no_match"));
    show({}, detailOf(edited));
    expect(await screen.findByRole("button", { name: "Go back to no key" })).toBeInTheDocument();
  });

  it.each(["needs_review", "rejected"] as const)(
    "does not offer Beatport's key to go back to when the match is %s",
    async (state) => {
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
      expect(await screen.findByRole("button", { name: "Go back to no key" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Go back to Beatport's key" })).toBeNull();
    },
  );

  it("disables Show in folder, with a hint, when several tracks are selected", () => {
    show({ selectionCount: 3 });
    const button = screen.getByRole("button", { name: "Show in folder" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("one track"));
  });

  it("offers Edit values for 4 tracks… for a multi-selection, in Clean's Fix values", () => {
    show({ selectionCount: 4, selectedTracks: { ids: [12, 13, 14, 15] } });
    fireEvent.click(screen.getByRole("button", { name: "Edit values for 4 tracks…" }));
    expect(where().path).toBe("/clean");
    const opening = cleanFixOpening({ state: where().state, key: "k" });
    expect(opening?.tracks).toEqual({ ids: [12, 13, 14, 15] });
    expect(opening?.action).toBe("edit");
  });

  it("says edits here still change this one track", () => {
    show({ selectionCount: 4, selectedTracks: { ids: [12, 13, 14, 15] } });
    expect(screen.getByRole("status")).toHaveTextContent(/4 tracks selected/);
    expect(screen.queryByRole("button", { name: /Change all/ })).toBeNull();
  });
});

describe("the key with its source (FLW-9, DEC-201)", () => {
  const keyRow = () => screen.getByTestId("track-key");

  it("reads Beatport's key with its name and source", () => {
    show();
    expect(keyRow()).toHaveTextContent("8A · A minor · Beatport");
  });

  it("reads your key as yours", () => {
    show({}, detailOf({ ...TRACK, effective_key: "9A", key_name: "E minor", key_source: "yours" }));
    expect(keyRow()).toHaveTextContent("9A · E minor · yours");
  });

  it("reads no key as No Beatport key, with Match on Beatport for this one track", async () => {
    show(
      {},
      detailOf({ ...TRACK, effective_key: null, key_name: null, key_source: null, match_state: "no_match" }),
    );
    bridge.getTrackMatches.mockResolvedValue(matchesOf("no_match"));
    expect(keyRow()).toHaveTextContent("No Beatport key");
    fireEvent.click(await within(keyRow()).findByRole("button", { name: "Match on Beatport" }));
    expect(where().path).toBe("/clean");
    expect(cleanMatchOpening({ state: where().state, key: "k" })?.tracks).toEqual({ ids: [12] });
  });

  it("puts Rekordbox's key under Details from Rekordbox, marked not used", () => {
    show();
    const details = screen.getByRole("region", { name: "Details from Rekordbox" });
    expect(within(details).getByText("Key (not used)")).toBeInTheDocument();
    expect(within(details).getByText("8A")).toBeInTheDocument();
  });
});

describe("an unmatched track (INS-5)", () => {
  it("shows one sentence and one action, and the action starts a match", async () => {
    bridge.getTrackMatches.mockResolvedValue(matchesOf("not_matched"));
    show(
      {},
      detailOf({ ...TRACK, effective_key: null, key_name: null, key_source: null, match_state: "not_matched" }),
    );
    fireEvent.click(section("Beatport"));
    const beatport = screen.getByRole("region", { name: "Beatport" });
    expect(await within(beatport).findByText(/Not looked up on Beatport yet\. Matching finds this track/)).toBeInTheDocument();
    const action = within(beatport).getByRole("button", { name: "Match on Beatport" });
    // The key's own line, which reads "No Beatport key", offers the same one.
    expect(within(screen.getByTestId("track-key")).getByRole("button", { name: "Match on Beatport" })).toBeInTheDocument();
    expect(beatport.querySelector(".cp-track-beatport__fields")).toBeNull();
    fireEvent.click(action);
    expect(where().path).toBe("/clean");
    expect(cleanMatchOpening({ state: where().state, key: "k" })?.tracks).toEqual({ ids: [12] });
  });

  it("no longer offers Apply for a field", async () => {
    show();
    fireEvent.click(section("Beatport"));
    await screen.findByText("Accepted by you");
    expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
  });
});

describe("the buttons under the title (FLW-9)", () => {
  const labels = ["Play", "Play next", "Add to queue", "Similar tracks", "Show in folder"];

  it("offers the five", () => {
    show();
    for (const name of labels) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("has one Show in folder, not one in the File row too", () => {
    show();
    expect(screen.getAllByRole("button", { name: "Show in folder" })).toHaveLength(1);
    const file = screen.getByText("File").closest(".cp-track-detail__row") as HTMLElement;
    expect(within(file).queryByRole("button")).toBeNull();
  });

  it("shows the file in its folder", () => {
    const onReveal = vi.fn();
    show({ onReveal });
    fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(onReveal).toHaveBeenCalledWith("/music/strobe.mp3");
  });

  it("plays, queues next and adds to the queue", async () => {
    const onMessage = vi.fn();
    show({ onMessage });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledTimes(1));
    expect(player.playQueue.mock.calls[0][0]).toMatchObject([{ trackId: 12, title: "Strobe" }]);
    fireEvent.click(screen.getByRole("button", { name: "Play next" }));
    await waitFor(() => expect(player.playNext).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Add to queue" }));
    await waitFor(() => expect(player.addToQueue).toHaveBeenCalledTimes(1));
    expect(onMessage).toHaveBeenCalledWith("1 track added to the queue");
  });

  it("acts on every selected track, except Similar tracks, which uses the first", async () => {
    const rows = [TRACK, { ...TRACK, id: 13, title: "Ghosts" }, { ...TRACK, id: 14, title: "Raise" }];
    const gather = vi.fn().mockResolvedValue(rows);
    show({ selectionCount: 3, gatherSelectedRows: gather });
    fireEvent.click(screen.getByRole("button", { name: "Add to queue" }));
    await waitFor(() => expect(player.addToQueue).toHaveBeenCalledTimes(1));
    expect(player.addToQueue.mock.calls[0][0]).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Similar tracks" }));
    await waitFor(() => expect(where().path).toBe("/discover/similar/12"));
  });

  it("opens Similar tracks for the track", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Similar tracks" }));
    expect(where().path).toBe("/discover/similar/12");
  });

  it("leaves out Play where there is no player", () => {
    delete (bridge as Record<string, unknown>).player;
    show();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.getByRole("button", { name: "Similar tracks" })).toBeInTheDocument();
  });
});

describe("plain words (INS-6…10)", () => {
  it("turns the empty Collections and playlists lines into the next step (INS-10)", () => {
    show();
    expect(
      screen.getByText(/Not in any Collection yet\. Select the track and choose .*Organize/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/right-click/i)).toBeNull();
    expect(screen.getByText("Not in any Rekordbox playlist.")).toBeInTheDocument();
  });

  it("empty-state text invites a click", () => {
    render(<TrackDetailPanel detail={null} />);
    expect(
      screen.getByText("Click a track to see its details, rate it and tag it here."),
    ).toBeInTheDocument();
  });

  it("calls the imported record Details from Rekordbox (INS-3)", () => {
    show();
    expect(screen.queryByText("From Rekordbox")).toBeNull();
    expect(section("Details from Rekordbox")).toBeInTheDocument();
  });
});
