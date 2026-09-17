/**
 * Clean in the Inspector (CLEAN-13, DEC-047, DEC-069).
 *
 * The panel gained a picture, a Beatport zone, five typed values and two
 * controls in History. Driven over a faked bridge:
 *
 * - **The Beatport zone** shows three values per field with the source of the
 *   one shown, and applies one field.
 * - **A typed value** is saved as a number or text, and the engine's refusal is
 *   shown under the field in its own words.
 * - **Revert** is offered for CuePoint's changes and not for Rekordbox's, and a
 *   stale revert's refusal reaches the page.
 * - **Tags written to the file** are shown as unfinished when the engine never
 *   saw them finish, with Restore offered — never as completed writes.
 * - **The imported record** stays read-only, field for field.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  MatchCandidate,
  TrackFieldChange,
  TrackMatches,
} from "../../api/cuepointBridge.types";
import { LIBRARY_CHANGED_EVENT } from "../../api/libraryChanges";
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
  effective_key: "9A",
  effective_bpm: 126,
  effective_genre: "Progressive House",
  effective_label: "mau5trap",
  effective_year: 2009,
  overridden: ["key", "bpm"],
  override_sources: { key: "beatport", bpm: "cuepoint" },
  match_state: "accepted",
  match_disputed: false,
  match_score: 96.5,
  file_status: "present",
  artwork: "beatport",
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
  };
}

const CANDIDATE: MatchCandidate = {
  id: 31,
  attempt_id: 3,
  rank: 1,
  is_winner: true,
  guard_ok: true,
  reject_reason: null,
  score: 96.5,
  base_score: 96.5,
  title_sim: 100,
  artist_sim: 100,
  bonus_year: 0,
  bonus_key: 0,
  beatport_track_id: "1",
  url: "https://www.beatport.com/track/strobe/1",
  title: "Strobe",
  artists: "deadmau5",
  remixers: null,
  label: "mau5trap",
  genre: "Progressive House",
  subgenre: null,
  key: "9A",
  bpm: 128,
  release_name: "For Lack of a Better Name",
  release_date: null,
  release_year: 2010,
  artwork_url: null,
  preview_url: null,
  query_index: 1,
  query_text: "q",
  candidate_index: 1,
  elapsed_ms: 1,
  mix: "Original Mix",
  differs: null,
};

function matches(overrides: Partial<TrackMatches["state"]> = {}): TrackMatches {
  return {
    track_id: 12,
    track: {
      title: "Strobe",
      artist: "deadmau5",
      mix: null,
      remixer: null,
      album: null,
      label: "mau5trap",
      genre: "Progressive House",
      key: "8A",
      bpm: 128,
      year: 2009,
    },
    state: {
      track_id: 12,
      state: "accepted",
      decided_by: "user",
      attempt_id: 3,
      candidate_id: 31,
      newer_attempt_id: null,
      disputed: false,
      decided_at: null,
      ...overrides,
    },
    candidate: CANDIDATE,
    attempts: [],
    total: 0,
  };
}

function change(overrides: Partial<TrackFieldChange>): TrackFieldChange {
  return {
    id: 1,
    track_id: 12,
    field: "cuepoint_bpm",
    old_value: null,
    new_value: 126,
    source: "cuepoint",
    changed_at: "2026-09-16T10:00:00Z",
    batch_id: null,
    ...overrides,
  };
}

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;

beforeEach(() => {
  bridge = {
    getTrackMatches: vi.fn().mockResolvedValue(matches()),
    getMatchCandidates: vi.fn().mockResolvedValue({ attempt_id: 3, track_id: 12, candidates: [], total: 0 }),
    applyMatch: vi.fn().mockResolvedValue({ track: TRACK }),
    setTrackOverrides: vi.fn().mockResolvedValue({ track: TRACK }),
    getTrackHistory: vi.fn().mockResolvedValue({
      track_id: 12,
      limit: 50,
      changes: [
        change({ id: 7, field: "cuepoint_bpm", old_value: null, new_value: 126 }),
        change({ id: 6, field: "key", old_value: "7A", new_value: "8A", source: "rekordbox" }),
        change({ id: 5, field: "tag", old_value: null, new_value: "Peak", source: "cuepoint" }),
      ],
    }),
    revertChange: vi.fn().mockResolvedValue({
      revert: { change_id: 7, track_id: 12, field: "cuepoint_bpm", previous_value: 126, restored_value: null, changed: true },
    }),
    getTagWrites: vi.fn().mockResolvedValue({
      job_id: null,
      track_id: 12,
      writes: [],
      total: 3,
      unconfirmed: 2,
      restorable: 3,
      restorable_unconfirmed: 2,
      limit: 1,
      offset: 0,
    }),
    startTagRestore: vi.fn().mockResolvedValue({
      job_id: "r-1",
      id: "r-1",
      state: "queued",
      writes: 3,
      unconfirmed: 2,
      restored_job_id: null,
      track_id: 12,
    }),
    getJob: vi.fn().mockResolvedValue({ id: "r-1", state: "succeeded" }),
    getTrackArtwork: vi.fn().mockResolvedValue("blob:art"),
    releaseTrackArtwork: vi.fn(),
    getTags: vi.fn().mockResolvedValue({ tags: [], categories: [] }),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function panel(props: Partial<Parameters<typeof TrackDetailPanel>[0]> = {}) {
  const handlers = {
    onError: vi.fn(),
    onTrackChanged: vi.fn(),
    onOpenInClean: vi.fn(),
    onMessage: vi.fn(),
  };
  render(<TrackDetailPanel detail={detailOf()} {...handlers} {...props} />);
  return handlers;
}

function field(zone: HTMLElement, name: string): HTMLElement {
  return zone.querySelector(`[data-field="${name}"]`) as HTMLElement;
}

describe("the Beatport zone", () => {
  it("shows where the track stands and what was decided", async () => {
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    expect(await within(zone).findByText("Accepted by you")).toBeInTheDocument();
    expect(within(zone).getByText("Strobe (Original Mix)")).toBeInTheDocument();
    expect(within(zone).getByText(/mau5trap · For Lack of a Better Name · score 96.5/)).toBeInTheDocument();
    expect(within(zone).getByText("Artwork: From Beatport")).toBeInTheDocument();
    expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 12 });
  });

  it("shows three values per field, and the source of the one shown", async () => {
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Accepted by you");
    const key = field(zone, "key");
    expect(key).toHaveTextContent("Rekordbox 8A");
    expect(key).toHaveTextContent("Beatport 9A");
    expect(key).toHaveTextContent("Now 9A (applied from Beatport)");
    expect(field(zone, "bpm")).toHaveTextContent("Now 126.0 (typed by you)");
    expect(field(zone, "year")).toHaveTextContent("Beatport 2010");
    expect(field(zone, "year")).toHaveTextContent("Now 2009 (from Rekordbox)");
  });

  it("applies one field, and says the track changed", async () => {
    const handlers = panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Accepted by you");
    // Key is already Beatport's, so it is not offered again.
    expect(within(field(zone, "key")).queryByRole("button")).toBeNull();

    await userEvent.click(within(zone).getByRole("button", { name: "Apply Beatport's Year" }));

    await waitFor(() => expect(bridge.applyMatch).toHaveBeenCalledWith({ fields: ["year"], track_id: 12 }));
    await waitFor(() => expect(handlers.onTrackChanged).toHaveBeenCalled());
  });

  it("offers nothing to apply before a match is accepted", async () => {
    bridge.getTrackMatches.mockResolvedValue(matches({ state: "needs_review", decided_by: null }));
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Needs review");
    expect(within(zone).queryByRole("button", { name: /^Apply/ })).toBeNull();
  });

  it("shows a refused apply in the engine's words", async () => {
    bridge.applyMatch.mockRejectedValue(new Error("Beatport has no year for this track"));
    const handlers = panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Accepted by you");
    await userEvent.click(within(zone).getByRole("button", { name: "Apply Beatport's Year" }));
    await waitFor(() => expect(handlers.onError).toHaveBeenCalledWith("Beatport has no year for this track"));
    expect(handlers.onTrackChanged).not.toHaveBeenCalled();
  });

  it("says a newer match disagrees", async () => {
    bridge.getTrackMatches.mockResolvedValue(matches({ disputed: true, newer_attempt_id: 9 }));
    panel();
    expect(
      await screen.findByText("Accepted by you — a newer match disagrees"),
    ).toBeInTheDocument();
  });

  it("links to the track on the Clean page", async () => {
    const handlers = panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await userEvent.click(within(zone).getByRole("button", { name: "Open on the Clean page" }));
    expect(handlers.onOpenInClean).toHaveBeenCalledWith(12);
  });

  it("is not drawn by a build without Clean", async () => {
    delete bridge.getTrackMatches;
    panel();
    await screen.findByRole("heading", { name: "Strobe" });
    expect(screen.queryByRole("region", { name: "Beatport" })).toBeNull();
  });
});

describe("the imported record", () => {
  it("stays read-only, whatever the zones above it offer (DEC-047)", async () => {
    panel();
    await screen.findByRole("region", { name: "Beatport" });
    const imported = document.querySelector(".cp-track-detail__fields") as HTMLElement;
    expect(within(imported).queryByRole("textbox")).toBeNull();
    // Rekordbox's values stay Rekordbox's, whatever CuePoint's layer says.
    const key = within(imported).getByText("Key").closest(".cp-track-detail__row") as HTMLElement;
    expect(key).toHaveTextContent("8A");
  });
});

describe("the artwork", () => {
  it("is the guarded thumbnail, and is released when the panel goes", async () => {
    const { unmount } = render(<TrackDetailPanel detail={detailOf()} />);
    const image = await screen.findByRole("img", { name: "Artwork" });
    expect(image).toHaveAttribute("src", "blob:art");
    expect(bridge.getTrackArtwork).toHaveBeenCalledWith({ trackId: 12, size: "inspector" });
    unmount();
    expect(bridge.releaseTrackArtwork).toHaveBeenCalledWith("blob:art");
  });

  it("says when there is none", async () => {
    bridge.getTrackArtwork.mockResolvedValue(null);
    panel();
    expect(await screen.findByText("No artwork")).toBeInTheDocument();
  });
});

describe("your five values", () => {
  it("show yours, and Rekordbox's as the placeholder when you have none", async () => {
    panel();
    const group = await screen.findByRole("group", { name: "Your values" });
    expect(within(group).getByLabelText("Your key")).toHaveValue("9A");
    expect(within(group).getByLabelText("Your BPM")).toHaveValue("126.0");
    const genre = within(group).getByLabelText("Your genre");
    expect(genre).toHaveValue("");
    expect(genre).toHaveAttribute("placeholder", "Rekordbox: Progressive House");
    expect(within(group).getByText("applied from Beatport")).toBeInTheDocument();
    expect(within(group).getByText("typed by you")).toBeInTheDocument();
  });

  it("saves a typed number as a number on Enter", async () => {
    const handlers = panel();
    const bpm = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your BPM");
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "124.5{Enter}");
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: 124.5 }));
    expect(bridge.setTrackOverrides).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(handlers.onTrackChanged).toHaveBeenCalled());
  });

  it("saves once when Enter is followed by leaving the field", async () => {
    let answer: (value: unknown) => void = () => undefined;
    bridge.setTrackOverrides.mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    panel();
    const genre = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your genre");
    await userEvent.type(genre, "Techno{Enter}");
    // The save is still on its way when the field loses focus.
    genre.blur();
    await userEvent.tab();
    answer({ track: TRACK });
    await waitFor(() => expect(genre).toBeEnabled());
    expect(bridge.setTrackOverrides).toHaveBeenCalledTimes(1);
  });

  it("saves text when the field is left", async () => {
    panel();
    const genre = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your genre");
    await userEvent.type(genre, "Techno");
    await userEvent.tab();
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, genre: "Techno" }));
  });

  it("shows the engine's refusal under the field, and changes nothing", async () => {
    bridge.setTrackOverrides.mockRejectedValue(new Error("bpm must be between 20 and 300, not 400"));
    const handlers = panel();
    const bpm = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your BPM");
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "400{Enter}");
    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("bpm must be between 20 and 300, not 400");
    expect(bpm).toHaveAttribute("aria-invalid", "true");
    expect(handlers.onTrackChanged).not.toHaveBeenCalled();
  });

  it("refuses letters where a number goes without asking", async () => {
    panel();
    const year = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your year");
    await userEvent.type(year, "soon{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Year is a number, not “soon”");
    expect(bridge.setTrackOverrides).not.toHaveBeenCalled();
  });

  it("clears yours back to Rekordbox's", async () => {
    panel();
    const group = await screen.findByRole("group", { name: "Your values" });
    await userEvent.click(within(group).getByRole("button", { name: "Clear your key" }));
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, key: null }));
  });

  it("sends nothing when the value did not change", async () => {
    panel();
    const key = within(await screen.findByRole("group", { name: "Your values" })).getByLabelText("Your key");
    await userEvent.click(key);
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(bridge.setTrackOverrides).not.toHaveBeenCalled();
  });

  it("keep what is being typed when another field is read again", async () => {
    const { rerender } = render(<TrackDetailPanel detail={detailOf()} />);
    const group = await screen.findByRole("group", { name: "Your values" });
    await userEvent.type(within(group).getByLabelText("Your genre"), "Tech");

    // The BPM saved a moment ago lands while the genre is being typed.
    rerender(<TrackDetailPanel detail={detailOf({ ...TRACK, effective_bpm: 130 })} />);

    expect(within(group).getByLabelText("Your genre")).toHaveValue("Tech");
    expect(within(group).getByLabelText("Your BPM")).toHaveValue("130.0");
  });

  it("replace a saved value with the engine's once it is read again", async () => {
    const { rerender } = render(<TrackDetailPanel detail={detailOf()} />);
    const group = await screen.findByRole("group", { name: "Your values" });
    const bpm = within(group).getByLabelText("Your BPM");
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "124.50{Enter}");
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalled());
    expect(bpm).toHaveValue("124.50");

    rerender(<TrackDetailPanel detail={detailOf({ ...TRACK, effective_bpm: 124.5 })} />);
    expect(bpm).toHaveValue("124.5");
  });

  it("are not offered by a build that cannot type them", async () => {
    delete bridge.setTrackOverrides;
    panel();
    await screen.findByRole("region", { name: "Yours" });
    expect(screen.queryByRole("group", { name: "Your values" })).toBeNull();
  });
});

describe("History", () => {
  it("offers Revert for CuePoint's changes and not Rekordbox's", async () => {
    panel();
    await screen.findByText("Your BPM");
    const reverts = screen.getAllByRole("button", { name: /^Revert:/ });
    expect(reverts.map((button) => button.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("Your BPM"),
      expect.stringContaining("Tagged Peak"),
    ]);
    const entries = [...document.querySelectorAll(".cp-track-history__entry")] as HTMLElement[];
    const imported = entries.find((entry) => entry.textContent?.includes("Rekordbox"))!;
    expect(imported).toHaveTextContent("Key");
    expect(within(imported).queryByRole("button")).toBeNull();
  });

  it("reverts one change, reads everything again, and tells the rest of the app", async () => {
    const announced = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, announced);
    const handlers = panel();
    await screen.findByText("Your BPM");
    await userEvent.click(screen.getAllByRole("button", { name: /^Revert:/ })[0]!);

    await waitFor(() => expect(bridge.revertChange).toHaveBeenCalledWith({ change_id: 7 }));
    await waitFor(() => expect(handlers.onMessage).toHaveBeenCalledWith("Reverted."));
    expect(handlers.onTrackChanged).toHaveBeenCalled();
    expect(announced).toHaveBeenCalled();
    await waitFor(() => expect(bridge.getTrackHistory).toHaveBeenCalledTimes(2));
    window.removeEventListener(LIBRARY_CHANGED_EVENT, announced);
  });

  it("shows a stale revert's refusal, with both values named", async () => {
    bridge.revertChange.mockRejectedValue(
      new Error("Your BPM on track 12 has changed since change 7: that change set it to 126, and it is now 128."),
    );
    const handlers = panel();
    await screen.findByText("Your BPM");
    await userEvent.click(screen.getAllByRole("button", { name: /^Revert:/ })[0]!);
    await waitFor(() =>
      expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining("it is now 128")),
    );
    expect(handlers.onTrackChanged).not.toHaveBeenCalled();
  });

  it("offers no Revert in a build without the route", async () => {
    delete bridge.revertChange;
    panel();
    await screen.findByText("Your BPM");
    expect(screen.queryByRole("button", { name: /^Revert:/ })).toBeNull();
  });
});

describe("tags written to the file", () => {
  it("are shown as unfinished when the engine never saw them finish, with Restore", async () => {
    panel();
    const note = await screen.findByText(/may not have finished/);
    expect(note).toHaveTextContent(
      "2 writes may not have finished, and 1 value was written. Restore puts every file back.",
    );
    expect(note.textContent).not.toMatch(/3 values? (were )?written/);
    expect(screen.getByRole("button", { name: "Restore the file's tags" })).toBeEnabled();
  });

  it("restores this track's file and reads again", async () => {
    const handlers = panel();
    await userEvent.click(await screen.findByRole("button", { name: "Restore the file's tags" }));
    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledWith({ track_id: 12 }));
    await waitFor(() =>
      expect(handlers.onMessage).toHaveBeenCalledWith("Restored the tags CuePoint wrote into this file."),
    );
    expect(handlers.onTrackChanged).toHaveBeenCalled();
    await waitFor(() => expect(bridge.getTagWrites).toHaveBeenCalledTimes(2));
  });

  it("say a failed restore in the engine's words", async () => {
    bridge.getJob.mockResolvedValue({ id: "r-1", state: "failed", error: { message: "The file is locked" } });
    const handlers = panel();
    await userEvent.click(await screen.findByRole("button", { name: "Restore the file's tags" }));
    await waitFor(() => expect(handlers.onError).toHaveBeenCalledWith(expect.stringContaining("The file is locked")));
  });

  it("are not mentioned when nothing is left to restore", async () => {
    bridge.getTagWrites.mockResolvedValue({
      job_id: null,
      track_id: 12,
      writes: [],
      total: 6,
      unconfirmed: 0,
      restorable: 0,
      restorable_unconfirmed: 0,
      limit: 1,
      offset: 0,
    });
    panel();
    await screen.findByText("Your BPM");
    await waitFor(() => expect(bridge.getTagWrites).toHaveBeenCalled());
    expect(screen.queryByText(/Tags written to the file/)).toBeNull();
  });
});
