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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import { ToastProvider } from "../Toast";
import { GlobalSearch } from "./GlobalSearch";
import { trackFromLocationState } from "../../screens/library/libraryLink";
import type {
  LibrarySearchResponse,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";

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

const TRACK: LibraryTrackRow = {
  id: 1,
  rekordbox_track_id: "1",
  title: "Strobe",
  artist: "deadmau5",
  remixer: null,
  album: "For Lack of a Better Name",
  label: "mau5trap",
  genre: null,
  key: "6A",
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

function Where() {
  const location = useLocation();
  const track = trackFromLocationState(location.state);
  return <p data-testid="where">{`${location.pathname}|${track ?? ""}`}</p>;
}

function mount() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/clean"]}>
        <GlobalSearch />
        <Where />
        <button type="button">elsewhere</button>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const input = () => screen.getByRole("combobox", { name: /search library/i });

async function type(text: string) {
  const user = userEvent.setup();
  mount();
  await user.type(screen.getByRole("combobox", { name: /search library/i }), text);
  return user;
}

describe("GlobalSearch", () => {
  it("renders a labelled search field", () => {
    mount();
    expect(input()).toBeInTheDocument();
  });

  it("does not query the engine for an empty field", async () => {
    mount();
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

  it("says a row was found by its key or tempo (FLW-5)", async () => {
    searchLibrary.mockResolvedValue(
      response({
        total: 2,
        tracks: [
          { ...TRACK, id: 1, effective_key: "8A", matched_on: "key" },
          { ...TRACK, id: 2, rekordbox_track_id: "2", title: "Ghosts", effective_bpm: 124, matched_on: "bpm" },
        ],
      }),
    );
    await type("8a");
    expect(await screen.findByText("Key 8A")).toBeInTheDocument();
    expect(screen.getByText("124 BPM")).toBeInTheDocument();
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

  it("says so when the library service is absent", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    await type("strobe");

    expect(
      await screen.findByText("Search will work once CuePoint has finished starting."),
    ).toBeInTheDocument();
  });

  it("surfaces a failed search instead of showing nothing", async () => {
    searchLibrary.mockRejectedValue(new Error("engine offline"));

    await type("strobe");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Search didn't work. Try again.");
    // The cause is for the title, not the sentence (HDR-7).
    expect(alert).toHaveAttribute("title", expect.stringContaining("engine offline"));
    expect(alert).not.toHaveTextContent(/offline/);
  });

  it("focuses the field on Ctrl+K", async () => {
    const user = userEvent.setup();
    mount();
    expect(input()).not.toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");

    expect(input()).toHaveFocus();
  });

  it("closes the results panel on Escape", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    const user = await type("strobe");
    await screen.findByText("Strobe");

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Strobe")).not.toBeInTheDocument();
  });

  describe("the results as a listbox (HDR-1)", () => {
    const SECOND: LibraryTrackRow = { ...TRACK, id: 2, rekordbox_track_id: "2", title: "Ghosts n Stuff" };
    let playQueue: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      playQueue = vi.fn().mockResolvedValue({ ok: true });
      searchLibrary.mockResolvedValue(response({ total: 2, tracks: [TRACK, SECOND] }));
      (window as unknown as { cuepoint?: unknown }).cuepoint = {
        searchLibrary,
        player: { playQueue },
      };
    });

    const options = () => screen.getAllByRole("option");
    const active = () => input().getAttribute("aria-activedescendant");

    it("is a listbox of options the input points at", async () => {
      await type("strobe");
      const list = await screen.findByRole("listbox", { name: /search results/i });
      expect(input()).toHaveAttribute("aria-controls", list.id);
      expect(options()).toHaveLength(2);
      expect(options()[0]).toHaveTextContent("Strobe");
      expect(active()).toBe(options()[0]!.id);
      expect(options()[0]).toHaveAttribute("aria-selected", "true");
    });

    it("moves the active option with the arrow keys and stops at the ends", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");

      await user.keyboard("{ArrowDown}");
      expect(active()).toBe(options()[1]!.id);
      expect(options()[1]).toHaveAttribute("aria-selected", "true");
      expect(options()[0]).toHaveAttribute("aria-selected", "false");

      await user.keyboard("{ArrowDown}");
      expect(active()).toBe(options()[1]!.id);

      await user.keyboard("{ArrowUp}{ArrowUp}");
      expect(active()).toBe(options()[0]!.id);
    });

    it("opens the Library on the active track with Enter", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.keyboard("{ArrowDown}{Enter}");

      expect(screen.getByTestId("where")).toHaveTextContent("/library|2");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(playQueue).not.toHaveBeenCalled();
    });

    it("opens the Library on a clicked row", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.click(options()[1]!);
      expect(screen.getByTestId("where")).toHaveTextContent("/library|2");
    });

    it("plays the active track with Shift+Enter, and stays where it is", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.keyboard("{ArrowDown}{Shift>}{Enter}{/Shift}");

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      const [items, start] = playQueue.mock.calls[0]!;
      expect(start).toBe(0);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ trackId: 2, title: "Ghosts n Stuff", filePath: "/music/strobe.mp3" });
      expect(screen.getByTestId("where")).toHaveTextContent("/clean|");
    });

    it("plays from the small play button on a row without opening it", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.click(screen.getByLabelText("Play Strobe"));

      await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
      expect(playQueue.mock.calls[0]![0][0]).toMatchObject({ trackId: 1 });
      expect(screen.getByTestId("where")).toHaveTextContent("/clean|");
    });

    it("keeps the play buttons out of the listbox's tree", async () => {
      await type("strobe");
      const list = await screen.findByRole("listbox");
      const buttons = list.querySelectorAll("button");
      expect(buttons).toHaveLength(2);
      for (const button of buttons) {
        expect(button).toHaveAttribute("aria-hidden", "true");
        expect(button).toHaveAttribute("tabindex", "-1");
      }
    });

    it("only reopens a closed panel on ArrowDown, without stepping", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

      await user.keyboard("{ArrowDown}");
      await screen.findByRole("listbox");
      expect(active()).toBe(options()[0]!.id);

      await user.keyboard("{ArrowDown}");
      expect(active()).toBe(options()[1]!.id);
    });

    it("says why when the player refuses the track", async () => {
      playQueue.mockResolvedValue({ ok: false, code: "missing", error: "That file is missing." });
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.keyboard("{Shift>}{Enter}{/Shift}");
      expect(await screen.findByText("That file is missing.")).toBeInTheDocument();
    });

    it("does nothing on Enter with no result to open", async () => {
      searchLibrary.mockResolvedValue(response({ total: 0, tracks: [] }));
      const user = await type("zzzz");
      await screen.findByText(/No tracks match/i);
      await user.keyboard("{Enter}");
      expect(screen.getByTestId("where")).toHaveTextContent("/clean|");
    });
  });

  describe("closing the panel (HDR-2)", () => {
    beforeEach(() => {
      searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    });

    it("closes on a pointer press outside the search", async () => {
      await type("strobe");
      await screen.findByRole("listbox");

      fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("stays open on a press inside the panel", async () => {
      await type("strobe");
      const list = await screen.findByRole("listbox");
      fireEvent.pointerDown(list);
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes when focus leaves the search", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      await user.tab();
      expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("opens again when the field is focused", async () => {
      const user = await type("strobe");
      await screen.findByRole("listbox");
      fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      await user.click(input());
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
    });
  });

  describe("words and landmark (HDR-3, HDR-7)", () => {
    it("tells a one-letter query to keep typing, without asking the library", async () => {
      await type("s");
      expect(await screen.findByText("Keep typing: at least 2 letters")).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(searchLibrary).not.toHaveBeenCalled();
    });

    it("says nothing for an empty field", async () => {
      mount();
      await userEvent.click(input());
      expect(screen.queryByText(/Keep typing/)).not.toBeInTheDocument();
    });

    it("keeps the shortcut in the placeholder", () => {
      mount();
      expect(input()).toHaveAttribute("placeholder", "Search library…  Ctrl+K");
    });

    it("carries the search landmark on its own container", () => {
      const { container } = mount();
      const landmark = screen.getByRole("search");
      expect(landmark).toContainElement(input());
      expect(landmark).toHaveClass("cp-global-search");
      expect(container.querySelectorAll("[role='search']")).toHaveLength(1);
    });
  });
});
