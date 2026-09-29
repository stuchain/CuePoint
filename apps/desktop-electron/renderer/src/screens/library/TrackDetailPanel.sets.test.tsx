/**
 * The Inspector's Sets (PREP-09, DEC-104), over the engine's own track detail
 * (`librarySets.fixture.json`): track 1 is in the Collection "Warm-up" and in
 * the Set "Friday".
 *
 * A Set is listed beside the Collections, not among them (fact 2), with
 * Prepare's flag. It opens Prepare where there is a Prepare to open, and scopes
 * the table as a Collection does where there is not. A track in no Set says
 * nothing about Sets at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { TrackDetailPanel } from "./TrackDetailPanel";
import { FRIDAY, TRACK_DETAIL, WARMUP } from "./librarySets.testFixture";

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the Sets a track is in", () => {
  it("lists them beside its Collections, each counted as its own kind", () => {
    render(<TrackDetailPanel detail={TRACK_DETAIL} />);
    expect(screen.getByText("In 1 Collection")).toBeInTheDocument();
    const sets = screen.getByRole("region", { name: "Sets" });
    expect(within(sets).getByRole("heading", { name: "In 1 Set" })).toBeInTheDocument();
    const friday = within(sets).getByRole("button", { name: "Friday" });
    expect(friday.querySelector("[data-icon='prepare']")).not.toBeNull();
    // Friday is not counted among the Collections.
    const collections = screen.getByText("In 1 Collection").closest("section") as HTMLElement;
    expect(within(collections).queryByRole("button", { name: "Friday" })).toBeNull();
    expect(within(collections).getByRole("button", { name: "Warm-up" })).toBeInTheDocument();
  });

  it("opens a Set in Prepare where there is one", () => {
    const onOpenInPrepare = vi.fn();
    const onSelectCollection = vi.fn();
    render(
      <TrackDetailPanel
        detail={TRACK_DETAIL}
        onOpenInPrepare={onOpenInPrepare}
        onSelectCollection={onSelectCollection}
      />,
    );
    const friday = within(screen.getByRole("region", { name: "Sets" })).getByRole("button", {
      name: "Friday",
    });
    expect(friday).toHaveAttribute("title", "Open Friday in Prepare");
    fireEvent.click(friday);
    expect(onOpenInPrepare).toHaveBeenCalledWith({ id: FRIDAY.id, name: "Friday", kind: "set" });
    expect(onSelectCollection).not.toHaveBeenCalled();
  });

  it("scopes the table to a Set where there is no Prepare, as to a Collection", () => {
    const onSelectCollection = vi.fn();
    render(<TrackDetailPanel detail={TRACK_DETAIL} onSelectCollection={onSelectCollection} />);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Sets" })).getByRole("button", { name: "Friday" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Warm-up" }));
    expect(onSelectCollection.mock.calls).toEqual([
      [{ id: FRIDAY.id, name: "Friday", kind: "set" }],
      [{ id: WARMUP.id, name: "Warm-up", kind: "collection" }],
    ]);
  });

  it("says nothing about Sets for a track in none", () => {
    render(
      <TrackDetailPanel
        detail={{
          ...TRACK_DETAIL,
          collections: TRACK_DETAIL.collections.filter((node) => node.kind !== "set"),
        }}
      />,
    );
    expect(screen.queryByRole("region", { name: "Sets" })).toBeNull();
    expect(screen.queryByText(/Set/)).toBeNull();
  });
});
