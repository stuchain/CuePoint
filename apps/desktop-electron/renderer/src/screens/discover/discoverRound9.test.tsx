/** Round 9 (Q5-Q7) pieces that need no engine: the dig table's "#" column and the chart placeholder. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiscoverRunTrackRow } from "../../api/cuepointBridge.types";
import { GroupArt } from "./GroupArt";
import { RUN_COLUMNS, beatportGenres } from "./beatportColumns";
import runDetail from "./RunDetail.tsx?raw";

describe("a dig's tracks table", () => {
  it("heads its number column with # and leaves room for the sort arrow beside it", () => {
    const position = RUN_COLUMNS.find((column) => column.id === "position")!;
    expect(position.header).toBe("#");
    // At 44 px the arrow squeezed the "#" down to a ":".
    expect(position.minWidthPx).toBeGreaterThanOrEqual(60);
  });
});

describe("a dig's page", () => {
  it("has no title of its own: the open dig's card is the heading", () => {
    expect(runDetail).not.toMatch(/<h2/);
    expect(runDetail).not.toMatch(/searchTitle/);
  });
});

describe("a chart without a cover", () => {
  it("is the shared artwork placeholder, not a purple tile with an initial", () => {
    const { container } = render(<GroupArt runId={1} kind="chart" cardKey="k" hasArt={false} />);
    expect(container.querySelector(".cp-artwork-placeholder")).not.toBeNull();
    expect(container.querySelector(".discover-card__initial")).toBeNull();
    expect(screen.queryByText("P")).toBeNull();
  });

  it("keeps the card's square while its picture is still coming, as the empty tone (M176, M385)", () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = {
      getDiscoveryGroupArt: () => new Promise<string | null>(() => {}),
    };
    try {
      const { container } = render(<GroupArt runId={1} kind="chart" cardKey="k" hasArt />);
      const art = container.querySelector(".discover-card__art")!;
      // Not the placeholder yet: that says "no picture", and this one may still come.
      expect(art.querySelector(".cp-artwork-placeholder")).toBeNull();
      expect(art.querySelector("img")).toBeNull();
    } finally {
      delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    }
  });

  it("is the same placeholder for an artist or a label (M175)", () => {
    const artist = render(<GroupArt runId={1} kind="artist" cardKey="k" hasArt={false} />);
    expect(artist.container.querySelector(".cp-artwork-placeholder")).not.toBeNull();
    expect(artist.container.querySelector(".discover-card__art--artist")).not.toBeNull();
    artist.unmount();
    const label = render(<GroupArt runId={1} kind="label" cardKey="k" hasArt={false} />);
    expect(label.container.querySelector(".cp-artwork-placeholder")).not.toBeNull();
  });
});

describe("a card's picture (M385)", () => {
  it("is the shared Art: not drawn until it has loaded, then marked loaded for the fade", async () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = {
      getDiscoveryGroupArt: async () => "blob:cover",
    };
    try {
      const { container } = render(<GroupArt runId={1} kind="chart" cardKey="k" hasArt />);
      const img = await waitForImg(container);
      expect(img).toHaveClass("cp-art");
      expect(img).not.toHaveAttribute("data-loaded");
      fireEvent.load(img);
      expect(img).toHaveAttribute("data-loaded");
    } finally {
      delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    }
  });
});

async function waitForImg(container: HTMLElement): Promise<HTMLImageElement> {
  for (let tries = 0; tries < 50; tries += 1) {
    const img = container.querySelector("img");
    if (img) return img;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("no picture");
}

describe("the Genre column of a Beatport table (M95)", () => {
  const genre = RUN_COLUMNS.find((column) => column.id === "genre")!;
  const row = (genre_name: string | null) => ({ genre_name }) as unknown as DiscoverRunTrackRow;

  it("reads the genres a string names, each once, as the engine does", () => {
    expect(beatportGenres("Indie Dance, House, Indie Dance|Dark Disco")).toEqual(["Indie Dance", "House", "Dark Disco"]);
    // A slash and an ampersand are part of one genre's name.
    expect(beatportGenres("Drum & Bass")).toEqual(["Drum & Bass"]);
    expect(beatportGenres("Hard Dance / Hardcore; Techno")).toEqual(["Hard Dance / Hardcore", "Techno"]);
    expect(beatportGenres(null)).toEqual([]);
  });

  it("shows the primary genre, with every genre in its hint", () => {
    const { container } = render(<>{genre.render(row("Indie Dance, House|Deep House"))}</>);
    expect(container).toHaveTextContent(/^Indie Dance$/);
    expect(container.querySelector(".cp-hint")).not.toBeNull();
    const one = render(<>{genre.render(row("Techno"))}</>);
    expect(one.container).toHaveTextContent(/^Techno$/);
    expect(one.container.querySelector(".cp-hint")).toBeNull();
    expect(genre.render(row(null))).toBeNull();
  });
});
