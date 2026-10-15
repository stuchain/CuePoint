/**
 * The side panel of the review table: straight on the Beatport candidates, with Use this, a search
 * and None of these — leave it out. Against the real panel over a faked bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { ScaleProvider } from "../../../tokens/ScaleContext";
import { installMatchBridge, newWorld, removeMatchBridge, type MatchWorld } from "../../../test/matchHarness";
import { matchesFor, reviewTrack } from "../../../test/matchFixtures";
import { CandidatePanel, SIGN_IN_WORDS } from "./CandidatePanel";

type Fn = ReturnType<typeof vi.fn>;
type Props = ComponentProps<typeof CandidatePanel>;

let bridge: Record<string, Fn>;
let world: MatchWorld;

function renderPanel(overrides: Partial<Props> = {}) {
  const props: Props = {
    row: reviewTrack(1, "to_check"),
    position: 1,
    total: 5,
    version: 0,
    busy: false,
    matching: false,
    onClose: vi.fn(),
    onUse: vi.fn(),
    onLeaveOut: vi.fn(),
    onSearched: vi.fn(),
    onMessage: vi.fn(),
    ...overrides,
  };
  render(
    <ScaleProvider>
      <CandidatePanel {...props} />
    </ScaleProvider>,
  );
  return props;
}

async function candidates() {
  return within(await screen.findByRole("list", { name: "Beatport candidates" }));
}

beforeEach(() => {
  world = newWorld();
  bridge = installMatchBridge(world);
});

afterEach(() => {
  removeMatchBridge();
  vi.restoreAllMocks();
});

describe("the candidates", () => {
  it("opens focused, on your track card and every candidate with its facts, the one in use marked", async () => {
    renderPanel();
    const panel = screen.getByRole("complementary", { name: /^Candidates for / });
    expect(panel).toHaveFocus();
    expect(panel).toHaveClass("cp-side-panel");
    const card = within(panel).getByRole("region", { name: "Your track" });
    // Labelled as yours, with a big title, the artists, and label, key and BPM (length and year when known).
    expect(within(card).getByText("Your track \u00b7 from your library")).toBeInTheDocument();
    expect(within(card).getByText("Track 1")).toBeInTheDocument();
    expect(within(card).getByText("Artist 1")).toBeInTheDocument();
    expect(await within(card).findByText(/^Label One \u00b7 8A \u00b7 126 BPM/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Play your track" })).toBeInTheDocument();
    expect(within(panel).getByText("Found on Beatport \u00b7 pick the right one")).toBeInTheDocument();
    const list = await candidates();
    expect(list.getAllByRole("listitem")).toHaveLength(2);
    expect(list.getByText("in use")).toBeInTheDocument();
    // The first candidate is the row's own (1001): it is in use, so only the other offers Use this.
    expect(list.getAllByRole("button", { name: /^Use this/ })).toHaveLength(1);
    // Each candidate has its facts on a line of their own: label, key, BPM, year.
    expect(list.getAllByText("Label Two \u00b7 8A \u00b7 128 BPM \u00b7 2020")).toHaveLength(2);
    expect(list.getAllByRole("button", { name: /Play the Beatport preview/ })).toHaveLength(2);
  });

  it("names the status with a chip and closes with the shared Close button", () => {
    renderPanel({ row: reviewTrack(1, "to_check") });
    expect(screen.getByText("Check")).toHaveClass("cp-badge--warning");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("cp-close");
  });

  it("says why a candidate the guards ruled out was", async () => {
    renderPanel();
    const list = await candidates();
    expect(list.getAllByText(/./, { selector: ".review-candidate__why" })).toHaveLength(1);
  });

  it("says a candidate not in use is not ticked: an unticked row offers Use this on its own candidate too", async () => {
    renderPanel({ row: reviewTrack(1, "matched", { ticked: false }) });
    const list = await candidates();
    expect(list.queryByText("in use")).toBeNull();
    expect(list.getAllByRole("button", { name: /^Use this/ })).toHaveLength(2);
  });

  it("uses a candidate with Use this", async () => {
    const props = renderPanel();
    const list = await candidates();
    await userEvent.click(list.getByRole("button", { name: /^Use this/ }));
    expect(props.onUse).toHaveBeenCalledWith(1002);
  });

  it("waits while a choice is being sent", async () => {
    renderPanel({ busy: true });
    const list = await candidates();
    expect(list.getByRole("button", { name: /^Use this/ })).toBeDisabled();
  });

  it("says there are no candidates for a track with none, and offers the search", async () => {
    bridge.getMatchCandidates.mockResolvedValue({ attempt_id: 1, track_id: 3, candidates: [], total: 0 });
    renderPanel({ row: reviewTrack(3, "not_found") });
    expect(await screen.findByText("Beatport has no candidates for this track yet. Search below.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search Beatport for" })).toHaveValue("Track 3 Artist 3");
  });

  it("says why a track's attempt failed", async () => {
    bridge.getMatchCandidates.mockResolvedValue({ attempt_id: 1, track_id: 5, candidates: [], total: 0 });
    bridge.getTrackMatches.mockResolvedValue({
      ...matchesFor(5),
      attempts: [{ ...matchesFor(5).attempts[0]!, outcome: "error", error: "Beatport could not be reached" }],
    });
    renderPanel({ row: reviewTrack(5, "search_failed") });
    expect(await screen.findByText(/Could not search Beatport for this track\./)).toBeInTheDocument();
    // The matcher's raw reason is not in the line; it is the hint on Details.
    expect(screen.queryByText(/Beatport could not be reached/)).toBeNull();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });
});

describe("leaving it out", () => {
  it("unticks with None of these — leave it out", async () => {
    const props = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "None of these — leave it out" }));
    expect(props.onLeaveOut).toHaveBeenCalledTimes(1);
  });

  it("has nothing to leave out when the track is already out", () => {
    renderPanel({ row: reviewTrack(4, "matched", { ticked: false }) });
    expect(screen.getByRole("button", { name: "None of these — leave it out" })).toBeDisabled();
  });
});

describe("searching Beatport", () => {
  it("searches with the words typed, shows the results with Use this, and tells the table", async () => {
    const props = renderPanel();
    await candidates();
    const box = screen.getByRole("textbox", { name: "Search Beatport for" });
    await userEvent.clear(box);
    await userEvent.type(box, "glue bicep");
    await userEvent.click(screen.getByRole("button", { name: "Search Beatport" }));
    await waitFor(() => expect(bridge.searchMatch).toHaveBeenCalledWith({ track_id: 1, query: "glue bicep" }));
    await waitFor(() => expect(props.onSearched).toHaveBeenCalled());
    expect(props.onSearched).toHaveBeenCalledWith(1, expect.objectContaining({ query: "glue bicep" }));
  });

  it("says a search that found nothing, and a failed one in the matcher's words", async () => {
    bridge.searchMatch.mockResolvedValueOnce({
      attempt_id: 5,
      track_id: 1,
      candidates: [],
      total: 0,
      query: "zzz",
      failure: null,
      failure_message: null,
      state: matchesFor(1).state,
    });
    renderPanel();
    await candidates();
    await userEvent.click(screen.getByRole("button", { name: "Search Beatport" }));
    expect(await screen.findByText(/Beatport found nothing for/)).toBeInTheDocument();

    bridge.searchMatch.mockResolvedValueOnce({
      attempt_id: 6,
      track_id: 1,
      candidates: [],
      total: 0,
      query: "zzz",
      failure: "network",
      failure_message: "Beatport could not be reached.",
      state: matchesFor(1).state,
    });
    await userEvent.click(screen.getByRole("button", { name: "Search Beatport" }));
    expect(await screen.findByText("Beatport could not be reached.")).toBeInTheDocument();
  });

  it("says when there is no Beatport sign-in", async () => {
    bridge.searchMatch.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "BEATPORT_SIGN_IN_NEEDED" }));
    renderPanel();
    await candidates();
    await userEvent.click(screen.getByRole("button", { name: "Search Beatport" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(SIGN_IN_WORDS).toMatch(/Sign in to Beatport/);
  });

  it("waits while a match runs, and says why", async () => {
    renderPanel({ matching: true });
    await candidates();
    expect(screen.getByRole("button", { name: "Search Beatport" })).toBeDisabled();
    expect(screen.getByText("One match at a time: wait for the one that is running.")).toBeInTheDocument();
  });
});

describe("More", () => {
  it("holds the attempt picker and why a candidate scored as it did, closed until asked", async () => {
    bridge.getTrackMatches.mockResolvedValue({
      ...matchesFor(1),
      attempts: [
        { ...matchesFor(1).attempts[0]!, id: 101 },
        { ...matchesFor(1).attempts[0]!, id: 102 },
      ],
    });
    renderPanel();
    await candidates();
    expect(screen.queryByRole("combobox", { name: "Attempt" })).toBeNull();
    expect(screen.queryByRole("table", { name: /scored/ })).toBeNull();
    const more = screen.getByRole("button", { name: "More ›" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(screen.getByRole("button", { name: "Less ‹" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("combobox", { name: "Attempt" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Why this score?" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "How the matcher scored this candidate" })).toBeInTheDocument();
    expect(screen.getByText("Title similarity")).toBeInTheDocument();
  });
});

describe("closing", () => {
  it("has a Close button", async () => {
    const props = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("says where it is in the table", () => {
    renderPanel({ position: 3, total: 24 });
    expect(screen.getByText("3 of 24")).toBeInTheDocument();
  });
});
