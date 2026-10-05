/**
 * A track's cue points and beat grid in the Inspector (WAVE-04, DEC-118).
 *
 * The imported record lists every cue, one line each, says whether the track
 * has a beat grid, and tells a track without cues from one whose cues are still
 * to be read. Read-only like everything else Rekordbox sent: nothing here can
 * be typed into or pressed.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type {
  LibraryTrackDetail,
  TrackCue,
  TrackMarksSummary,
} from "../../api/cuepointBridge.types";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { TrackMarksSection } from "./TrackMarksSection";

const DROP: TrackCue = {
  kind: "cue",
  hot_cue: 0,
  start_ms: 64_025,
  end_ms: null,
  name: "Drop",
  color: "#28e214",
};
const INTRO: TrackCue = {
  kind: "cue",
  hot_cue: null,
  start_ms: 25,
  end_ms: null,
  name: "Intro",
  color: null,
};
const LOOP: TrackCue = {
  kind: "loop",
  hot_cue: 2,
  start_ms: 120_025,
  end_ms: 127_525,
  name: "Build loop",
  color: "#ff8c00",
};

const MARKS: TrackMarksSummary = {
  read: true,
  hot_cues: 2,
  memory_cues: 1,
  cues: [DROP, LOOP, INTRO],
  beat_grid: { markers: 1, bpm: 128, min_bpm: 128, max_bpm: 128, variable: false },
};

function section(): HTMLElement {
  return screen.getByRole("region", { name: "Cue points and beat grid" });
}

describe("the cue points", () => {
  it("lists every cue, one line each, in the order the track plays them", () => {
    render(<TrackMarksSection marks={MARKS} />);
    const lines = within(section())
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(lines).toEqual([
      "Memory · 0:00.0 · Intro",
      "A · 1:04.0 · Drop",
      "C · 2:00.0–2:07.5 · Loop · Build loop",
    ]);
  });

  it("counts them by kind in the heading", () => {
    render(<TrackMarksSection marks={MARKS} />);
    expect(screen.getByRole("heading", { name: "Cues · 2 hot, 1 memory" })).toBeInTheDocument();
  });

  it("shows Rekordbox's colour beside a cue that has one, and none where it has not", () => {
    render(<TrackMarksSection marks={MARKS} />);
    const swatches = section().querySelectorAll<HTMLElement>(".cp-track-detail__cue-colour");
    expect([...swatches].map((s) => s.dataset.colour ?? null)).toEqual([
      null,
      "#28e214",
      "#ff8c00",
    ]);
    expect(swatches[1].style.backgroundColor).not.toBe("");
    expect(swatches[0].style.backgroundColor).toBe("");
    // A swatch is decoration: the line says everything.
    for (const swatch of swatches) expect(swatch).toHaveAttribute("aria-hidden", "true");
  });

  it("says a track has none once the library's marks have been read", () => {
    render(<TrackMarksSection marks={{ ...MARKS, hot_cues: 0, memory_cues: 0, cues: [] }} />);
    expect(screen.getByRole("heading", { name: "No cues" })).toBeInTheDocument();
    expect(within(section()).queryByRole("list")).toBeNull();
  });

  it("says the cues are coming, not missing, before the marks have been read", () => {
    render(
      <TrackMarksSection
        marks={{ read: false, hot_cues: 0, memory_cues: 0, cues: [], beat_grid: null }}
      />,
    );
    expect(screen.queryByText("No cues")).toBeNull();
    expect(screen.queryByText("No beat grid")).toBeNull();
    expect(
      screen.getByText("Cues and the beat grid arrive with the next refresh."),
    ).toBeInTheDocument();
  });
});

describe("the beat grid", () => {
  it("gives a constant grid's tempo", () => {
    render(<TrackMarksSection marks={MARKS} />);
    expect(screen.getByText("Beat grid · 128.00 BPM")).toBeInTheDocument();
  });

  it("calls a grid that changes tempo variable", () => {
    render(
      <TrackMarksSection
        marks={{
          ...MARKS,
          beat_grid: { markers: 3, bpm: 121, min_bpm: 121, max_bpm: 124, variable: true },
        }}
      />,
    );
    expect(screen.getByText("Beat grid · variable, 121.00–124.00 BPM")).toBeInTheDocument();
  });

  it("says a track has none", () => {
    render(<TrackMarksSection marks={{ ...MARKS, beat_grid: null }} />);
    expect(screen.getByText("No beat grid")).toBeInTheDocument();
  });
});

describe("in the Inspector", () => {
  const DETAIL: LibraryTrackDetail = {
    track: {
      id: 12,
      rekordbox_track_id: "101",
      title: "Every Mark",
      artist: "Cue Tester",
      remixer: null,
      album: null,
      label: null,
      genre: null,
      key: null,
      bpm: 128,
      year: null,
      duration_seconds: 372,
      rating: null,
      play_count: null,
      colour: null,
      date_added: null,
      comment: null,
      bitrate: null,
      file_path: "/music/every mark.mp3",
      effective_rating: null,
      rating_source: null,
      favorite: false,
    },
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
    marks: MARKS,
  };

  it("lists the cues in the imported record, after Rekordbox's fields", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    const fromRekordbox = screen.getByRole("heading", { name: "From Rekordbox" });
    const cues = screen.getByRole("heading", { name: "Cues · 2 hot, 1 memory" });
    expect(
      fromRekordbox.compareDocumentPosition(cues) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("A · 1:04.0 · Drop")).toBeInTheDocument();
  });

  it("offers nothing to edit or press among the marks (DEC-118)", () => {
    render(<TrackDetailPanel detail={DETAIL} />);
    expect(within(section()).queryByRole("textbox")).toBeNull();
    expect(within(section()).queryByRole("button")).toBeNull();
  });

  it("shows nothing from an engine older than the marks", () => {
    const { marks: _omitted, ...older } = DETAIL;
    render(<TrackDetailPanel detail={older} />);
    expect(screen.queryByRole("region", { name: "Cue points and beat grid" })).toBeNull();
  });
});
