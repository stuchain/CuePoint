/**
 * Global search (SHELL-04, DEC-023).
 *
 * The distinction these tests exist to protect is "no library yet" versus "no
 * matches". DEC-023 accepted that search returns nothing until the Library
 * phase lands, so the empty case is the *normal* case for now — and telling a
 * user "no tracks match" when they have never imported anything sends them
 * looking for the wrong problem.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GlobalSearch } from "./GlobalSearch";
import type { LibrarySearchResponse } from "../../api/cuepointBridge.types";

function response(overrides: Partial<LibrarySearchResponse> = {}): LibrarySearchResponse {
  return {
    query: "strobe",
    total: 0,
    limit: 50,
    offset: 0,
    tracks: [],
    library_empty: false,
    ...overrides,
  };
}

const TRACK = {
  id: 1,
  rekordbox_track_id: "1",
  title: "Strobe",
  artist: "deadmau5",
  album: "For Lack of a Better Name",
  label: "mau5trap",
  genre: null,
  key: "6A",
  bpm: 128,
  year: 2009,
  duration_seconds: 634,
  file_path: "/music/strobe.mp3",
};

let searchLibrary: ReturnType<typeof vi.fn>;

beforeEach(() => {
  searchLibrary = vi.fn().mockResolvedValue(response());
  (window as unknown as { cuepoint?: unknown }).cuepoint = { searchLibrary };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

async function type(text: string) {
  const user = userEvent.setup();
  render(<GlobalSearch />);
  await user.type(screen.getByRole("combobox", { name: /search library/i }), text);
  return user;
}

describe("GlobalSearch", () => {
  it("renders a labelled search field", () => {
    render(<GlobalSearch />);
    expect(screen.getByRole("combobox", { name: /search library/i })).toBeInTheDocument();
  });

  it("does not query the engine for an empty field", async () => {
    render(<GlobalSearch />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchLibrary).not.toHaveBeenCalled();
  });

  it("does not query the engine for a single character", async () => {
    // One character over a 50,000-track library is a request for almost every
    // row, and the user is still typing.
    await type("s");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(searchLibrary).not.toHaveBeenCalled();
  });

  it("queries the engine once typing settles", async () => {
    await type("strobe");
    await waitFor(() => expect(searchLibrary).toHaveBeenCalled());
    expect(searchLibrary).toHaveBeenCalledWith({ q: "strobe" });
  });

  it("debounces a burst of typing into a single request", async () => {
    await type("strobe");
    await waitFor(() => expect(searchLibrary).toHaveBeenCalled());
    // Six characters typed, one request — without the debounce this would be
    // five (every keystroke past the minimum length).
    expect(searchLibrary).toHaveBeenCalledTimes(1);
  });

  it("trims the query it sends", async () => {
    await type("  strobe  ");
    await waitFor(() => expect(searchLibrary).toHaveBeenCalledWith({ q: "strobe" }));
  });

  it("says the library is empty rather than reporting no matches", async () => {
    searchLibrary.mockResolvedValue(response({ library_empty: true }));

    await type("strobe");

    expect(await screen.findByText(/No library yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/No tracks match/i)).not.toBeInTheDocument();
  });

  it("reports no matches when the library has tracks but none match", async () => {
    searchLibrary.mockResolvedValue(response({ library_empty: false, total: 0 }));

    await type("zzzz");

    expect(await screen.findByText(/No tracks match/i)).toBeInTheDocument();
    expect(screen.queryByText(/No library yet/i)).not.toBeInTheDocument();
  });

  it("lists matching tracks", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));

    await type("strobe");

    expect(await screen.findByText("Strobe")).toBeInTheDocument();
    expect(screen.getByText("deadmau5")).toBeInTheDocument();
    expect(screen.getByText(/mau5trap/)).toBeInTheDocument();
  });

  it("reports how many of the matches are shown", async () => {
    // The engine returns the unpaged total precisely so this needs no second
    // request.
    searchLibrary.mockResolvedValue(response({ total: 340, tracks: [TRACK] }));

    await type("strobe");

    expect(await screen.findByText("Showing 1 of 340")).toBeInTheDocument();
  });

  it("says so when the engine bridge is absent", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    await type("strobe");

    expect(await screen.findByText(/engine, which is not connected/i)).toBeInTheDocument();
  });

  it("surfaces a failed search instead of showing nothing", async () => {
    searchLibrary.mockRejectedValue(new Error("engine offline"));

    await type("strobe");

    expect(await screen.findByRole("alert")).toHaveTextContent(/engine offline/);
  });

  it("focuses the field on Ctrl+K", async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);
    const input = screen.getByRole("combobox", { name: /search library/i });
    expect(input).not.toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");

    expect(input).toHaveFocus();
  });

  it("closes the results panel on Escape", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    const user = await type("strobe");
    await screen.findByText("Strobe");

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Strobe")).not.toBeInTheDocument();
  });
});
