/** Round 9 (Q5-Q7) pieces that need no engine: the dig table's "#" column and the chart placeholder. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupArt } from "./GroupArt";
import { RUN_COLUMNS } from "./beatportColumns";
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

  it("is the same placeholder for an artist or a label, and an artist's stays round", () => {
    const artist = render(<GroupArt runId={1} kind="artist" cardKey="k" hasArt={false} />);
    expect(artist.container.querySelector(".cp-artwork-placeholder")).not.toBeNull();
    expect(artist.container.querySelector(".discover-card__art--artist")).not.toBeNull();
    artist.unmount();
    const label = render(<GroupArt runId={1} kind="label" cardKey="k" hasArt={false} />);
    expect(label.container.querySelector(".cp-artwork-placeholder")).not.toBeNull();
  });
});
