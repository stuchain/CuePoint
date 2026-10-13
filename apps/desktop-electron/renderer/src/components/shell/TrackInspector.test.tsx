/**
 * Track Inspector container (DEC-018, DEC-024).
 *
 * Phase 2 ships the container, not its contents, so these tests are about the
 * promises the container makes: it remembers its width and whether it is
 * showing, it can be operated without a mouse, and a width stored on a bigger
 * window cannot push the content area off-screen.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLayoutEffect, type ReactElement } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { InspectorSlotProvider, useInspectorSlot } from "./inspectorSlot";
import { PageActiveContext } from "./pageActive";
import { useReportSelectedTrack } from "./useReportSelectedTrack";
import { TrackInspector } from "./TrackInspector";
import { setSelectedTrack } from "./selectedTrack";
import { INSPECTOR_STORAGE_KEY } from "./inspectorState";

// Outside a provider the scale is the default, 1.5×: 213 in 1× units draws as 320px.
const DEFAULT_PX = 320;
const MIN_PX = 221;

const panel = () => screen.getByRole("complementary", { name: /track details/i });
const hide = () => screen.getByRole("button", { name: /hide track details/i });
const reveal = () => screen.getByRole("button", { name: /show track details/i });
const handle = () => screen.getByRole("separator", { name: /resize track details/i });

const SELECTED = { id: 12, key: "8A", title: "Strobe" };

/** Inside a router, on the Library unless a test says otherwise (K1 keys its choice by page). */
function render(ui: ReactElement, path = "/library") {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <InspectorSlotProvider>{ui}</InspectorSlotProvider>
    </MemoryRouter>,
  );
}

/** What the user chose before this mount, per page. */
function choose(choice: Record<string, "open" | "closed">, width = 213) {
  localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width, choice, unit: "1x" }));
}

/** Opens the panel the way a user sees it open: a track is selected. */
function select() {
  act(() => setSelectedTrack(SELECTED));
}

function stored() {
  return JSON.parse(localStorage.getItem(INSPECTOR_STORAGE_KEY) ?? "{}");
}

beforeEach(() => {
  window.innerWidth = 1280;
});

afterEach(() => {
  setSelectedTrack(null);
  localStorage.clear();
});

describe("TrackInspector", () => {
  // Most of what follows is about the open panel, which a selected track opens (K1).
  beforeEach(() => select());

  it("renders at its default width", () => {
    render(<TrackInspector />);
    expect(panel()).toHaveStyle({ width: `${DEFAULT_PX}px` });
  });

  it("shows an empty state explaining what will appear here", () => {
    // DEC-024: the container ships with no track data wired to it, so the
    // empty state is what a user actually sees for the whole of Phase 2.
    render(<TrackInspector />);
    expect(screen.getByText(/Nothing selected on this page/i)).toBeInTheDocument();
  });

  it("renders content a later phase provides instead of the empty state", () => {
    render(
      <TrackInspector>
        <p>Strobe details</p>
      </TrackInspector>,
    );

    expect(screen.getByText("Strobe details")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing selected/i)).not.toBeInTheDocument();
  });


  describe("named Track details (INS-1)", () => {
    it("headlines the panel Track details", () => {
      render(<TrackInspector />);
      expect(screen.getByRole("heading", { name: "Track details" })).toBeInTheDocument();
      expect(hide()).toHaveAttribute("title", "Hide track details (Ctrl+I)");
    });
  });

  describe("hidden, it is a labelled tab (INS-2)", () => {
    const hideIt = async () => {
      choose({ library: "closed" });
      const user = userEvent.setup();
      render(<TrackInspector />);
      return user;
    };

    it("says what it is, not just a chevron", async () => {
      await hideIt();
      const tab = reveal();
      expect(tab).toHaveTextContent("Details");
      expect(tab).toHaveAttribute("title", "Show track details (Ctrl+I)");
    });

    it("shows the selected track's title on the tab", async () => {
      await hideIt();
      expect(reveal()).toHaveTextContent("Strobe");
      expect(reveal()).toHaveAccessibleName("Show track details: Strobe");
    });

    it("follows the selection while hidden", async () => {
      await hideIt();
      act(() => setSelectedTrack({ id: 13, key: null, title: "Ride" }));
      expect(reveal()).toHaveTextContent("Ride");
      expect(reveal()).toHaveAccessibleName("Show track details: Ride");
    });

    it("comes back with one click", async () => {
      const user = await hideIt();
      await user.click(reveal());
      expect(panel()).toBeInTheDocument();
    });
  });

  describe("hiding", () => {
    it("hides the panel and offers a way back", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);

      await user.click(hide());

      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
      expect(reveal()).toBeInTheDocument();
    });

    it("gives the space back to the content when hidden", async () => {
      // The point of hiding: only a small reveal control remains, so the panel
      // is not still occupying a column of the shell grid.
      const user = userEvent.setup();
      const { container } = render(<TrackInspector />);

      await user.click(hide());

      expect(container.querySelector(".cp-inspector--hidden")).not.toBeNull();
      expect(container.querySelector(".cp-inspector__body")).toBeNull();
    });

    it("persists being hidden", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);

      await user.click(hide());

      expect(stored().choice).toEqual({ library: "closed" });
      expect(stored().visible).toBeUndefined();
    });

    it("restores a hidden panel on a fresh mount", () => {
      choose({ library: "closed" });

      render(<TrackInspector />);

      expect(reveal()).toBeInTheDocument();
    });

    it("toggles with Ctrl+I", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);

      await user.keyboard("{Control>}i{/Control}");
      expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

      await user.keyboard("{Control>}i{/Control}");
      expect(panel()).toBeInTheDocument();
    });

    it("reports its state through aria-expanded", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      expect(hide()).toHaveAttribute("aria-expanded", "true");

      await user.click(hide());

      expect(reveal()).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("resizing", () => {
    it("exposes a keyboard-reachable resize handle", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);

      await user.tab();

      expect(handle()).toHaveFocus();
    });

    it("widens with the left arrow key and narrows with the right", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      await user.keyboard("{ArrowLeft}");
      expect(panel()).toHaveStyle({ width: `${DEFAULT_PX + 16}px` });

      await user.keyboard("{ArrowRight}");
      expect(panel()).toHaveStyle({ width: `${DEFAULT_PX}px` });
    });

    it("persists a width changed from the keyboard", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      await user.keyboard("{ArrowLeft}");

      expect(stored().width).toBe(224); // 336px at 1.5×, kept in 1× units
      expect(stored().unit).toBe("1x");
    });

    it("will not narrow below the minimum", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      for (let i = 0; i < 40; i += 1) await user.keyboard("{ArrowRight}");

      expect(panel()).toHaveStyle({ width: `${MIN_PX}px` });
    });

    it("stores a clamped width at the minimum edge", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      for (let i = 0; i < 40; i += 1) await user.keyboard("{ArrowRight}");

      // 221px at 1.5x; the stored 1x width must not sink below 147.
      expect(stored().width).toBeGreaterThanOrEqual(147);
      await user.keyboard("{ArrowLeft}");
      expect(panel()).toHaveStyle({ width: `${MIN_PX + 16}px` });
    });

    it("will not widen past half the window", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      for (let i = 0; i < 60; i += 1) await user.keyboard("{ArrowLeft}");

      expect(panel()).toHaveStyle({ width: "640px" });
    });

    it("reports its width to assistive technology", () => {
      render(<TrackInspector />);
      expect(handle()).toHaveAttribute("aria-valuenow", String(DEFAULT_PX));
    });
  });

  describe("a width stored on a different window", () => {
    it("clamps rather than pushing the content off-screen", () => {
      // Sized on a wide monitor, reopened on a laptop.
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ width: 1200, choice: {}, unit: "1x" }),
      );

      render(<TrackInspector />);

      expect(panel()).toHaveStyle({ width: "640px" });
    });

    it("keeps the stored width so it returns when there is room", () => {
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ width: 1200, choice: {}, unit: "1x" }),
      );

      render(<TrackInspector />);

      // Rendered clamped, but the user's choice is not overwritten.
      expect(stored().width).toBe(1200);
    });
  });

  describe("width follows the text size (R2-4)", () => {
    const at = (scale: number) => {
      localStorage.setItem("cuepoint-ui-lab-scale", String(scale));
      return render(
        <ScaleProvider>
          <TrackInspector />
        </ScaleProvider>,
      );
    };

    afterEach(() => localStorage.removeItem("cuepoint-ui-lab-scale"));

    it.each([
      [1, 213],
      [1.5, 320],
      [2, 426],
      [3, 639],
    ])("draws the default at %s× as %spx", (scale, px) => {
      at(scale);
      expect(panel()).toHaveStyle({ width: `${px}px` });
      expect(handle()).toHaveAttribute("aria-valuenow", String(px));
    });

    it("draws a legacy 320 as the default, 426px at 2x", () => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 320, visible: true }));
      at(2);
      expect(panel()).toHaveStyle({ width: "426px" });
    });

    it("divides a legacy pixel width by the scale once", () => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 400, visible: true }));
      at(2);
      expect(panel()).toHaveStyle({ width: "400px" });
      expect(stored()).toEqual({ width: 200, choice: {}, unit: "1x" });
    });
  });
});

describe("TrackInspector follows the selection, page by page (K1, DEC-280)", () => {
  const tab = () => screen.getByRole("button", { name: /show track details/i });
  const noPanel = () => expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

  /** A page that fills the slot and says whether a selection may open the panel. */
  function Page({ autoOpen = true }: { autoOpen?: boolean }) {
    useInspectorSlot(<p>page content</p>, { autoOpen });
    return null;
  }

  function Links() {
    const navigate = useNavigate();
    return (
      <>
        <button type="button" onClick={() => navigate("/clean")}>
          to clean
        </button>
        <button type="button" onClick={() => navigate("/library")}>
          to library
        </button>
      </>
    );
  }

  it("is the slim Details tab before anything is selected", () => {
    render(<TrackInspector />);
    noPanel();
    expect(tab()).toHaveTextContent("Details");
    expect(tab()).toHaveAccessibleName("Show track details");
  });

  it("opens when a selection appears and folds when it clears", () => {
    render(<TrackInspector />);
    select();
    expect(panel()).toBeInTheDocument();

    act(() => setSelectedTrack(null));
    noPanel();
    expect(tab()).toBeInTheDocument();
  });

  it("stores nothing for an automatic open or fold", () => {
    render(<TrackInspector />);
    select();
    act(() => setSelectedTrack(null));
    expect(stored().choice).toEqual({});
  });

  it("keeps a manual close on that page only", async () => {
    const user = userEvent.setup();
    select();
    render(
      <>
        <Links />
        <TrackInspector />
      </>,
    );
    await user.click(hide());
    noPanel();

    await user.click(screen.getByRole("button", { name: "to clean" }));
    act(() => setSelectedTrack({ id: 50, key: null, title: "On Clean" }));
    expect(panel()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "to library" }));
    noPanel();
    expect(stored().choice).toEqual({ library: "closed" });
  });

  it("keeps a manual close through the selection clearing and coming back", async () => {
    const user = userEvent.setup();
    select();
    render(<TrackInspector />);
    await user.click(hide());

    act(() => setSelectedTrack(null));
    select();

    noPanel();
  });

  it("keeps a manual open with nothing selected", async () => {
    const user = userEvent.setup();
    render(<TrackInspector />);
    await user.click(tab());
    expect(panel()).toBeInTheDocument();
    expect(screen.getByText(/Nothing selected on this page/i)).toBeInTheDocument();

    select();
    act(() => setSelectedTrack(null));
    expect(panel()).toBeInTheDocument();
    expect(stored().choice).toEqual({ library: "open" });
  });

  it("opens and closes with Ctrl+I as a choice for the page", async () => {
    const user = userEvent.setup();
    render(<TrackInspector />);

    await user.keyboard("{Control>}i{/Control}");
    expect(panel()).toBeInTheDocument();
    expect(stored().choice).toEqual({ library: "open" });

    select();
    await user.keyboard("{Control>}i{/Control}");
    noPanel();
    expect(stored().choice).toEqual({ library: "closed" });
  });

  it("treats a page under a nested destination as that destination", async () => {
    const user = userEvent.setup();
    select();
    render(<TrackInspector />, "/discover/artist/7");
    await user.click(hide());
    expect(stored().choice).toEqual({ discover: "closed" });
  });

  it("moves focus only when the user toggles, never when the selection opens or folds it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">elsewhere</button>
        <TrackInspector />
      </>,
    );
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();

    select();
    expect(panel()).toBeInTheDocument();
    expect(elsewhere).toHaveFocus();

    act(() => setSelectedTrack(null));
    noPanel();
    expect(elsewhere).toHaveFocus();

    await user.click(tab());
    expect(hide()).toHaveFocus();

    // A toggle's focus move is spent: a later automatic change does not repeat it.
    elsewhere.focus();
    await user.click(hide());
    expect(tab()).toHaveFocus();
    elsewhere.focus();
    select();
    expect(elsewhere).toHaveFocus();
  });

  describe("a page whose slot does not allow auto-open", () => {
    it("never opens by itself, and keeps its content for when the user opens it", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Page autoOpen={false} />
          <TrackInspector>
            <p>kept</p>
          </TrackInspector>
        </>,
      );
      select();
      noPanel();

      await user.click(tab());
      expect(panel()).toBeInTheDocument();
    });

    it("opens by itself again on a page that allows it", () => {
      const view = render(
        <>
          <Page autoOpen={false} />
          <TrackInspector />
        </>,
      );
      select();
      noPanel();

      view.rerender(
        <MemoryRouter initialEntries={["/library"]}>
          <InspectorSlotProvider>
            <Page />
            <TrackInspector />
          </InspectorSlotProvider>
        </MemoryRouter>,
      );
      expect(panel()).toBeInTheDocument();
    });
  });

  it("does not open for a selection reported by a hidden kept page", () => {
    function Reporter() {
      useReportSelectedTrack(SELECTED);
      return null;
    }
    render(
      <>
        <PageActiveContext.Provider value={false}>
          <Reporter />
        </PageActiveContext.Provider>
        <TrackInspector />
      </>,
    );
    noPanel();
  });

  it("opens for the same selection reported by the page on screen", () => {
    function Reporter() {
      useReportSelectedTrack(SELECTED);
      return null;
    }
    render(
      <>
        <Reporter />
        <TrackInspector />
      </>,
    );
    expect(panel()).toBeInTheDocument();
  });

  describe("navigating between pages", () => {
    /** Records whether the panel is in the DOM at every commit that follows a page change. */
    function CommitProbe({ seen }: { seen: boolean[] }) {
      useLocation();
      useLayoutEffect(() => {
        seen.push(document.querySelector("aside.cp-inspector") !== null);
      });
      return null;
    }

    it("never renders open on the new page for the old page's selection, in any commit", async () => {
      const user = userEvent.setup();
      const seen: boolean[] = [];
      select();
      render(
        <>
          <Links />
          <TrackInspector />
          <CommitProbe seen={seen} />
        </>,
      );
      expect(panel()).toBeInTheDocument();

      // The selection was seen on the Library; Clean has no choice and has not selected.
      seen.length = 0;
      await user.click(screen.getByRole("button", { name: "to clean" }));
      noPanel();
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((open) => !open)).toBe(true);
    });

    it("does the same when the old page's panel was closed by hand", async () => {
      const user = userEvent.setup();
      const seen: boolean[] = [];
      select();
      render(
        <>
          <Links />
          <TrackInspector />
          <CommitProbe seen={seen} />
        </>,
      );
      await user.click(hide());

      seen.length = 0;
      await user.click(screen.getByRole("button", { name: "to clean" }));
      expect(seen.every((open) => !open)).toBe(true);
      noPanel();
    });

    it("opens for the new page's own selection", async () => {
      const user = userEvent.setup();
      select();
      render(
        <>
          <Links />
          <TrackInspector />
        </>,
      );
      await user.click(screen.getByRole("button", { name: "to clean" }));
      noPanel();

      act(() => setSelectedTrack({ id: 99, key: null, title: "Other" }));
      expect(panel()).toBeInTheDocument();
    });
  });

  describe("entrance (K1)", () => {
    it("plays for a toggle, not for a selection that opens the panel", () => {
      render(<TrackInspector />);
      select();
      expect(panel()).not.toHaveAttribute("data-entering");
    });

    it("does not carry a toggle's entrance over to a later automatic open", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Links />
          <TrackInspector />
        </>,
      );
      await user.click(tab());
      expect(panel()).toHaveAttribute("data-entering");

      // Clean has no choice and nothing selected, so it is folded there; its selection
      // then opens the panel without the entrance.
      await user.click(screen.getByRole("button", { name: "to clean" }));
      noPanel();
      select();
      expect(panel()).not.toHaveAttribute("data-entering");
    });
  });
});
