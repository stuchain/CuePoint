/**
 * The two lines at the top of Clean that say what the matching is doing: while one runs (from any
 * tab, and when the page is back), and when one ended finding nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MatchRunningLine, NothingFoundNote } from "./MatchRunLine";

describe("MatchRunningLine", () => {
  it("says what is matched, how far, about how long is left, and offers Stop", () => {
    const onStop = vi.fn();
    render(<MatchRunningLine name="hJ" progress={{ done: 11, total: 24 }} secondsLeft={130} onStop={onStop} />);
    const line = screen.getByRole("region", { name: "Matching" });
    expect(line).toHaveTextContent("Matching hJ");
    expect(line).toHaveTextContent("11 of 24");
    expect(line).toHaveTextContent("about 2 minutes left");
    const bar = screen.getByRole("progressbar", { name: "Matching progress" });
    expect(bar).toHaveAttribute("value", "11");
    expect(bar).toHaveAttribute("max", "24");
    fireEvent.click(screen.getByRole("button", { name: "Stop matching" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("leaves out the time before it can be said, and the name when it is not known", () => {
    render(<MatchRunningLine name={null} progress={{ done: 1, total: 24 }} secondsLeft={null} onStop={vi.fn()} />);
    const line = screen.getByRole("region", { name: "Matching" });
    expect(line).toHaveTextContent("Matching");
    expect(line).not.toHaveTextContent("Matching hJ");
    expect(line).toHaveTextContent("1 of 24");
    expect(line).not.toHaveTextContent("left");
  });

  it("says only Matching before the job has said how far it is", () => {
    render(<MatchRunningLine name="hJ" progress={null} secondsLeft={null} onStop={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Matching" })).toHaveTextContent("Matching hJ…");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("has no Stop until the engine's job is known", () => {
    render(<MatchRunningLine name="hJ" progress={null} secondsLeft={null} onStop={null} />);
    expect(screen.queryByRole("button", { name: "Stop matching" })).toBeNull();
  });
});

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
