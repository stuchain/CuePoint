/**
 * The player slot (DEC-025).
 *
 * There is nothing to see here, and that is the specification. The tests worth
 * writing are the ones that fail if the region ever starts taking space, since
 * a stray border or min-height on an empty region is the kind of regression
 * that is only ever noticed by eye — and only if someone happens to look at
 * the bottom of the window.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AppShellLayout } from "./AppShellLayout";
import { PlayerRegion } from "./PlayerRegion";

describe("PlayerRegion", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<PlayerRegion />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders no element at all, not an empty one", () => {
    // An empty <div> would be a place for a border or a min-height to attach
    // later, which is how a region that should be invisible acquires a size.
    const { container } = render(<PlayerRegion />);
    expect(container.querySelector("div")).toBeNull();
  });

  it("renders what a later phase puts in it", () => {
    render(
      <PlayerRegion>
        <button type="button">Play</button>
      </PlayerRegion>,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  describe("inside the shell", () => {
    it("leaves the region wrapper empty", () => {
      const { container } = render(
        <AppShellLayout player={<PlayerRegion />}>
          <p>Page</p>
        </AppShellLayout>,
      );

      // The wrapper exists — that is the boundary Phase 5 fills — but there is
      // nothing inside it, so the `auto` grid row has nothing to size to.
      const region = container.querySelector(".app-shell__player");
      expect(region).not.toBeNull();
      expect(region).toBeEmptyDOMElement();
    });

    it("takes space once a later phase fills it", () => {
      // The other half of the promise: the slot is wired, not decorative. If
      // this fails, Phase 5 would mount a player into a region that never
      // shows it.
      const { container } = render(
        <AppShellLayout player={<PlayerRegion>transport</PlayerRegion>}>
          <p>Page</p>
        </AppShellLayout>,
      );

      const region = container.querySelector(".app-shell__player");
      expect(region).not.toBeEmptyDOMElement();
      expect(region?.querySelector(".cp-player")).not.toBeNull();
    });

    it("sits between the content and the status strip", () => {
      // Placement is decided here so Phase 5 does not have to touch the shell.
      const { container } = render(
        <AppShellLayout
          player={<PlayerRegion>transport</PlayerRegion>}
          statusBar={<p>status</p>}
        >
          <p>Page</p>
        </AppShellLayout>,
      );

      const order = Array.from(container.querySelector(".app-shell")?.children ?? []).map(
        (child) => child.className,
      );

      expect(order).toEqual([
        "app-shell__content app-main",
        "app-shell__player",
        "app-shell__status",
      ]);
    });
  });
});
