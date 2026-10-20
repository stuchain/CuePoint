/**
 * Opening a past dig (RunDetail): what shows before the engine has answered.
 *
 * The list's row already holds the dig's name, dates, scope and counts, so the header is drawn
 * from it at once, with a placeholder grid of card shapes where the cards will be; the engine's
 * own header and cards replace them when they arrive.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

import type {
  DiscoverOptions,
  DiscoverRun,
  DiscoverRunGroups,
  DiscoverRunHeader,
  DiscoverRunList,
} from "../../api/cuepointBridge.types";
import { resetCoversForTests } from "../../api/coverLoader";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { RunDetail } from "./RunDetail";
import { runOutcome, runScopeLine } from "./discoverFormat";
import type { DiscoverTools } from "./discoverTools";
import fixture from "./discoverPage.fixture.json";

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const RUNS = fixture.runs.value as unknown as DiscoverRunList;
const HEADER = fixture.run_header.value as unknown as DiscoverRunHeader;
const GROUPS = fixture.run_groups_library.value as unknown as DiscoverRunGroups;

const tools: DiscoverTools = {
  options: OPTIONS,
  beatportState: "ok",
  pushing: false,
  push: async () => null,
  notify: () => {},
};

/** A finished dig from the list, so its header has an outcome line. */
const LISTED: DiscoverRun = RUNS.runs.find((run) => run.outcome === "succeeded") ?? RUNS.runs[0]!;

afterEach(() => {
  resetCoversForTests();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

/** Bridges whose answers are held until the test lets them go. */
function held() {
  let header!: (value: DiscoverRunHeader) => void;
  let groups!: (value: DiscoverRunGroups) => void;
  const bridge = {
    getDiscoveryRun: vi.fn(
      () => new Promise((resolve) => (header = (value) => resolve({ value, refusal: null }))),
    ),
    getDiscoveryRunGroups: vi.fn(
      () => new Promise((resolve) => (groups = (value) => resolve({ value, refusal: null }))),
    ),
    getDiscoveryRunTracks: vi.fn(() => new Promise(() => {})),
    getDiscoveryGroupArt: vi.fn(async () => null),
  };
  (window as unknown as { cuepoint: unknown }).cuepoint = bridge;
  return { bridge, header: (value: DiscoverRunHeader) => header(value), groups: (value: DiscoverRunGroups) => groups(value) };
}

function detail(listed: DiscoverRun | null) {
  return (
    <ScaleProvider>
      <RunDetail runId={LISTED.id} listed={listed} tools={tools} version={0} onGone={() => {}} />
    </ScaleProvider>
  );
}

describe("opening a past dig", () => {
  it("draws the header from the list's row at once, before the engine answers", () => {
    const answers = held();
    render(detail(LISTED));
    const dig = screen.getByRole("region", { name: "Dig" });
    // No "Loading the dig…" in the header: the row's own facts are there on the first render.
    expect(within(dig).getByText(runScopeLine(LISTED, OPTIONS.genres).replace(/\s+/g, " "))).toBeInTheDocument();
    expect(within(dig).getByText(runOutcome(LISTED))).toBeInTheDocument();
    // Both reads start together on the first render.
    expect(answers.bridge.getDiscoveryRun).toHaveBeenCalledTimes(1);
    expect(answers.bridge.getDiscoveryRunGroups).toHaveBeenCalledTimes(1);
  });

  it("shows a placeholder grid of card shapes until the cards arrive, then the cards", async () => {
    const answers = held();
    const { container } = render(detail(LISTED));
    const waiting = screen.getByRole("status", { name: "Loading the dig…" });
    expect(waiting).toHaveAttribute("aria-busy", "true");
    const shapes = container.querySelectorAll(".discover-card--placeholder");
    expect(shapes.length).toBeGreaterThan(3);
    // The shapes are decoration: nothing in them can be clicked or ticked.
    expect(within(waiting).queryAllByRole("button")).toHaveLength(0);
    expect(within(waiting).queryAllByRole("checkbox")).toHaveLength(0);

    await act(async () => answers.groups({ ...GROUPS, run_id: LISTED.id }));
    expect(screen.queryByRole("status", { name: "Loading the dig…" })).toBeNull();
    expect(container.querySelectorAll(".discover-card--placeholder")).toHaveLength(0);
    expect(container.querySelectorAll(".discover-card").length).toBeGreaterThan(0);
  });

  it("adds what only the engine's header has (the names it looked for) when it arrives", async () => {
    const answers = held();
    render(detail(LISTED));
    const named = HEADER.artists.length > 0 ? HEADER.artists : HEADER.labels;
    expect(named.length).toBeGreaterThan(0);
    expect(screen.queryByText(/^The \d+ \w+ it looked for$/)).toBeNull();
    await act(async () => answers.header({ ...HEADER, run: { ...HEADER.run, id: LISTED.id } }));
    expect(screen.getAllByText(/^The \d+ \w+ it looked for$/).length).toBeGreaterThan(0);
  });

  it("still waits in words when the list has no row for the dig", () => {
    held();
    render(detail(null));
    const dig = screen.getByRole("region", { name: "Dig" });
    expect(within(dig.querySelector("header")!).getByText("Loading the dig…")).toBeInTheDocument();
  });
});
