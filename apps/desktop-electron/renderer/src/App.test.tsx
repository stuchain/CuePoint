/**
 * Every screen renders inside the shell frame.
 *
 * SHELL-01 replaced a centered flex column with a grid, and every existing
 * screen was authored against the old container. That makes "does each screen
 * still mount and render its content into the shell's content region" the
 * question this step most needs answered, and a spot check of one screen would
 * not answer it — so all five routes are exercised here.
 *
 * The engine bridge is absent (no `window.cuepoint`), which is a state every
 * screen already has to tolerate: the renderer runs in a browser tab during
 * development.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { LAST_DESTINATION_STORAGE_KEY } from "./components/shell";

/** Several screens also link to Settings, so navigation is driven from the nav. */
function navLink(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: /main navigation/i })).getByRole(
    "link",
    { name },
  );
}

/** `marker` is text unique to that screen, so a route that silently rendered
 * nothing (or rendered the wrong screen) fails rather than passing on the mere
 * presence of a `.screen` element. */
const ROUTES = [
  { link: "Tools", marker: /Select a tool to get started/i },
  { link: "inKey", marker: /CuePoint \/ inKey/i },
  { link: "inCrate", marker: /CuePoint \/ inCrate/i },
  { link: "Results", marker: /Sync with Rekordbox/i },
  { link: "Settings", marker: /Beatport token/i },
];

describe("App shell", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The onboarding dialog would otherwise open over the shell on first run
    // and swallow the navigation clicks.
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    // The app uses a hash router, and jsdom keeps `location.hash` for the whole
    // file. Clearing it is what makes each test start like a fresh launch
    // rather than inheriting the previous test's route.
    window.location.hash = "";
    // jsdom implements neither of these; without stubs they report through the
    // virtual console as errors and defeat the console assertion below.
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    localStorage.clear();
  });

  it("renders the menu bar inside the shell rather than as a fixed overlay", () => {
    const { container } = render(<App />);

    const menubar = container.querySelector(".app-shell__menubar");
    expect(menubar).not.toBeNull();
    expect(menubar?.querySelector(".app-menu-bar")).not.toBeNull();
  });

  it("renders exactly one main region", () => {
    const { container } = render(<App />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("renders the sidebar region", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__sidebar .cp-sidebar")).not.toBeNull();
  });

  it("renders the inspector region", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__inspector .cp-inspector")).not.toBeNull();
  });

  it("keeps the inspector mounted across navigation (DEC-018)", async () => {
    // The promise DEC-018 makes: the Inspector lives in the shell, not in a
    // screen, so moving between destinations never unmounts it. Widths and
    // selections survive navigation because of this, not in spite of it.
    const user = userEvent.setup();
    const { container } = render(<App />);
    const before = container.querySelector(".app-shell__inspector .cp-inspector");

    await user.click(navLink("Settings"));
    await screen.findByText(/Beatport token/i);

    expect(container.querySelector(".app-shell__inspector .cp-inspector")).toBe(before);
  });

  it("mounts the player boundary without giving it any content (DEC-025)", () => {
    // The region exists so Phase 5 fills it by editing PlayerRegion alone, and
    // is empty so it occupies no space until then.
    const { container } = render(<App />);

    const player = container.querySelector(".app-shell__player");
    expect(player).not.toBeNull();
    expect(player).toBeEmptyDOMElement();
  });

  it("renders the status strip", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".app-shell__status .cp-status")).not.toBeNull();
  });

  it("reports engine state in one place, not two", () => {
    // The floating banner was retired in SHELL-07 rather than left alongside
    // the strip: two reporters of the same state can disagree.
    const { container } = render(<App />);

    expect(container.querySelector(".engine-status")).toBeNull();
    expect(container.querySelectorAll(".cp-status__engine")).toHaveLength(1);
  });

  it.each(ROUTES)("renders the $link screen inside the content region", async ({ link, marker }) => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(navLink(link));

    const main = container.querySelector("main.app-main");
    await waitFor(() => {
      expect(main?.querySelector(".screen")).not.toBeNull();
    });
    expect(within(main as HTMLElement).getByText(marker)).toBeInTheDocument();
  });

  it("navigates every route without a console error", async () => {
    const user = userEvent.setup();
    render(<App />);

    for (const route of ROUTES) {
      await user.click(navLink(route.link));
    }

    expect(consoleError).not.toHaveBeenCalled();
  });

  describe("launch destination (DEC-027)", () => {
    it("opens on home when nothing is stored", async () => {
      render(<App />);

      expect(await screen.findByText(/Select a tool to get started/i)).toBeInTheDocument();
    });

    it("reopens on the last-visited destination", async () => {
      const user = userEvent.setup();
      const first = render(<App />);
      await user.click(navLink("Settings"));
      await screen.findByText(/Beatport token/i);
      first.unmount();

      // A fresh mount stands in for a fresh launch: the router starts at "/"
      // either way, and only what is stored can bring it back.
      render(<App />);

      expect(await screen.findByText(/Beatport token/i)).toBeInTheDocument();
    });

    it.each([
      ["a destination that no longer exists", "a-page-that-was-removed"],
      ["a malformed value", "{}"],
      ["an empty value", ""],
    ])("falls back to home given %s, without a blank content area", async (_case, stored) => {
      localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, stored);

      const { container } = render(<App />);

      expect(await screen.findByText(/Select a tool to get started/i)).toBeInTheDocument();
      // The failure this step exists to fix is chrome with an empty content
      // area, which "did it render home" alone would not catch.
      expect(container.querySelector("main.app-main .screen")).not.toBeNull();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("does not drag the user back to the restored page after navigating", async () => {
      const user = userEvent.setup();
      localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, "settings");
      render(<App />);
      await screen.findByText(/Beatport token/i);

      await user.click(navLink("inCrate"));

      expect(await screen.findByText(/CuePoint \/ inCrate/i)).toBeInTheDocument();
    });

    it("remembers the destination it navigated to", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(navLink("Results"));
      await screen.findByText(/Sync with Rekordbox/i);

      expect(localStorage.getItem(LAST_DESTINATION_STORAGE_KEY)).toBe("results");
    });
  });
});

describe("the Library page inside the shell (LIBUI-10)", () => {
  /*
   * The other App tests run without `window.cuepoint`, so the Library page
   * shows its import prompt and never becomes a browser. That is exactly the
   * gap a packaged build fell into: the page filled the Track Inspector, the
   * shell re-rendered, the page rebuilt its content, and React gave up with
   * "Maximum update depth exceeded" — while every renderer test passed.
   *
   * So this mounts the whole App with a library behind it. If the Inspector
   * slot ever re-renders the page again, this test does not fail neatly — it
   * times out, which is what a hang looks like from here.
   */
  const TRACK = {
    id: 1,
    rekordbox_track_id: "1",
    title: "Contact",
    artist: "Someone",
    remixer: null,
    album: "An Album",
    label: "A Label",
    genre: "Techno",
    key: "8A",
    bpm: 128,
    year: 2024,
    duration_seconds: 300,
    rating: 4,
    play_count: 2,
    colour: null,
    date_added: "2026-01-01",
    comment: null,
    bitrate: 320,
    file_path: "C:\\music\\1.mp3",
  };

  beforeEach(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 1200,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 600,
    });

    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getLibrarySummary: vi.fn().mockResolvedValue({
        track_count: 1,
        playlist_count: 0,
        playlist_entry_count: 0,
        library_empty: false,
        source: {
          xml_path: "C:\\dj\\collection.xml",
          imported_at: "2026-09-03T10:00:00Z",
          xml_modified_at: "2026-09-03T09:00:00Z",
          xml_size_bytes: 2048,
          track_count: 1,
          playlist_count: 0,
          exists: true,
          changed: false,
        },
      }),
      browseLibrary: vi.fn(async (params: Record<string, unknown>) => ({
        query: "",
        total: 1,
        limit: Number(params.limit ?? 100),
        offset: Number(params.offset ?? 0),
        tracks: params.fields === "id" ? [] : [TRACK],
        track_ids: params.fields === "id" ? [1] : undefined,
        library_empty: false,
        mode: "browse",
        scope: null,
        sort: params.sort,
        dir: params.dir,
        filters: null,
      })),
      getLibraryPlaylists: vi.fn().mockResolvedValue({ playlists: [], total: 0 }),
      getLibraryFilterFields: vi
        .fn()
        .mockResolvedValue({ fields: [], operators: {}, facetable: [], sortable: ["artist"] }),
      getLibraryTrack: vi
        .fn()
        .mockResolvedValue({ track: TRACK, playlists: [], playlist_count: 0 }),
    };
  });

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  });

  it("browses, and fills the shell's Inspector without looping", async () => {
    render(<App />);
    await userEvent.click(navLink("Library"));

    expect(await screen.findByRole("table", { name: "Library tracks" })).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Contact"));

    // The Inspector is the shell's, and the page reached it.
    const inspector = screen.getByRole("complementary", { name: /track inspector/i });
    await waitFor(() => expect(within(inspector).getByText("Contact")).toBeInTheDocument());
  });

  it("empties the Inspector when the user leaves the page", async () => {
    render(<App />);
    await userEvent.click(navLink("Library"));
    await screen.findByRole("table", { name: "Library tracks" });
    await userEvent.click(await screen.findByText("Contact"));
    const inspector = screen.getByRole("complementary", { name: /track inspector/i });
    await waitFor(() => expect(within(inspector).getByText("Contact")).toBeInTheDocument());

    await userEvent.click(navLink("Settings"));

    // The Inspector survives navigation (DEC-018); what it was describing does
    // not, because that track belongs to a page the user has left.
    await waitFor(() => expect(within(inspector).queryByText("Contact")).toBeNull());
  });
});
