/**
 * The Results tab's list (DISCOVER-10) read through the shared cache (C19d): what it keeps
 * steady across the renders a read and a click cause.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { DiscoverOptions, DiscoverRun, DiscoverRunList } from "../../api/cuepointBridge.types";
import { resetEngineReadsForTests } from "../../api/engineReads";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { RunsView } from "./RunsView";
import type { DiscoverTools } from "./discoverTools";
import fixture from "./discoverPage.fixture.json";

const seenRuns: Array<readonly DiscoverRun[]> = [];

vi.mock("./RunDetail", () => ({ RunDetail: () => null }));
vi.mock("./RunList", async (importOriginal) => {
  const original = await importOriginal<typeof import("./RunList")>();
  return {
    ...original,
    RunList: (props: React.ComponentProps<typeof original.RunList>) => {
      seenRuns.push(props.runs);
      return <original.RunList {...props} />;
    },
  };
});

const OPTIONS = fixture.options_ok.value as unknown as DiscoverOptions;
const RUNS = fixture.runs.value as unknown as DiscoverRunList;

const tools: DiscoverTools = {
  options: OPTIONS,
  beatportState: "ok",
  pushing: false,
  push: async () => null,
  notify: () => {},
};

afterEach(() => {
  resetEngineReadsForTests();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  seenRuns.length = 0;
});

function install(listDiscoveryRuns: ReturnType<typeof vi.fn>) {
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    listDiscoveryRuns,
    getDiscoveryRun: vi.fn(),
    getDiscoveryRunTracks: vi.fn(),
  };
}

function view(
  props: {
    runsVersion?: number;
    onContinue?: (runId: number) => Promise<unknown>;
    continueBlocked?: string | null;
    lookup?: React.ReactNode;
  } = {},
) {
  return (
    <ScaleProvider>
      <RunsView
        tools={tools}
        runningJobId={null}
        runsVersion={props.runsVersion ?? 0}
        onNewSearch={() => {}}
        onContinue={props.onContinue ?? (async () => null)}
        continueBlocked={props.continueBlocked ?? null}
        lookup={props.lookup}
        pollMs={60_000}
      />
    </ScaleProvider>
  );
}

describe("a dig that stopped partway", () => {
  const stopped = RUNS.runs.find((run) => run.outcome === "failed")!;

  it("says Stopped and why, and Continue picks it up", async () => {
    install(vi.fn(async () => ({ value: RUNS, refusal: null })));
    const onContinue = vi.fn(async () => null);
    render(view({ onContinue }));
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    const card = within(nav)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Stopped"))!;
    expect(card).toHaveTextContent("Stopped because Beatport refused the sign-in.");
    expect(within(card).queryByText("Failed")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith(stopped.id);
  });

  it("cannot continue while it is blocked, and says why", async () => {
    install(vi.fn(async () => ({ value: RUNS, refusal: null })));
    const onContinue = vi.fn(async () => null);
    render(view({ onContinue, continueBlocked: "Another dig is running." }));
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    const button = within(nav).getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("opens the dig when its job becomes the new one", async () => {
    const running = { ...stopped, running: true, outcome: null, job_id: "job-new" };
    const first = vi.fn(async () => ({ value: RUNS, refusal: null }));
    install(first);
    const { rerender } = render(view());
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    const items = () =>
      within(nav)
        .getAllByRole("button")
        .filter((button) => button.className.includes("discover-runs__item"));
    const other = RUNS.runs.find((run) => run.id !== stopped.id)!;
    fireEvent.click(items().find((item) => item.getAttribute("aria-current") !== "page")!);
    expect(other).toBeDefined();
    (window as unknown as { cuepoint: { listDiscoveryRuns: unknown } }).cuepoint.listDiscoveryRuns = vi.fn(
      async () => ({
        value: { ...RUNS, runs: RUNS.runs.map((run) => (run.id === stopped.id ? running : run)) },
        refusal: null,
      }),
    );
    rerender(
      <ScaleProvider>
        <RunsView
          tools={tools}
          runningJobId="job-new"
          runsVersion={1}
          onNewSearch={() => {}}
          onContinue={async () => null}
          continueBlocked={null}
          pollMs={60_000}
        />
      </ScaleProvider>,
    );
    await waitFor(() =>
      expect(items().find((item) => item.getAttribute("aria-current") === "page")?.textContent).toContain(
        "Running",
      ),
    );
  });

  it("offers nothing on a finished dig", async () => {
    install(vi.fn(async () => ({ value: { ...RUNS, runs: RUNS.runs.filter((r) => r.outcome === "succeeded"), total: 1 }, refusal: null })));
    render(view());
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    expect(within(nav).queryByRole("button", { name: "Continue" })).toBeNull();
  });
});

describe("the Results list", () => {
  it("shows every dig from 'Show all', busy until the bigger list answers", async () => {
    let answerBigger!: () => void;
    const list = vi.fn((params: { limit: number }) =>
      params.limit > 50
        ? new Promise((resolve) => {
            answerBigger = () => resolve({ value: { ...RUNS, total: 80 }, refusal: null });
          })
        : Promise.resolve({ value: { ...RUNS, total: 80 }, refusal: null }),
    );
    install(list);
    render(view());
    const more = await screen.findByRole("button", { name: "Show all 80" });

    fireEvent.click(more);
    // The key moves to the bigger list, which has no answer yet: still waiting, with the shared line.
    await act(async () => {});
    const nav = screen.getByRole("navigation", { name: "Past digs" });
    expect(within(nav).getByText("Loading older digs…")).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Show all 80" })).toBeNull();

    await act(async () => answerBigger());
    await waitFor(() => expect(within(nav).queryByText("Loading older digs…")).toBeNull());
  });

  it("shows the lookup prompt above 'No digs yet' too", async () => {
    install(vi.fn(async () => ({ value: { ...RUNS, runs: [], total: 0 }, refusal: null })));
    render(view({ lookup: <p>Match 12 tracks on Beatport</p> }));
    const prompt = await screen.findByText("Match 12 tracks on Beatport");
    const empty = screen.getByText("No digs yet");
    expect(prompt.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stops offering 'Show all' once the engine's most are showing, and says so", async () => {
    const max = OPTIONS.limits.max_runs;
    const many = Array.from({ length: max }, (_, i) => ({ ...RUNS.runs[0]!, id: 1000 + i }));
    const list = vi.fn(async () => ({ value: { ...RUNS, runs: many, total: max + 50 }, refusal: null }));
    install(list);
    render(view());
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    expect(within(nav).queryByRole("button", { name: /^Show all/ })).toBeNull();
    expect(within(nav).getByText(`Showing the newest ${max}`)).toBeInTheDocument();
    expect(within(nav).queryByText("Loading older digs…")).toBeNull();
  });

  it("hands the list the same array while nothing about it changed", async () => {
    install(vi.fn(async () => ({ value: RUNS, refusal: null })));
    render(view());
    const nav = await screen.findByRole("navigation", { name: "Past digs" });
    const items = within(nav)
      .getAllByRole("button")
      .filter((button) => button.className.includes("discover-runs__item"));
    expect(items.length).toBeGreaterThan(1);

    fireEvent.click(items[1]!);
    fireEvent.click(items[0]!);

    const lastTwo = seenRuns.slice(-2);
    expect(lastTwo).toHaveLength(2);
    expect(lastTwo[1]).toBe(lastTwo[0]);
  });
});
