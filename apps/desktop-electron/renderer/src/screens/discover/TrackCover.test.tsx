/**
 * A run's track cover: the Title cell starts with the release cover when the row has one, and
 * with a neutral square when it has none; the picture is decorative (empty alt), asked for by
 * track id through the one art route and never as a URL.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";

import type { DiscoverRunTrackRow } from "../../api/cuepointBridge.types";
import { ENTITY_COLUMNS, RUN_COLUMNS, WANTLIST_COLUMNS } from "./beatportColumns";
import fixture from "./discoverPage.fixture.json";

const ROW = (fixture.run_tracks_hidden.value as unknown as { rows: DiscoverRunTrackRow[] }).rows[0]!;

function titleCell(row: DiscoverRunTrackRow, columns: readonly { id: string; render: (row: never) => unknown }[] = RUN_COLUMNS) {
  const column = columns.find((c) => c.id === "title")!;
  return render(<div>{(column.render as (row: DiscoverRunTrackRow) => ReactNode)(row)}</div>);
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the Title cell of a Beatport track", () => {
  it("shows the release cover, with empty alt text, when the row has one", async () => {
    const getDiscoveryTrackArt = vi.fn(async () => "blob:cover-1");
    (window as unknown as { cuepoint: unknown }).cuepoint = { getDiscoveryTrackArt };
    const { container } = titleCell({ ...ROW, beatport_track_id: 910001, has_art: true });
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:cover-1"));
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(getDiscoveryTrackArt).toHaveBeenCalledWith({ track_id: 910001, size: "row" });
    expect(container).toHaveTextContent(ROW.title);
  });

  it("shows the neutral square and asks for nothing when the row has no cover", () => {
    const getDiscoveryTrackArt = vi.fn(async () => "blob:never");
    (window as unknown as { cuepoint: unknown }).cuepoint = { getDiscoveryTrackArt };
    const { container } = titleCell({ ...ROW, has_art: false });
    expect(container.querySelector(".discover-track-cover")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(getDiscoveryTrackArt).not.toHaveBeenCalled();
    expect(container).toHaveTextContent(ROW.title);
  });

  it("is the same Title cell in the wantlist's and the Artist and Label pages' tables", () => {
    for (const columns of [WANTLIST_COLUMNS, ENTITY_COLUMNS]) {
      const { container, unmount } = titleCell({ ...ROW, has_art: false }, columns as never);
      expect(container.querySelector(".discover-track-title .discover-track-cover")).not.toBeNull();
      unmount();
    }
  });

  it("gives the plain name to copy and to the hint", () => {
    const title = RUN_COLUMNS.find((c) => c.id === "title")!;
    expect(title.text?.(ROW)).toBe(title.accessor?.(ROW));
    expect(typeof title.text?.(ROW)).toBe("string");
  });
});
