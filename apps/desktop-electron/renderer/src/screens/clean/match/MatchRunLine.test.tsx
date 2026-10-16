/**
 * The two lines at the top of Clean that say what the matching is doing: while one runs (from any
 * tab, and when the page is back), and when one ended finding nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { NothingFoundNote } from "./MatchRunLine";

describe("NothingFoundNote", () => {
  it("is red, says how many and why that is usually not the tracks, and offers to see them", () => {
    const onSee = vi.fn();
    render(<NothingFoundNote name="hJ" found={{ failed: 0, notFound: 24 }} onSee={onSee} onDismiss={vi.fn()} />);
    const note = screen.getByRole("alert");
    expect(note).toHaveTextContent("hJ: no Beatport match for 24 tracks");
    expect(note).toHaveTextContent("This usually means the search failed, not that the tracks aren't on Beatport.");
    fireEvent.click(screen.getByRole("button", { name: "See the 24 ›" }));
    expect(onSee).toHaveBeenCalledTimes(1);
  });

  it("says searches failed, in those words, when they did", () => {
    render(<NothingFoundNote name="hJ" found={{ failed: 24, notFound: 0 }} onSee={vi.fn()} onDismiss={vi.fn()} />);
    const note = screen.getByRole("alert");
    expect(note).toHaveTextContent("hJ: 24 searches failed");
    expect(note).toHaveTextContent("Match again usually fixes it.");
    expect(note).not.toHaveTextContent("no Beatport match");
    expect(screen.getByRole("button", { name: "See the 24 ›" })).toBeInTheDocument();
  });

  it("says both when both happened, and sends you to the failed ones", () => {
    render(<NothingFoundNote name="hJ" found={{ failed: 20, notFound: 4 }} onSee={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("hJ: 20 searches failed, no Beatport match for 4 tracks");
    expect(screen.getByRole("button", { name: "See the 20 ›" })).toBeInTheDocument();
  });

  it("says track for one, and can be dismissed", () => {
    const onDismiss = vi.fn();
    render(<NothingFoundNote name="hJ" found={{ failed: 0, notFound: 1 }} onSee={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no Beatport match for 1 track");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
