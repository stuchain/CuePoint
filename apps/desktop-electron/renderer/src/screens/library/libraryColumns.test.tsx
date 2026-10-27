/**
 * What the Library's columns say about themselves (DEC-201, LIB-9).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";

import { defaultLayout, reconcileLayout } from "../../components/table/columnLayout";
import {
  DEFAULT_VISIBLE_COLUMNS,
  HEADING_MIN_PX,
  LIBRARY_COLUMNS,
  LIBRARY_PREVIOUS_DEFAULT_ORDER,
  type ShownTrackRow,
} from "./libraryColumns";

describe("the Key column", () => {
  const key = LIBRARY_COLUMNS.find((column) => column.id === "key")!;

  it("says where keys come from", () => {
    expect(key.header).toBe("Key");
    expect(key.hint).toBe("Keys come from Beatport matches");
  });

  it("has no other column explaining itself this way", () => {
    expect(LIBRARY_COLUMNS.filter((column) => column.hint).map((column) => column.id)).toEqual([
      "key",
    ]);
  });
});

describe("the Title column (FLW-5)", () => {
  const title = LIBRARY_COLUMNS.find((column) => column.id === "title")!;
  const row = (extra: Partial<LibraryTrackRow>) =>
    ({ id: 1, title: "Strobe", ...extra }) as LibraryTrackRow;

  it("says a row a search found by its key or tempo was found that way", () => {
    render(<div>{title.render(row({ effective_key: "8A", matched_on: "key" }))}</div>);
    expect(screen.getByText("Key 8A")).toBeInTheDocument();
    render(<div>{title.render(row({ effective_bpm: 124, matched_on: "bpm" }))}</div>);
    expect(screen.getByText("124 BPM")).toBeInTheDocument();
  });

  it("adds nothing beside a row found by its words", () => {
    const { container } = render(<div>{title.render(row({ matched_on: null }))}</div>);
    expect(container.textContent).toBe("Strobe");
  });
});

describe("Rating (LIB-10, moved by M85 and D12)", () => {
  const rating = LIBRARY_COLUMNS.find((column) => column.id === "rating")!;
  const row = (extra: Partial<LibraryTrackRow>) => ({ id: 1, title: "Strobe", ...extra }) as LibraryTrackRow;

  it("waits in the Columns list on a layout never saved: six columns fit the default window", () => {
    // LIB-10 showed it by default; at the default window Rating sat behind the scroll bar (M85).
    expect(rating.hiddenByDefault).toBe(true);
    const layout = defaultLayout(LIBRARY_COLUMNS, 1);
    expect(layout.find((entry) => entry.id === "rating")?.hidden).toBe(true);
  });

  it("draws an unrated track as blank, not a dash (M94)", () => {
    const { container } = render(<div>{rating.render(row({ effective_rating: null }))}</div>);
    expect(container.textContent).toBe("");
    const rated = render(<div>{rating.render(row({ effective_rating: 3 }))}</div>);
    expect(rated.getByRole("img", { name: "3 stars" })).toBeInTheDocument();
  });

  it("is the user's choice in a layout that was saved: shown stays shown", () => {
    const saved = defaultLayout(LIBRARY_COLUMNS, 1).map((entry) =>
      entry.id === "rating" ? { ...entry, hidden: false } : entry,
    );
    const reconciled = reconcileLayout(saved, LIBRARY_COLUMNS, 1);
    expect(reconciled.find((entry) => entry.id === "rating")?.hidden).toBe(false);
    // Reloading the saved layout again, as every start does, changes nothing.
    expect(reconcileLayout(reconciled, LIBRARY_COLUMNS, 1)).toEqual(reconciled);
  });
});

describe("the default column order (DEC-NEW-K1)", () => {
  it("opens on Title, Artist, BPM, Key, Length, Genre (D12; M85)", () => {
    const layout = defaultLayout(LIBRARY_COLUMNS, 1).filter((entry) => !entry.hidden);
    const headers = layout.map((entry) => LIBRARY_COLUMNS.find((c) => c.id === entry.id)!.header);
    expect(headers).toEqual([
      "Title",
      "Artist",
      "BPM",
      "Key",
      "Length",
      "Genre",
    ]);
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(layout.map((entry) => entry.id));
  });

  it("keeps the previous order for the one-time move, with the same columns", () => {
    expect(LIBRARY_PREVIOUS_DEFAULT_ORDER).toEqual([
      "title",
      "artist",
      "remixer",
      "key",
      "bpm",
      "duration_seconds",
      "genre",
      "label",
      "rating",
      "album",
      "year",
      "play_count",
      "date_added",
      "colour",
      "bitrate",
      "comment",
      "file_path",
      "match_state",
      "match_score",
      "file_status",
      "artwork",
      "waveform",
      "loudness",
    ]);
    expect([...LIBRARY_PREVIOUS_DEFAULT_ORDER].sort()).toEqual(
      LIBRARY_COLUMNS.map((column) => column.id).sort(),
    );
  });

  it("moves a layout saved in the previous order, and keeps its widths", () => {
    const saved = LIBRARY_PREVIOUS_DEFAULT_ORDER.map((id) => ({ id, width: 123, hidden: id === "label" }));
    const moved = reconcileLayout(saved, LIBRARY_COLUMNS, 1, LIBRARY_PREVIOUS_DEFAULT_ORDER);
    expect(moved.map((entry) => entry.id)).toEqual(LIBRARY_COLUMNS.map((column) => column.id));
    expect(moved.find((entry) => entry.id === "label")?.hidden).toBe(true);
  });
});

describe("the verification round's cells (M88, M94, M95, M382)", () => {
  const column = (id: string) => LIBRARY_COLUMNS.find((entry) => entry.id === id)!;
  const row = (extra: Partial<ShownTrackRow>) => ({ id: 1, title: "Strobe", ...extra }) as ShownTrackRow;

  it("M88: keeps Key, BPM and Length at least as wide as their heading and the sort arrow", () => {
    expect(column("key").minWidthPx).toBe(HEADING_MIN_PX.key);
    expect(column("bpm").minWidthPx).toBe(HEADING_MIN_PX.bpm);
    expect(column("duration_seconds").minWidthPx).toBe(HEADING_MIN_PX.duration_seconds);
    for (const width of Object.values(HEADING_MIN_PX)) expect(width).toBeGreaterThanOrEqual(56);
  });

  it("M94: draws no rating as an empty cell, not a null", () => {
    const { container } = render(<div>{column("rating").render(row({ effective_rating: null, rating: null }))}</div>);
    expect(container.textContent).toBe("");
  });

  it("M95: shows the first genre, not the whole list", () => {
    const { container } = render(
      <div>
        {column("genre").render(
          row({ genre: "House, Tech House", effective_genre: "House, Tech House", genre_primary: "House", genres: ["House", "Tech House"] }),
        )}
      </div>,
    );
    expect(container).toHaveTextContent("House");
    expect(container).not.toHaveTextContent("Tech House");
  });

  it("M382: ticks the title of a row whose rating or favorite was just set, and says Saved", () => {
    render(<div>{column("title").render(row({ just_saved: true }))}</div>);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByText("Strobe")).toBeInTheDocument();
  });

  it("M382: draws no tick on an ordinary row", () => {
    render(<div>{column("title").render(row({}))}</div>);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
