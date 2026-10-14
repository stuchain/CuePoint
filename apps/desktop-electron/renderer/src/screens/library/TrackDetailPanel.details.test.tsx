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
import { cleanMatchOpening } from "../clean/cleanLink";
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
  // Yours starts folded (DEC-246); the tests that read inside it want it open.
  localStorage.setItem(SECTIONS_KEY, JSON.stringify({ yours: true }));
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
    await waitFor(() => expect(section("Beatport")).toHaveTextContent("Beatport · Confirmed"));
    const names = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => (heading.textContent ?? ""));
    const order = ["Yours", "Details from Rekordbox", "Cue points", "Where it is", "Beatport", "History"];
    const at = order.map((name) => names.findIndex((text) => text.startsWith(name)));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("opens the header, and folds Yours, Details, Beatport and History (K5)", async () => {
    localStorage.clear();
    show();
    expect(section("Yours")).toHaveAttribute("aria-expanded", "false");
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "false");
    expect(section("Beatport")).toHaveAttribute("aria-expanded", "false");
    expect(section("History")).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(section("Beatport")).toHaveTextContent("Beatport · Confirmed"));
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
    await waitFor(() => expect(section("Beatport")).toHaveTextContent("Beatport · Confirmed"));
    await waitFor(() => expect(section("History")).toHaveTextContent("History · 2 changes"));
  });
});

describe("the compact panel (INS-12)", () => {
  it("starts every section folded", async () => {
    localStorage.clear();
    show();
    for (const name of ["Yours", "Details from Rekordbox", "Cue points", "Where it is", "Beatport", "History"]) {
      expect(section(name)).toHaveAttribute("aria-expanded", "false");
    }
    await waitFor(() => expect(section("Beatport")).toHaveTextContent("Beatport · Confirmed"));
  });

  it("answers on the right of each folded heading", async () => {
    localStorage.clear();
    const detail = detailOf();
    show(
      {},
      {
        ...detail,
        playlists: [{ id: 1, name: "Peak", path: "Peak" } as never],
        collections: [{ id: 9, name: "Friday", kind: "set" } as never],
      },
    );
    await waitFor(() => expect(section("Beatport")).toHaveTextContent("Beatport · Confirmed"));
    expect(section("Where it is")).toHaveTextContent("Where it is · 1 Set · 1 playlist");
    expect(section("Cue points")).toHaveTextContent("Cue points · 1 hot · grid 128");
    expect(section("Yours")).toHaveTextContent("Yours · no rating");
    expect(section("Details from Rekordbox").textContent).toBe("Details from Rekordbox");
    // The answer is its own element, drawn at the right of the heading.
    expect(section("Where it is").querySelector(".cp-track-section__summary")).toHaveTextContent("1 Set · 1 playlist");
  });

  it("says a track without cues has none, and its grid", () => {
    localStorage.clear();
    const detail = detailOf();
    show({}, { ...detail, marks: { ...detail.marks!, cues: [], hot_cues: 0, beat_grid: { ...detail.marks!.beat_grid!, bpm: 124 } } });
    expect(section("Cue points")).toHaveTextContent("Cue points · none · grid 124");
  });

  it("shows the whole answer once a section is opened", () => {
    localStorage.clear();
    show();
    fireEvent.click(section("Cue points"));
    expect(screen.getByText(/Drop/)).toBeVisible();
  });

  it("puts key, BPM, genre on one facts line under the name", () => {
    show();
    const facts = document.querySelector(".cp-track-detail__facts") as HTMLElement;
    expect(within(facts).getByTestId("track-key")).toBeInTheDocument();
    expect(within(facts).getByRole("button", { name: "Camelot wheel" })).toBeInTheDocument();
    expect(within(facts).getByTestId("track-fact-bpm")).toHaveTextContent("128 BPM");
    expect(within(facts).getByTestId("track-fact-genre")).toHaveTextContent("Progressive House");
  });

  it("reads the Key label aloud though it is not drawn", () => {
    show();
    const keyline = screen.getByTestId("track-key");
    expect(within(keyline).getByText("Key")).toHaveClass("cp-visually-hidden");
    expect(keyline.querySelector("dt")).toHaveTextContent("Key");
  });

  it("draws the stars, and reads them as words", () => {
    localStorage.clear();
    const detail = detailOf();
    show({}, { ...detail, metadata: { ...detail.metadata, effective_rating: 4, favorite: true } });
    const heading = section("Yours");
    const drawn = heading.querySelector(".cp-track-section__summary > [aria-hidden]");
    expect(drawn).toHaveTextContent("★★★★ · favorite");
    expect(heading.querySelector(".cp-track-section__summary .cp-visually-hidden:last-child")).toHaveTextContent(
      "4 stars · favorite",
    );
    // The accessible name has the words, not "black star" four times.
    expect(screen.getByRole("button", { name: "Yours · 4 stars · favorite" })).toBeInTheDocument();
  });

  it("puts the facts line directly under the title block, above the buttons", () => {
    show();
    const facts = document.querySelector(".cp-track-detail__facts") as HTMLElement;
    const ident = document.querySelector(".cp-track-detail__ident") as HTMLElement;
    const actions = screen.getByRole("group", { name: "Actions for this track" });
    expect(ident.nextElementSibling).toBe(facts);
    expect(facts.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives a folded heading's whole answer as its hover text too", async () => {
    localStorage.clear();
    show();
    expect(section("Where it is")).toHaveAttribute("title", "Not in any Collection");
  });

  it("draws the artwork small, beside the title", () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.getTrackArtwork = vi
      .fn()
      .mockResolvedValue(null);
    const { container } = show();
    const ident = container.querySelector(".cp-track-detail__ident") as HTMLElement;
    expect(ident.querySelector(".cp-track-detail__artwork")).not.toBeNull();
    expect(ident.querySelector(".cp-track-detail__idtext")).toContainElement(
      within(ident).getByRole("heading", { level: 2 }),
    );
  });
});

describe("folding and remembering (INS-3)", () => {
  it("opens a section and folds it again", () => {
    show();
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Bitrate")).not.toBeVisible();
    fireEvent.click(section("Details from Rekordbox"));
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Bitrate")).toBeVisible();
    fireEvent.click(section("Details from Rekordbox"));
    expect(screen.queryByText("Bitrate")).not.toBeVisible();
  });

  it("Yours starts folded and remembers being opened", () => {
    localStorage.clear();
    const first = show();
    expect(section("Yours")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(section("Yours"));
    first.unmount();
    show();
    expect(section("Yours")).toHaveAttribute("aria-expanded", "true");
  });

  it("says what is in Yours while it is folded", () => {
    localStorage.clear();
    const detail = detailOf();
    show({}, { ...detail, metadata: { ...detail.metadata, effective_rating: 4, favorite: true } });
    expect(section("Yours")).toHaveTextContent("★★★★ · favorite");
  });

  it("words one tag, many tags, a single star, and skips a zero rating", () => {
    localStorage.clear();
    const detail = detailOf();
    const tag = (id: number) => ({ id, name: `t${id}`, track_count: 1 }) as never;
    const one = show({}, { ...detail, tags: [tag(1)], metadata: { ...detail.metadata, effective_rating: 1 } });
    expect(section("Yours")).toHaveTextContent("★ · 1 tag");
    one.unmount();
    show({}, { ...detail, tags: [tag(1), tag(2)], metadata: { ...detail.metadata, effective_rating: 0 } });
    expect(section("Yours")).toHaveTextContent("2 tags");
    expect(section("Yours")).not.toHaveTextContent("star");
  });

  it("calls an empty track's folded heading Yours, with no rating on the right", () => {
    localStorage.clear();
    show();
    expect(section("Yours").textContent).toBe("Yours · no rating");
  });

  it("updates the folded summary after a rating or favorite in Yours", async () => {
    const detail = detailOf();
    bridge.setTrackMetadata = vi.fn().mockResolvedValue({ metadata: { ...detail.metadata, effective_rating: 3, rating: 3, favorite: true } });
    show();
    fireEvent.click(screen.getByRole("radio", { name: /3 stars?/ }));
    fireEvent.click(screen.getByRole("button", { name: "Favorite" }));
    fireEvent.click(section("Yours"));
    expect(section("Yours")).toHaveTextContent("★★★ · favorite");
  });

  it("remembers every fold in one key", () => {
    show();
    fireEvent.click(section("Details from Rekordbox"));
    fireEvent.click(section("Beatport"));
    const stored = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}");
    // Yours (seeded open), Details and Beatport.
    expect(Object.values(stored)).toHaveLength(3);
  });

  it("restores the folds on a fresh mount, and for the next track", () => {
    const first = show();
    fireEvent.click(section("Details from Rekordbox"));
    fireEvent.click(section("Beatport"));
    first.unmount();
    show();
    expect(section("Details from Rekordbox")).toHaveAttribute("aria-expanded", "true");
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
    expect(section("Yours")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(section("Yours"));
    expect(section("Yours")).toHaveAttribute("aria-expanded", "true");
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

  it("has no explanatory paragraph under Edit values…", () => {
    const { container } = show();
    expect(container.querySelector(".cp-track-values__lead")).toBeNull();
    expect(screen.queryByText(/going back returns to Beatport/)).toBeNull();
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Change 1 track" }));
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Change 1 track" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Undo your BPM, back to Rekordbox's" }));
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
    expect(link.parentElement).toContainElement(screen.getByRole("status"));
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
    expect(keyRow()).toHaveTextContent("—");
    fireEvent.click(await within(keyRow()).findByRole("button", { name: "Match on Beatport" }));
    expect(where().path).toBe("/clean");
    expect(cleanMatchOpening({ state: where().state, key: "k" })?.tracks).toEqual({ ids: [12] });
  });

  it("leaves Rekordbox's unused key out of Details from Rekordbox (K5)", () => {
    show();
    fireEvent.click(section("Details from Rekordbox"));
    const details = screen.getByRole("region", { name: "Details from Rekordbox" });
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
    await screen.findByText("Confirmed by you");
    expect(screen.queryByRole("button", { name: /^Apply/ })).toBeNull();
  });
});

describe("the buttons under the title (FLW-9, K5)", () => {
  const queueMenu = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Queue" }));
    return screen.findByRole("menu", { name: "Queue" });
  };

  it("offers three: Play, Queue and Similar, and no Folder", () => {
    show();
    const group = screen.getByRole("group", { name: "Actions for this track" });
    expect(Array.from(group.children).map((child) => child.textContent?.trim())).toEqual([
      "Play",
      "Queue",
      "Similar",
    ]);
    for (const child of Array.from(group.children)) expect(child.tagName).toBe("BUTTON");
    expect(screen.queryByRole("button", { name: "Show in folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play next" })).toBeNull();
  });

  it("has no Show in folder button in the File row either", () => {
    show();
    const file = screen.getByText("File").closest(".cp-track-detail__row") as HTMLElement;
    expect(within(file).queryByRole("button")).toBeNull();
  });

  it("opens a menu from Queue holding Play next and Add to queue", async () => {
    show();
    const button = screen.getByRole("button", { name: "Queue" });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    const menu = await queueMenu();
    expect(
      within(menu).getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Play next", "Add to queue"]);
  });

  it("plays, queues next and adds to the queue", async () => {
    const onMessage = vi.fn();
    show({ onMessage });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(player.playQueue).toHaveBeenCalledTimes(1));
    expect(player.playQueue.mock.calls[0][0]).toMatchObject([{ trackId: 12, title: "Strobe" }]);
    fireEvent.click(within(await queueMenu()).getByRole("menuitem", { name: "Play next" }));
    await waitFor(() => expect(player.playNext).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Queue" })).toBeEnabled());
    fireEvent.click(within(await queueMenu()).getByRole("menuitem", { name: "Add to queue" }));
    await waitFor(() => expect(player.addToQueue).toHaveBeenCalledTimes(1));
    expect(onMessage).toHaveBeenCalledWith("1 track added to the queue");
  });

  it("closes the menu on Escape and returns focus to Queue", async () => {
    show();
    const button = screen.getByRole("button", { name: "Queue" });
    button.focus();
    const menu = await queueMenu();
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Queue" })).toBeNull());
    expect(button).toHaveFocus();
  });

  it("still opens a menu with the one item when only one of next/end is available", async () => {
    delete (player as Record<string, unknown>).playNext;
    show();
    const menu = await queueMenu();
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Add to queue",
    ]);
  });

  it("has no Queue button when neither is available", () => {
    delete (player as Record<string, unknown>).playNext;
    delete (player as Record<string, unknown>).addToQueue;
    show();
    expect(screen.queryByRole("button", { name: "Queue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("acts on every selected track, except Similar tracks, which uses the first", async () => {
    const rows = [TRACK, { ...TRACK, id: 13, title: "Ghosts" }, { ...TRACK, id: 14, title: "Raise" }];
    const gather = vi.fn().mockResolvedValue(rows);
    show({ selectionCount: 3, gatherSelectedRows: gather });
    fireEvent.click(within(await queueMenu()).getByRole("menuitem", { name: "Add to queue" }));
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
    // The sentence is gone; the folded heading says it in three words.
    expect(screen.queryByText(/Select the track and choose/)).toBeNull();
    expect(screen.queryByText(/drag it onto one/)).toBeNull();
    expect(screen.queryByText(/right-click/i)).toBeNull();
    expect(section("Where it is")).toHaveTextContent("Where it is · Not in any Collection");
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
