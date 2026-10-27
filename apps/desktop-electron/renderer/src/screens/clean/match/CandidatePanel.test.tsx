/**
 * The side panel of the review table: straight on the Beatport candidates, a radio to pick one, a
 * search, and the two decisions pinned at the foot (Use this match, None of these). Against the real
 * panel over a faked bridge.
 */
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
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
  return within(await screen.findByRole("radiogroup", { name: "Beatport candidates" }));
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
    // The one in use: a green bar and a green "In use" chip, not a tinted card (item 9b).
    const inUse = list.getByText("In use");
    expect(inUse).toHaveClass("cp-badge", "cp-badge--success");
    expect(inUse.closest("li")).toHaveClass("review-candidate--in-use");
    // One radio per candidate, and no Use button on a candidate: the decision is in the foot (C242).
    expect(list.getAllByRole("radio")).toHaveLength(2);
    expect(list.queryByRole("button", { name: /^Use this/ })).toBeNull();
    // Each candidate has its facts on a line of their own: label, key, BPM, year.
    expect(list.getAllByText("Label Two \u00b7 8A \u00b7 128 BPM \u00b7 2020")).toHaveLength(2);
    expect(list.getAllByRole("button", { name: /Play the Beatport preview/ })).toHaveLength(2);
  });

  it("draws each candidate's cover from the guarded route, a placeholder when it has none, and releases it", async () => {
    const get = vi.fn(async ({ candidateId }: { candidateId: number }) => (candidateId === 1001 ? "blob:cover-1001" : null));
    const release = vi.fn();
    bridge.getCandidateArtwork = get;
    bridge.releaseTrackArtwork = release;
    (window.cuepoint as unknown as Record<string, unknown>).getCandidateArtwork = get;
    (window.cuepoint as unknown as Record<string, unknown>).releaseTrackArtwork = release;
    const panel = () => (
      <ScaleProvider>
        <CandidatePanel
          row={reviewTrack(1, "to_check")}
          position={1}
          total={5}
          version={0}
          busy={false}
          matching={false}
          onClose={vi.fn()}
          onUse={vi.fn()}
          onLeaveOut={vi.fn()}
          onMessage={vi.fn()}
        />
      </ScaleProvider>
    );
    const { unmount } = render(panel());
    const list = await candidates();
    await waitFor(() => expect(list.getAllByRole("listitem")[0]!.querySelector("img.review-candidate__cover")).not.toBeNull());
    // The one artwork component, which fades the cover in once it has loaded (M385).
    expect(list.getAllByRole("listitem")[0]!.querySelector("img.review-candidate__cover")).toHaveClass("cp-art");
    expect(get).toHaveBeenCalledWith({ candidateId: 1001, size: "row" });
    // The second candidate has no picture: the placeholder holds its place.
    expect(list.getAllByRole("listitem")[1]!.querySelector(".review-candidate__cover")).not.toBeNull();
    expect(list.getAllByRole("listitem")[1]!.querySelector("img")).toBeNull();
    const asked = get.mock.calls.length;
    // Kept for the next time the panel opens on these candidates (the cover cache releases it when
    // it is evicted), so the next open draws it at once without asking again.
    unmount();
    expect(release).not.toHaveBeenCalled();
    render(panel());
    const again = await candidates();
    expect(again.getAllByRole("listitem")[0]!.querySelector("img.review-candidate__cover")).toHaveAttribute(
      "src",
      "blob:cover-1001",
    );
    expect(get).toHaveBeenCalledTimes(asked);
  });

  it("has the shared panel header: a title, the status, the place and the shared Close button", () => {
    renderPanel({ row: reviewTrack(1, "to_check") });
    expect(screen.getByRole("heading", { name: "Check the match" })).toHaveClass("cp-panel-header__title");
    expect(screen.getByText("To check")).toHaveClass("cp-badge--warning");
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("cp-close");
  });

  it("says a confirmed track's status quietly, not in a chip", () => {
    renderPanel({ row: reviewTrack(2, "matched") });
    expect(screen.getByText("Confirmed")).toHaveClass("cp-quiet-ok");
  });

  it("closes on Esc from inside it, but a field keeps its own Esc", async () => {
    const props = renderPanel();
    await candidates();
    const box = screen.getByRole("textbox", { name: "Search Beatport for" });
    box.focus();
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).not.toHaveBeenCalled();
    screen.getByRole("complementary").focus();
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("pins the two decisions to a foot outside the scrolling part", async () => {
    renderPanel();
    await candidates();
    const foot = document.querySelector<HTMLElement>(".review-panel__foot")!;
    const scroll = document.querySelector<HTMLElement>(".review-panel__scroll")!;
    expect(within(foot).getByRole("button", { name: "Use this match" })).toBeInTheDocument();
    expect(within(foot).getByRole("button", { name: "None of these, leave it out" })).toBeInTheDocument();
    expect(scroll.contains(foot)).toBe(false);
    // Both are the same quiet-bordered kind of button: neither outshouts the other (C1).
    expect(within(foot).getAllByRole("button").every((button) => button.className.includes("cp-btn--secondary"))).toBe(
      true,
    );
  });

  it("says why a candidate the guards ruled out was", async () => {
    renderPanel();
    const list = await candidates();
    expect(list.getAllByText(/./, { selector: ".review-candidate__why" })).toHaveLength(1);
  });

  it("starts an unticked row on the match it already has, so Use this match never takes another unasked", async () => {
    const props = renderPanel({ row: reviewTrack(1, "matched", { ticked: false }) });
    const list = await candidates();
    const own = list.getAllByRole("radio").find((radio) => (radio as HTMLInputElement).checked)!;
    expect(own).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Use this match" }));
    expect(props.onUse).toHaveBeenCalledWith(1001, false);
  });

  it("says the match is already in use when it is the only candidate", async () => {
    const real = bridge.getMatchCandidates.getMockImplementation()!;
    bridge.getMatchCandidates.mockImplementation(async (...args: unknown[]) => {
      const answer = await (real as (...a: unknown[]) => Promise<{ candidates: unknown[] }>)(...args);
      return { ...answer, candidates: answer.candidates.slice(0, 1), total: 1 };
    });
    renderPanel();
    const list = await candidates();
    expect(list.getAllByRole("radio")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Use this match" })).toBeDisabled();
  });

  it("marks nothing in use on an unticked row, and offers its own candidate again", async () => {
    renderPanel({ row: reviewTrack(1, "matched", { ticked: false }) });
    const list = await candidates();
    expect(list.queryByText("In use")).toBeNull();
    await userEvent.click(list.getAllByRole("radio")[0]!);
    expect(screen.getByRole("button", { name: "Use this match" })).toBeEnabled();
  });

  it("uses the candidate that is picked, with Use this match", async () => {
    const props = renderPanel();
    const list = await candidates();
    // The one in use is not offered again; the other is picked from the start.
    expect(screen.getByRole("button", { name: "Use this match" })).toBeEnabled();
    await userEvent.click(list.getAllByRole("radio")[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Use this match" }));
    expect(props.onUse).toHaveBeenCalledWith(expect.any(Number), false);
  });

  it("will not use the match that is already in use", async () => {
    const props = renderPanel();
    const list = await candidates();
    const inUse = list.getByText("In use").closest("li")!;
    await userEvent.click(within(inUse).getByRole("radio"));
    expect(screen.getByRole("button", { name: "Use this match" })).toBeDisabled();
    expect(props.onUse).not.toHaveBeenCalled();
  });

  it("uses a candidate on a double-click, as Use this match would", async () => {
    const props = renderPanel();
    const list = await candidates();
    const other = list.getAllByRole("radio").find((radio) => !radio.closest("li")!.textContent!.includes("In use"))!;
    const id = Number(other.closest("li")!.getAttribute("data-candidate-id"));
    await userEvent.dblClick(other.closest("li")!.querySelector(".review-candidate__facts")!);
    expect(props.onUse).toHaveBeenCalledTimes(1);
    expect(props.onUse).toHaveBeenCalledWith(id);
  });

  it("does nothing more on a double-click of the match in use, of a play button, or while busy", async () => {
    const props = renderPanel();
    const list = await candidates();
    const inUse = list.getByText("In use").closest("li")!;
    await userEvent.dblClick(inUse.querySelector(".review-candidate__facts")!);
    const other = list.getAllByRole("listitem").find((item) => item !== inUse)!;
    await userEvent.dblClick(within(other).getByRole("button", { name: /preview/ }));
    expect(props.onUse).not.toHaveBeenCalled();
  });

  it("will not use a candidate on a double-click while a choice is being sent", async () => {
    const props = renderPanel({ busy: true });
    const list = await candidates();
    for (const item of list.getAllByRole("listitem")) {
      await userEvent.dblClick(item.querySelector(".review-candidate__facts")!);
    }
    expect(props.onUse).not.toHaveBeenCalled();
  });

  it("says the keys of the panel (M508)", () => {
    renderPanel();
    expect(screen.getByText(/Enter uses it · Backspace leaves the track out/)).toBeInTheDocument();
  });

  it("waits while a choice is being sent", async () => {
    renderPanel({ busy: true });
    await candidates();
    expect(screen.getByRole("button", { name: "Use this match" })).toBeDisabled();
  });

  it("says there are no candidates for a track with none, and offers the search", async () => {
    bridge.getMatchCandidates.mockResolvedValue({ attempt_id: 1, track_id: 3, candidates: [], total: 0 });
    renderPanel({ row: reviewTrack(3, "not_found") });
    expect(await screen.findByText("Beatport has no candidates for this track yet")).toBeInTheDocument();
    expect(screen.getByText("Search below")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this match" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Search Beatport for" })).toHaveValue("Track 3 Artist 3");
  });

  it("says why a track's attempt failed", async () => {
    bridge.getMatchCandidates.mockResolvedValue({ attempt_id: 1, track_id: 5, candidates: [], total: 0 });
    bridge.getTrackMatches.mockResolvedValue({
      ...matchesFor(5),
      attempts: [{ ...matchesFor(5).attempts[0]!, outcome: "error", error: "Beatport could not be reached" }],
    });
    renderPanel({ row: reviewTrack(5, "search_failed") });
    expect(await screen.findByText(/Could not search Beatport for this track/)).toBeInTheDocument();
    // The reason is printed under it, not hidden behind a hover, and there is no "Details" to focus (M160).
    expect(screen.getByText("Beatport could not be reached")).toBeInTheDocument();
    expect(screen.queryByText("Details")).toBeNull();
  });
});

describe("leaving it out", () => {
  it("unticks with None of these, leave it out", async () => {
    const props = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "None of these, leave it out" }));
    expect(props.onLeaveOut).toHaveBeenCalledTimes(1);
  });

  it("has nothing to leave out when the track is already out", () => {
    renderPanel({ row: reviewTrack(4, "matched", { ticked: false }) });
    expect(screen.getByRole("button", { name: "None of these, leave it out" })).toBeDisabled();
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
    // The reason is a hint on the button, not a line in the panel.
    expect(screen.queryByText(/One match at a time/)).toBeNull();
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
    expect(screen.queryByRole("combobox", { name: "Search try" })).toBeNull();
    expect(screen.queryByRole("table", { name: /scored/ })).toBeNull();
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("combobox", { name: "Search try" })).toBeInTheDocument();
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

  it("is its own pane for F6 (M459), and a leaving copy is marked and takes no input (M380)", () => {
    renderPanel({ leaving: true });
    const panel = screen.getByRole("complementary", { hidden: true });
    expect(panel).toHaveAttribute("data-pane", "candidates");
    expect(panel).toHaveAttribute("data-leaving");
    expect(panel).toHaveAttribute("inert");
  });
});

describe("holding Down (moving quickly from track to track)", () => {
  function panelOn(id: number) {
    return (
      <ScaleProvider>
        <CandidatePanel
          row={reviewTrack(id, "to_check")}
          position={id}
          total={9}
          version={0}
          busy={false}
          matching={false}
          onClose={vi.fn()}
          onUse={vi.fn()}
          onLeaveOut={vi.fn()}
          onMessage={vi.fn()}
        />
      </ScaleProvider>
    );
  }

  it("reads the track it stops on, not every track it passes, and never shows one track's candidates under another", async () => {
    const view = render(panelOn(1));
    await candidates();
    // Held still, so the moves below are as quick as a held key on any machine: on a slow
    // runner the real clock passed `SETTLE_MS` between two rerenders, and every track was read.
    const at = performance.now();
    const clock = vi.spyOn(performance, "now").mockReturnValue(at);
    onTestFinished(() => clock.mockRestore());
    view.rerender(panelOn(2));
    view.rerender(panelOn(3));
    view.rerender(panelOn(4));
    // Passing through: the header follows at once, the candidates of a track left behind do not stay.
    expect(screen.getByText("4 of 9")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Your track" })).getByText("Track 4")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Beatport candidates" })).toBeNull();
    view.rerender(panelOn(5));
    await candidates();
    const asked = bridge.getTrackMatches!.mock.calls.map(([params]) => (params as { trackId: number }).trackId);
    expect(asked).toContain(1);
    expect(asked).toContain(5);
    expect(asked).not.toContain(3);
    expect(asked).not.toContain(4);
  });
});
