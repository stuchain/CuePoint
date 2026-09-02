/**
 * Track Inspector container (DEC-018, DEC-024).
 *
 * Phase 2 ships the container, not its contents, so these tests are about the
 * promises the container makes: it remembers its width and whether it is
 * showing, it can be operated without a mouse, and a width stored on a bigger
 * window cannot push the content area off-screen.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TrackInspector } from "./TrackInspector";
import {
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_STORAGE_KEY,
} from "./inspectorState";

const panel = () => screen.getByRole("complementary", { name: /track inspector/i });
const hide = () => screen.getByRole("button", { name: /hide track inspector/i });
const reveal = () => screen.getByRole("button", { name: /show track inspector/i });
const handle = () => screen.getByRole("separator", { name: /resize track inspector/i });

function stored() {
  return JSON.parse(localStorage.getItem(INSPECTOR_STORAGE_KEY) ?? "{}");
}

beforeEach(() => {
  window.innerWidth = 1280;
});

afterEach(() => {
  localStorage.clear();
});

describe("TrackInspector", () => {
  it("renders at its default width", () => {
    render(<TrackInspector />);
    expect(panel()).toHaveStyle({ width: `${INSPECTOR_DEFAULT_WIDTH}px` });
  });

  it("shows an empty state explaining what will appear here", () => {
    // DEC-024: the container ships with no track data wired to it, so the
    // empty state is what a user actually sees for the whole of Phase 2.
    render(<TrackInspector />);
    expect(screen.getByText(/Select a track to see its details/i)).toBeInTheDocument();
  });

  it("renders content a later phase provides instead of the empty state", () => {
    render(
      <TrackInspector>
        <p>Track details</p>
      </TrackInspector>,
    );

    expect(screen.getByText("Track details")).toBeInTheDocument();
    expect(screen.queryByText(/Select a track/i)).not.toBeInTheDocument();
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

      expect(stored().visible).toBe(false);
    });

    it("restores a hidden panel on a fresh mount", () => {
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ width: 320, visible: false }),
      );

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
      expect(panel()).toHaveStyle({ width: `${INSPECTOR_DEFAULT_WIDTH + 16}px` });

      await user.keyboard("{ArrowRight}");
      expect(panel()).toHaveStyle({ width: `${INSPECTOR_DEFAULT_WIDTH}px` });
    });

    it("persists a width changed from the keyboard", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      await user.keyboard("{ArrowLeft}");

      expect(stored().width).toBe(INSPECTOR_DEFAULT_WIDTH + 16);
    });

    it("will not narrow below the minimum", async () => {
      const user = userEvent.setup();
      render(<TrackInspector />);
      handle().focus();

      for (let i = 0; i < 40; i += 1) await user.keyboard("{ArrowRight}");

      expect(panel()).toHaveStyle({ width: `${INSPECTOR_MIN_WIDTH}px` });
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
      expect(handle()).toHaveAttribute("aria-valuenow", String(INSPECTOR_DEFAULT_WIDTH));
    });
  });

  describe("a width stored on a different window", () => {
    it("clamps rather than pushing the content off-screen", () => {
      // Sized on a wide monitor, reopened on a laptop.
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ width: 1200, visible: true }),
      );

      render(<TrackInspector />);

      expect(panel()).toHaveStyle({ width: "640px" });
    });

    it("keeps the stored width so it returns when there is room", () => {
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ width: 1200, visible: true }),
      );

      render(<TrackInspector />);

      // Rendered clamped, but the user's choice is not overwritten.
      expect(stored().width).toBe(1200);
    });
  });
});
