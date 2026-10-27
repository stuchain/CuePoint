/**
 * Global search (SHELL-04, DEC-023), in its dialog opened from the sidebar (K8, DEC-282).
 *
 * The distinction these tests exist to protect is "no library yet" versus "no
 * matches". DEC-023 accepted that search returns nothing until the Library
 * phase lands, so the empty case is the *normal* case for now — and telling a
 * user "no tracks match" when they have never imported anything sends them
 * looking for the wrong problem.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import { ToastProvider } from "../Toast";
import { SearchDialogHost } from "./GlobalSearch";
import { Sidebar } from "./Sidebar";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebarState";
import searchCss from "./GlobalSearch.css?raw";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
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
  effective_key: "6A",
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
        <Sidebar />
        <SearchDialogHost />
        <Where />
        <button type="button">elsewhere</button>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const input = () => screen.getByRole("combobox", { name: /search library/i });
const searchButton = () => screen.getByRole("button", { name: /^search/i });

async function type(text: string) {
  const user = userEvent.setup();
  mount();
  await user.click(searchButton());
  await user.type(await screen.findByRole("combobox", { name: /search library/i }), text);
  return user;
}

describe("GlobalSearch", () => {
  it("has no search field until the dialog is opened from the sidebar button", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("combobox", { name: /search library/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(searchButton());

    expect(await screen.findByRole("dialog", { name: "Search library" })).toBeInTheDocument();
    expect(input()).toBeInTheDocument();
    expect(input()).toHaveFocus();
  });

  it("does not query the engine for an empty field", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(searchButton());
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
    // One facts line, in the one order: artist · label · key · BPM · year; the title not repeated.
    const facts = document.querySelector(".cp-global-search__meta")!;
    expect(facts).toHaveTextContent("deadmau5 · mau5trap · 6A · 128 BPM · 2009");
    expect(facts.querySelector(".key-chip")).not.toBeNull();
    expect(facts).not.toHaveTextContent("Strobe");
    expect(facts).not.toHaveTextContent("For Lack of a Better Name");
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
    expect(alert).toHaveTextContent("Search did not work.");
    // The reason is a line of its own, and there is a button to try again (M348).
    expect(alert.querySelector(".cp-global-search__reason")).not.toBeNull();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("tries the search again from the failure's button (M348)", async () => {
    searchLibrary.mockRejectedValue(new Error("engine offline"));
    const user = await type("strobe");
    const alert = await screen.findByRole("alert");
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("listbox", { name: /search results/i })).toBeInTheDocument();
  });

  it("keeps the last results up while the next search is out (M370)", async () => {
    const user = await type("stro");
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    await user.type(input(), "b");
    await screen.findByRole("listbox", { name: /search results/i });
    let release: (r: LibrarySearchResponse) => void = () => undefined;
    searchLibrary.mockReturnValue(new Promise<LibrarySearchResponse>((r) => (release = r)));
    await user.type(input(), "e");
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole("listbox", { name: /search results/i })).toBeInTheDocument();
    release(response({ total: 1, tracks: [TRACK] }));
  });

  it("says what Enter and Shift+Enter do (M485)", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    await type("strobe");
    expect(await screen.findByText("Enter opens · Shift+Enter plays")).toBeInTheDocument();
  });

  it("opens the dialog on Ctrl+K, with the field focused", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("dialog", { name: "Search library" })).toBeInTheDocument();
    expect(input()).toHaveFocus();
  });

  it("opens on Ctrl+K from inside a table, whatever has focus", async () => {
    const user = userEvent.setup();
    mount();
    const cell = document.createElement("div");
    cell.tabIndex = 0;
    cell.setAttribute("role", "grid");
    document.body.appendChild(cell);
    cell.focus();

    await user.keyboard("{Control>}k{/Control}");

    expect(await screen.findByRole("combobox", { name: /search library/i })).toBeInTheDocument();
    cell.remove();
  });

  it("opens on Ctrl+K with the sidebar collapsed, from the icon-only button", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
    const user = userEvent.setup();
    mount();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox", { name: /search library/i })).toBeInTheDocument();
    localStorage.clear();
  });

  it("closes on Escape and gives focus back to the sidebar button", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(searchButton());
    await screen.findByRole("combobox", { name: /search library/i });

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(searchButton()).toHaveFocus();
  });

  it("keeps the dialog out of the sidebar's nav", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(searchButton());
    const dialog = await screen.findByRole("dialog", { name: "Search library" });
    expect(screen.getByRole("navigation", { name: /main navigation/i })).not.toContainElement(dialog);
  });

  it("does not take focus from the field when a row's play button is pressed", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    await type("strobe");
    await screen.findByRole("listbox");
    const play = screen.getByLabelText("Play Strobe");
    expect(fireEvent.mouseDown(play)).toBe(false); // default prevented: focus stays in the field
    expect(input()).toHaveFocus();
  });

  it("puts focus on the Library's selected row after Enter, not back on the opener", async () => {
    searchLibrary.mockResolvedValue(response({ total: 1, tracks: [TRACK] }));
    const user = await type("strobe");
    await screen.findByRole("listbox");
    // The Library draws its table a moment after the page changes.
    setTimeout(() => {
      const table = document.createElement("div");
      table.tabIndex = 0;
      table.setAttribute("data-testid", "table");
      table.innerHTML = '<div class="track-table__row track-table__row--selected"></div>';
      document.body.appendChild(table);
    }, 150);

    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByTestId("table")).toHaveFocus(), { timeout: 2000 });
    expect(searchButton()).not.toHaveFocus();
    screen.getByTestId("table").remove();
  });

  it("starts empty each time it opens", async () => {
    const user = await type("strobe");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(searchButton());

    expect(await screen.findByRole("combobox", { name: /search library/i })).toHaveValue("");
  });

  it("does nothing on Ctrl+K while another modal dialog is open", async () => {
    const user = userEvent.setup();
    mount();
    render(
      <div role="dialog" aria-modal="true" aria-label="Something else">
        <button type="button">inside</button>
      </div>,
    );

    await user.keyboard("{Control>}k{/Control}");

    expect(screen.queryByRole("combobox", { name: /search library/i })).not.toBeInTheDocument();
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

    it("marks the matched text in a title, and groups the results as Tracks (C135)", async () => {
      await type("strobe");
      const list = await screen.findByRole("listbox", { name: /search results/i });
      expect(options()[0]!.querySelector("mark")).toHaveTextContent("Strobe");
      expect(options()[1]!.querySelector("mark")).toBeNull();
      expect(screen.getByRole("heading", { name: "Tracks" })).toBeInTheDocument();
      expect(list).toBeInTheDocument();
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
      // The dialog closes, then the page changes.
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
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

  describe("words and landmark (HDR-3, HDR-7)", () => {
    it("tells a one-letter query to keep typing, without asking the library", async () => {
      await type("s");
      expect(await screen.findByText("Keep typing: at least 2 letters")).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(searchLibrary).not.toHaveBeenCalled();
    });

    it("says nothing for an empty field", async () => {
      const user = userEvent.setup();
      mount();
      await user.click(searchButton());
      await screen.findByRole("combobox", { name: /search library/i });
      expect(screen.queryByText(/Keep typing/)).not.toBeInTheDocument();
    });

    it("carries the search landmark on the dialog's form", async () => {
      const user = userEvent.setup();
      const { container } = mount();
      await user.click(searchButton());
      await screen.findByRole("combobox", { name: /search library/i });
      const landmark = screen.getByRole("search");
      expect(landmark).toContainElement(input());
      expect(screen.getByRole("dialog")).toContainElement(landmark);
      expect(container.querySelectorAll("[role='search']")).toHaveLength(1);
    });
  });
});

describe("the command palette look (C135, C119)", () => {
  const rules = parseRules(stripComments(searchCss));
  const decl = (selector: string, property: string) => {
    const rule = rules.filter((r) => selectorList(r.selector).includes(selector) && r.context === "").pop();
    return rule ? Object.fromEntries(declarations(rule.body))[property] : undefined;
  };

  it("is the dialogs' medium width, no wider (M267)", () => {
    expect(decl(".cp-modal:has(.cp-global-search)", "width")).toMatch(/var\(--modal-width-medium\)/);
    expect(searchCss).not.toMatch(/70vw|1500px/);
  });

  it("hangs from the top of the window, not its middle", () => {
    expect(decl(".cp-modal__backdrop:has(.cp-global-search)", "align-items")).toBe("flex-start");
  });

  it("keeps the field and the count in place while the list scrolls", () => {
    expect(decl(".cp-global-search__summary", "flex")).toBe("none");
    expect(decl(".cp-global-search__results", "overflow-y")).toBe("auto");
    expect(decl(".cp-global-search__results", "max-height")).toBeDefined();
  });

  it("does not make titles bold, and sets the matched text heavier, not underlined (M268)", () => {
    expect(decl(".cp-global-search__title", "font-weight")).toBeUndefined();
    expect(decl(".cp-global-search__mark", "font-weight")).toBe("var(--font-weight-bold)");
    expect(decl(".cp-global-search__mark", "text-decoration")).toBe("none");
    expect(decl(".cp-global-search__mark", "background")).toBe("transparent");
  });
});
