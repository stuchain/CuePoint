import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type {
  CuePointBridge,
  LibraryHealth,
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformsBridge,
} from "../../api/cuepointBridge.types";
import { ToastProvider } from "../../components";
import { HealthView } from "./HealthView";

/**
 * The waveform analysis on the Health view (WAVE-03).
 *
 * Its row says how far the analysis has got and offers the one thing that
 * makes sense now: Pause while it runs, Resume while it is paused, "Analyse
 * waveforms" while it is idle, and nothing without a decoder. The analysis
 * starts on its own, so it never offers a button that only starts it once.
 */
function status(overrides: Partial<WaveformAnalysisStatus> = {}): WaveformAnalysisStatus {
  const merged: WaveformAnalysisStatus = {
    state: "idle",
    paused: false,
    job_id: null,
    present: 3,
    analysed: 2,
    failed: 1,
    remaining: 0,
    rate_per_hour: null,
    eta_seconds: null,
    reason: null,
    ...overrides,
  };
  return { ...merged, remaining: merged.present - merged.analysed - merged.failed };
}

const answer = (value: WaveformAnalysisStatus): WaveformAnswer<WaveformAnalysisStatus> => ({
  value,
  refusal: null,
});

const HEALTH: LibraryHealth = {
  track_count: 3,
  counts: [],
  detections: [
    {
      id: "artwork",
      label: "Artwork read",
      job_type: "artwork_scan",
      last_run_at: null,
      last_summary: null,
    },
    {
      id: "waveforms",
      label: "Waveforms analysed",
      job_type: "waveform_analysis",
      last_run_at: "2026-10-03T10:00:00Z",
      last_summary: "Analysed 2 waveforms; 1 file could not be read. Finished.",
    },
  ],
  unavailable_roots: [],
};

let waveforms: { [K in keyof WaveformsBridge]: ReturnType<typeof vi.fn> };

function install(bridge: Partial<CuePointBridge> | undefined): void {
  (window as unknown as { cuepoint?: Partial<CuePointBridge> }).cuepoint = bridge;
}

function renderHealth() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <HealthView health={HEALTH} error={null} loading={false} onHealthChanged={() => {}} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function waveformRow(): Promise<HTMLElement> {
  const label = await screen.findByText("Waveforms analysed");
  return label.closest("li") as HTMLElement;
}

beforeEach(() => {
  waveforms = {
    analysis: vi.fn().mockResolvedValue(answer(status())),
    pause: vi.fn().mockResolvedValue(answer(status({ state: "paused", paused: true }))),
    resume: vi.fn().mockResolvedValue(answer(status({ state: "running", job_id: "job-1" }))),
  };
  install({ waveforms: waveforms as unknown as WaveformsBridge });
});

afterEach(() => install(undefined));

describe("the waveform analysis on the Health view", () => {
  it("says how far it has got, beside its last run", async () => {
    renderHealth();
    const row = await waveformRow();

    expect(
      await within(row).findByText("All 3 analysed · 1 could not be read"),
    ).toBeInTheDocument();
    expect(
      within(row).getByText("Analysed 2 waveforms; 1 file could not be read. Finished."),
    ).toBeInTheDocument();
  });

  it("offers to analyse while idle, and Pause once it runs", async () => {
    renderHealth();
    const row = await waveformRow();

    fireEvent.click(await within(row).findByRole("button", { name: "Analyse waveforms" }));

    await waitFor(() => expect(waveforms.resume).toHaveBeenCalledTimes(1));
    expect(await within(row).findByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("pauses a running analysis, says it stays paused, and offers Resume", async () => {
    waveforms.analysis.mockResolvedValue(
      answer(status({ state: "running", job_id: "job-1", analysed: 1, failed: 0, eta_seconds: 120 })),
    );
    renderHealth();
    const row = await waveformRow();
    expect(await within(row).findByText("Analysing · 1 of 3 · about 2 minutes left")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Pause" }));

    expect(await screen.findByText(/stays paused, after a restart too/)).toBeInTheDocument();
    expect(await within(row).findByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(waveforms.pause).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused analysis", async () => {
    waveforms.analysis.mockResolvedValue(
      answer(status({ state: "paused", paused: true, analysed: 1, failed: 0 })),
    );
    renderHealth();
    const row = await waveformRow();
    expect(await within(row).findByText("Paused · 2 to go")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Resume" }));

    await waitFor(() => expect(waveforms.resume).toHaveBeenCalledTimes(1));
  });

  it("says a pause that could not be saved, and still offers it", async () => {
    waveforms.analysis.mockResolvedValue(answer(status({ state: "running", job_id: "job-1" })));
    waveforms.pause.mockResolvedValue({
      value: null,
      refusal: {
        code: "WAVEFORMS_SETTING_FAILED",
        message: "The waveform setting could not be saved",
      },
    });
    renderHealth();
    const row = await waveformRow();

    fireEvent.click(await within(row).findByRole("button", { name: "Pause" }));

    expect(await screen.findByText("The waveform setting could not be saved")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("names the missing decoder in words and offers nothing", async () => {
    waveforms.analysis.mockResolvedValue(
      answer(status({ state: "unavailable", reason: "decoder_missing", analysed: 0, failed: 0 })),
    );
    renderHealth();
    const row = await waveformRow();

    expect(
      await within(row).findByText(
        "Waveforms need the player's decoder, which this build does not include",
      ),
    ).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("leaves the row as a plain detection in a shell without the analysis", async () => {
    install({});
    renderHealth();
    const row = await waveformRow();

    expect(within(row).queryByRole("button")).toBeNull();
    expect(within(row).queryByRole("status")).toBeNull();
  });

  it("keeps the other detections' buttons as they were", async () => {
    install({ waveforms: waveforms as unknown as WaveformsBridge, startArtworkScan: vi.fn() });
    renderHealth();

    const artwork = (await screen.findByText("Artwork read")).closest("li") as HTMLElement;
    expect(within(artwork).getByRole("button", { name: "Read artwork" })).toBeInTheDocument();
  });
});
