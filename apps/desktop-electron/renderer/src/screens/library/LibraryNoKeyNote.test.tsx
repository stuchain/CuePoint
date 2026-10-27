import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { LibraryNoKeyNote } from "./LibraryNoKeyNote";

describe("LibraryNoKeyNote", () => {
  it("is one line, with the difference from a track that has no confirmed match in its hint", () => {
    render(<LibraryNoKeyNote count={3} />);
    expect(screen.getByRole("status")).toHaveTextContent("3 tracks have no Beatport key. A key comes from a confirmed match.");
    expect(screen.getByText(/3 tracks have no Beatport key/)).toHaveAttribute(
      "title",
      expect.stringContaining("not the same as a track with no confirmed match (Not looked up yet, To check, No match, Rejected or Search failed)"),
    );
  });

  it("offers Match on exactly the tracks it counts (M503)", () => {
    const onMatch = vi.fn();
    render(<LibraryNoKeyNote count={185} onMatch={onMatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Match 185 tracks…" }));
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it("has no button where there is no match to open", () => {
    render(<LibraryNoKeyNote count={1} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
