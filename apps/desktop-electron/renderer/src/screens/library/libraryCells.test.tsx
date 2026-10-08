/**
 * The marker on an edited value, and the Key cell (LIB-9, DEC-201).
 *
 * The marker is a letter or a dot, which means nothing until someone says so.
 * It says so on hover, in words, through `Hint`; it is not a Tab stop.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { OverriddenValue } from "./libraryCells";

function row(overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id: 1,
    rekordbox_track_id: "1",
    title: "Strobe",
    artist: "deadmau5",
    remixer: null,
    album: null,
    label: null,
    genre: null,
    key: "8A",
    bpm: 128,
    year: null,
    duration_seconds: 300,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: "/m/1.mp3",
    effective_rating: null,
    rating_source: null,
    favorite: false,
    ...overrides,
  };
}

describe("the edited-value marker", () => {
  const typed = row({
    overridden: ["bpm"],
    effective_bpm: 126,
    override_sources: { bpm: "cuepoint" },
  });

  it("is not a Tab stop, and its words are in the cell's own text for a reader", async () => {
    render(
      <div>
        <OverriddenValue row={typed} field="bpm" />
        <button type="button">next</button>
      </div>,
    );

    const marker = screen.getByRole("img", { name: "BPM typed by you. Rekordbox has 128.0." });
    expect(marker).toHaveAttribute("tabindex", "-1");

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "next" })).toHaveFocus();
  });

  it("keeps Enter and F10 to itself when it has focus", () => {
    const seen = vi.fn();
    render(
      <div onKeyDown={seen}>
        <OverriddenValue row={typed} field="bpm" />
      </div>,
    );
    const marker = screen.getByRole("img");
    fireEvent.keyDown(marker, { key: "Enter" });
    fireEvent.keyDown(marker, { key: "F10" });
    expect(seen).not.toHaveBeenCalled();
    fireEvent.keyDown(marker, { key: "ArrowDown" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("says it on hover too, through the title", () => {
    render(<OverriddenValue row={typed} field="bpm" />);
    expect(screen.getByRole("img")).toHaveAttribute("title", "BPM typed by you. Rekordbox has 128.0.");
  });

  it("says a value from Beatport came from Beatport", () => {
    const applied = row({
      overridden: ["genre"],
      effective_genre: "Techno",
      override_sources: { genre: "beatport" },
    });
    render(<OverriddenValue row={applied} field="genre" />);

    expect(screen.getByRole("img")).toHaveTextContent("B");
    expect(screen.getByRole("img")).toHaveAttribute(
      "title",
      "Genre applied from Beatport. Rekordbox has none.",
    );
  });
});

describe("the Key cell", () => {
  it("is a dash when no Beatport key is known", () => {
    const { container } = render(<OverriddenValue row={row({ effective_key: null })} field="key" />);
    expect(container).toHaveTextContent("—");
  });

  it("carries no marker for a key that came from Beatport", () => {
    const { container } = render(
      <OverriddenValue
        row={row({ effective_key: "8A", key_source: "beatport", overridden: [] })}
        field="key"
      />,
    );
    expect(container).toHaveTextContent("8A");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("marks the user's own key as theirs, and not as Beatport's", () => {
    render(
      <OverriddenValue
        row={row({
          effective_key: "9A",
          key_source: "yours",
          overridden: ["key"],
          override_sources: { key: "cuepoint" },
        })}
        field="key"
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "title",
      "Key typed by you. Rekordbox's key is not used.",
    );
    expect(screen.getByRole("img")).not.toHaveTextContent("B");
  });
});
