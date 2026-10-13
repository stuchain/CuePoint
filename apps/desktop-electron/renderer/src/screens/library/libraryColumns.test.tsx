/**
 * What the Library's columns say about themselves (DEC-201, LIB-9).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";

import { defaultLayout, reconcileLayout } from "../../components/table/columnLayout";
import {
  DEFAULT_VISIBLE_COLUMNS,
  LIBRARY_COLUMNS,
  LIBRARY_PREVIOUS_DEFAULT_ORDER,
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

describe("Rating shown by default (LIB-10)", () => {
  const rating = LIBRARY_COLUMNS.find((column) => column.id === "rating")!;

  it("is not hidden by default, so a layout never saved opens with it", () => {
    expect(rating.hiddenByDefault).not.toBe(true);
    const layout = defaultLayout(LIBRARY_COLUMNS, 1);
    expect(layout.find((entry) => entry.id === "rating")?.hidden).toBe(false);
  });

  it("is the user's choice in a layout that was saved: hidden stays hidden", () => {
    const saved = defaultLayout(LIBRARY_COLUMNS, 1).map((entry) =>
      entry.id === "rating" ? { ...entry, hidden: true } : entry,
    );
    const reconciled = reconcileLayout(saved, LIBRARY_COLUMNS, 1);
    expect(reconciled.find((entry) => entry.id === "rating")?.hidden).toBe(true);
    // Reloading the saved layout again, as every start does, changes nothing.
    expect(reconcileLayout(reconciled, LIBRARY_COLUMNS, 1)).toEqual(reconciled);
  });
});

describe("the default column order (DEC-NEW-K1)", () => {
  it("opens on Title, Artist, Key, BPM, Length, Genre, Label, Rating, Album", () => {
    const layout = defaultLayout(LIBRARY_COLUMNS, 1).filter((entry) => !entry.hidden);
    const headers = layout.map((entry) => LIBRARY_COLUMNS.find((c) => c.id === entry.id)!.header);
    expect(headers).toEqual([
      "Title",
      "Artist",
      "Key",
      "BPM",
      "Length",
      "Genre",
      "Label",
      "Rating",
      "Album",
    ]);
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(layout.map((entry) => entry.id));
  });

  it("keeps the previous order for the one-time move, with the same columns", () => {
    expect(LIBRARY_PREVIOUS_DEFAULT_ORDER).toEqual([
      "title",
      "artist",
      "remixer",
      "album",
      "label",
      "genre",
      "key",
      "bpm",
      "duration_seconds",
      "rating",
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
