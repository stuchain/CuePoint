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
import { TRACK_DETAILS_SECTIONS_KEY } from "./DisclosureSection";
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
  localStorage.clear();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function panel(props: Partial<Parameters<typeof TrackDetailPanel>[0]> = {}) {
  // Beatport and History start folded (INS-3); these tests are about their contents.
  localStorage.setItem(TRACK_DETAILS_SECTIONS_KEY, JSON.stringify({ beatport: true, history: true }));
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
    expect(zone.querySelector(".cp-track-beatport__meta")).toHaveTextContent(
      "mau5trap · For Lack of a Better Name · match score 96.5",
    );
    expect(within(zone).getByText("match score 96.5")).toHaveAttribute(
      "title",
      "How closely Beatport's track matches yours; higher is closer",
    );
    expect(within(zone).getByText("Cover art: from Beatport")).toBeInTheDocument();
    expect(bridge.getTrackMatches).toHaveBeenCalledWith({ trackId: 12 });
  });

  it("shows three values per field, and the source of the one shown", async () => {
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Accepted by you");
    // The key is not one of the rows: an accepted match gives it (DEC-201).
    expect(field(zone, "key")).toBeNull();
    expect(field(zone, "bpm")).toHaveTextContent("Using 126.0 (typed by you)");
    expect(field(zone, "year")).toHaveTextContent("Beatport 2010");
    expect(field(zone, "year")).toHaveTextContent("Using 2009 (from Rekordbox)");
  });

  it("never applies a field from here: that is Review's and Fix values' job (FLW-2)", async () => {
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Accepted by you");
    expect(within(zone).queryByRole("button", { name: /^Apply/ })).toBeNull();
    expect(bridge.applyMatch).not.toHaveBeenCalled();
  });

  it("offers nothing to apply before a match is accepted", async () => {
    bridge.getTrackMatches.mockResolvedValue(matches({ state: "needs_review", decided_by: null }));
    panel();
    const zone = await screen.findByRole("region", { name: "Beatport" });
    await within(zone).findByText("Waiting for you");
    expect(within(zone).queryByRole("button", { name: /^Apply/ })).toBeNull();
  });

  it("says a newer match disagrees", async () => {
    bridge.getTrackMatches.mockResolvedValue(matches({ disputed: true, newer_attempt_id: 9 }));
    panel();
    expect(
      await screen.findByText("Accepted by you — changed since you decided"),
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
    // Rekordbox's values stay Rekordbox's, whatever CuePoint's layer says,
    // and its key is marked as not used (DEC-201).
    const key = within(imported).getByText("Key (not used)").closest(".cp-track-detail__row") as HTMLElement;
    expect(key).toHaveTextContent("8A");
  });

  it("says the track's own key with its name, or that it has none", async () => {
    const detail = detailOf();
    const { rerender } = render(
      <TrackDetailPanel
        detail={{ ...detail, track: { ...detail.track, effective_key: "9A", key_name: "E minor", key_source: "beatport" } }}
      />,
    );
    const line = document.querySelector(".cp-track-detail__keyline") as HTMLElement;
    expect(line).toHaveTextContent("9A · E minor · Beatport");
    rerender(
      <TrackDetailPanel detail={{ ...detail, track: { ...detail.track, effective_key: null, key_name: null } }} />,
    );
    expect(document.querySelector(".cp-track-detail__keyline")).toHaveTextContent("No Beatport key");
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

describe("your five values (DEC-205)", () => {
  async function editor() {
    await userEvent.click(await screen.findByRole("button", { name: "Edit values…" }));
    return screen.findByRole("dialog", { name: "Edit values" });
  }

  it("lists what you edited, with where it came from, and not a key Beatport gave", async () => {
    panel();
    const list = (await screen.findByRole("region", { name: "Your values" })) as HTMLElement;
    // BPM was typed by you. The key is Beatport's own, which is the track's key, not an edit.
    expect(within(list).getByText("typed by you")).toBeInTheDocument();
    expect(within(list).getByText("126.0")).toBeInTheDocument();
    expect(within(list).queryByText("applied from Beatport")).toBeNull();
  });

  it("saves a typed number as a number, in the shared editor", async () => {
    const handlers = panel();
    const dialog = await editor();
    await userEvent.type(within(dialog).getByLabelText("BPM value"), "124.5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: 124.5 }));
    expect(bridge.setTrackOverrides).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(handlers.onTrackChanged).toHaveBeenCalled());
  });

  it("shows the engine's refusal in the editor, and changes nothing", async () => {
    bridge.setTrackOverrides.mockRejectedValue(new Error("bpm must be between 20 and 300, not 400"));
    const handlers = panel();
    const dialog = await editor();
    await userEvent.type(within(dialog).getByLabelText("BPM value"), "400");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("bpm must be between 20 and 300, not 400");
    expect(handlers.onTrackChanged).not.toHaveBeenCalled();
  });

  it("refuses letters where a number goes without asking", async () => {
    panel();
    const dialog = await editor();
    await userEvent.type(within(dialog).getByLabelText("Year value"), "soon");
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Year is a number, not “soon”");
    expect(bridge.setTrackOverrides).not.toHaveBeenCalled();
  });

  it("goes back to Rekordbox's value", async () => {
    const handlers = panel();
    await userEvent.click(await screen.findByRole("button", { name: "Go back to Rekordbox's BPM" }));
    await waitFor(() => expect(bridge.setTrackOverrides).toHaveBeenCalledWith({ trackId: 12, bpm: null }));
    await waitFor(() => expect(handlers.onTrackChanged).toHaveBeenCalled());
  });

  it("reads the track again, and keeps what is being typed in the editor", async () => {
    const { rerender } = render(<TrackDetailPanel detail={detailOf()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit values…" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit values" });
    await userEvent.type(within(dialog).getByLabelText("Genre value"), "Tech");
    rerender(<TrackDetailPanel detail={detailOf({ ...TRACK, effective_bpm: 130 })} />);
    expect(within(dialog).getByLabelText("Genre value")).toHaveValue("Tech");
    expect(dialog).toHaveTextContent("Now: 130.0");
  });

  it("are not offered by a build that cannot type them", async () => {
    delete bridge.setTrackOverrides;
    panel();
    await screen.findByRole("region", { name: "Yours" });
    expect(screen.queryByRole("button", { name: "Edit values…" })).toBeNull();
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

describe("values saved into the music file", () => {
  it("are shown as unfinished when the engine never saw them finish, with Restore", async () => {
    panel();
    const note = await screen.findByText(/may not have finished/);
    expect(note).toHaveTextContent(
      "2 saves may not have finished, and 1 value was saved. Putting the files back restores every one.",
    );
    expect(note.textContent).not.toMatch(/3 values? (were )?saved/);
    expect(screen.getByRole("button", { name: "Put the file back as it was" })).toBeEnabled();
  });

  it("restores this track's file and reads again", async () => {
    const handlers = panel();
    await userEvent.click(await screen.findByRole("button", { name: "Put the file back as it was" }));
    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledWith({ track_id: 12 }));
    await waitFor(() =>
      expect(handlers.onMessage).toHaveBeenCalledWith("Put the file back as it was."),
    );
    expect(handlers.onTrackChanged).toHaveBeenCalled();
    await waitFor(() => expect(bridge.getTagWrites).toHaveBeenCalledTimes(2));
  });

  it("say a failed restore in the engine's words", async () => {
    bridge.getJob.mockResolvedValue({ id: "r-1", state: "failed", error: { message: "The file is locked" } });
    const handlers = panel();
    await userEvent.click(await screen.findByRole("button", { name: "Put the file back as it was" }));
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
    expect(screen.queryByText(/Saved into the music file/)).toBeNull();
  });
});
