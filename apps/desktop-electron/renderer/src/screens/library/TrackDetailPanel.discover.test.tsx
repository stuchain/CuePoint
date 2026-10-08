/**
 * The Inspector's artists and label as links to their pages (DISCOVER-11).
 *
 * Over the engine's own track details (`discoverPages.fixture.json`): one
 * resolved on Beatport, whose credited artist links by id, and one that is
 * not, whose names link by key. The credit is still shown as written — the
 * comma is the track's — with each name in it a link, the remixer credit
 * likewise, and the effective label beside the artist.
 *
 * The links are offered only where there is somewhere to open them: without
 * `onOpenEntity`, or from an engine older than the pages, the Inspector reads
 * as it always did, which is what keeps every other page's tests unchanged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { LibraryTrackDetail } from "../../api/cuepointBridge.types";
import pages from "../discover/discoverPages.fixture.json";
import { TrackDetailPanel } from "./TrackDetailPanel";

const RESOLVED = pages.detail_resolved as unknown as LibraryTrackDetail;
const UNRESOLVED = pages.detail_unresolved as unknown as LibraryTrackDetail;

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function header() {
  return screen.getByRole("heading", { level: 2 }).closest("header") as HTMLElement;
}

describe("the Inspector's credits as links", () => {
  it("links each artist in the credit where it stands, by id where Beatport knows them", () => {
    const open = vi.fn();
    render(<TrackDetailPanel detail={RESOLVED} onOpenEntity={open} />);
    const artist = header().querySelector(".cp-track-detail__artist") as HTMLElement;
    // The credit reads as written; only the names are links.
    expect(artist.textContent).toBe("Mara Veil, Kiko");
    fireEvent.click(within(artist).getByRole("button", { name: "Mara Veil" }));
    fireEvent.click(within(artist).getByRole("button", { name: "Kiko" }));
    expect(open.mock.calls).toEqual([
      ["artist", "bp:301001"],
      ["artist", "name:kiko"],
    ]);
    expect(within(artist).getByRole("button", { name: "Mara Veil" })).toHaveAttribute(
      "title",
      "Open the artist page (Beatport artist)",
    );
    expect(within(artist).getByRole("button", { name: "Kiko" })).toHaveAttribute(
      "title",
      "Open the artist page (grouped by name)",
    );
  });

  it("links the label, by its Beatport id when the track is resolved", () => {
    const open = vi.fn();
    render(<TrackDetailPanel detail={RESOLVED} onOpenEntity={open} />);
    const label = header().querySelector("p.cp-track-detail__label") as HTMLElement;
    fireEvent.click(within(label).getByRole("button", { name: "Nightfall Audio" }));
    expect(open).toHaveBeenCalledWith("label", "bp:40211");
  });

  it("links a track's remixers and a label known only by name", () => {
    const open = vi.fn();
    render(<TrackDetailPanel detail={UNRESOLVED} onOpenEntity={open} />);
    const remixer = screen.getByText("Remixer").closest(".cp-track-detail__row") as HTMLElement;
    fireEvent.click(within(remixer).getByRole("button", { name: "DJEFF" }));
    fireEvent.click(
      within(header().querySelector("p.cp-track-detail__label") as HTMLElement).getByRole(
        "button",
        { name: "Cold Room" },
      ),
    );
    expect(open.mock.calls).toEqual([
      ["artist", "name:djeff"],
      ["label", "name:cold room"],
    ]);
  });

  it("keeps the imported record's Label row as Rekordbox sent it", () => {
    render(<TrackDetailPanel detail={RESOLVED} onOpenEntity={vi.fn()} />);
    const row = screen.getByText("Label").closest(".cp-track-detail__row") as HTMLElement;
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row).toHaveTextContent("Nightfall Audio");
  });

  it("is text, as it always was, when nothing can open a page", () => {
    render(<TrackDetailPanel detail={RESOLVED} />);
    expect(within(header()).queryByRole("button", { name: "Mara Veil" })).toBeNull();
    expect(header()).toHaveTextContent("Mara Veil, Kiko");
    expect(header().querySelector("p.cp-track-detail__label")).toBeNull();
  });

  it("is text from an engine that sends no credits", () => {
    const { credits: _none, ...older } = RESOLVED;
    render(<TrackDetailPanel detail={older} onOpenEntity={vi.fn()} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(header()).toHaveTextContent("Mara Veil, Kiko");
  });

  it("does not link a track with no artist or label", () => {
    const bare: LibraryTrackDetail = {
      ...RESOLVED,
      track: { ...RESOLVED.track, artist: "", label: null },
      credits: { artists: [], remixers: [], label: null },
    };
    render(<TrackDetailPanel detail={bare} onOpenEntity={vi.fn()} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(header().querySelector("p.cp-track-detail__label")).toBeNull();
  });
});
