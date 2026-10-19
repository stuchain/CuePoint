/**
 * The offline banner (one banner when the background process stops).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { refreshEngineStatus, resetEngineOnlineForTests } from "../../api/engineOnline";
import { formatTimeOfDay } from "../../format/dates";
import { OfflineBanner } from "./OfflineBanner";

let getEngineStatus: ReturnType<typeof vi.fn>;

function bridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getEngineStatus, ...overrides };
}

const STOPPED = { connected: false, error: "Engine not running" };

beforeEach(() => {
  getEngineStatus = vi.fn().mockResolvedValue({ connected: true });
  bridge();
});

afterEach(() => {
  resetEngineOnlineForTests();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("renders nothing while online", async () => {
    const { container } = render(<OfflineBanner />);
    await waitFor(() => expect(getEngineStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the process is only starting", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, starting: true });
    const { container } = render(<OfflineBanner />);
    await waitFor(() => expect(getEngineStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says CuePoint stopped, in an alert, with a way to start it again", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    bridge({ restartEngine: vi.fn() });
    render(<OfflineBanner />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "CuePoint stopped working in the background. Your library and files are safe.",
    );
    expect(screen.getByRole("button", { name: "Start it again" })).toBeInTheDocument();
  });

  it("draws its button at the standard height, not the small one (C8)", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    bridge({ restartEngine: vi.fn() });
    render(<OfflineBanner />);

    expect(await screen.findByRole("button", { name: "Start it again" })).not.toHaveClass("cp-btn--sm");
  });

  it("hides the button when the bridge cannot restart", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    render(<OfflineBanner />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Start it again" })).not.toBeInTheDocument();
  });

  it("names when the library was loaded, in the app's time of day", async () => {
    const connectedAt = new Date(2026, 9, 13, 9, 5).getTime();
    vi.spyOn(Date, "now").mockReturnValue(connectedAt);
    render(<OfflineBanner />);
    await waitFor(() => expect(getEngineStatus).toHaveBeenCalled());
    await act(async () => {});

    getEngineStatus.mockResolvedValue(STOPPED);
    const { noteOutage } = await import("../../api/engineOnline");
    act(() => noteOutage());

    expect(await screen.findByText(`Library loaded at ${formatTimeOfDay(connectedAt)}`)).toBeInTheDocument();
    expect(screen.queryByText(/Last loaded|09:05/)).not.toBeInTheDocument();
  });

  it("omits the time when nothing was ever loaded", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    render(<OfflineBanner />);
    await screen.findByRole("alert");
    expect(screen.queryByText(/Library loaded/)).not.toBeInTheDocument();
  });

  it("says it is starting again while the supervisor restarts, with the attempt", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: true, restartAttempts: 2 });
    bridge({ restartEngine: vi.fn() });
    render(<OfflineBanner />);

    expect(await screen.findByRole("alert")).toHaveTextContent("CuePoint stopped working in the background. Starting it again (2 of 3)…");
    expect(screen.queryByRole("button", { name: "Start it again" })).not.toBeInTheDocument();
  });

  it("leaves the attempt out when it is not known", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: true });
    render(<OfflineBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("CuePoint stopped working in the background. Starting it again…");
    expect(alert).not.toHaveTextContent("of 3");
  });

  it("says it is starting again while its own restart is in flight", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    let finish: (status: unknown) => void = () => {};
    const restartEngine = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    bridge({ restartEngine });
    render(<OfflineBanner />);

    await userEvent.click(await screen.findByRole("button", { name: "Start it again" }));
    expect(restartEngine).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("CuePoint stopped working in the background. Starting it again…");

    getEngineStatus.mockResolvedValue({ connected: true });
    await act(async () => finish({ connected: true }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("keeps saying it is starting after the restart returns, until the page reports it is back", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    bridge({ restartEngine: vi.fn().mockResolvedValue({ connected: true }) });
    render(<OfflineBanner />);

    await userEvent.click(await screen.findByRole("button", { name: "Start it again" }));

    // The store has not yet seen it connected: no flash of the "stopped" words.
    expect(screen.getByRole("alert")).toHaveTextContent("CuePoint stopped working in the background. Starting it again…");
    expect(screen.queryByRole("button", { name: "Start it again" })).not.toBeInTheDocument();

    getEngineStatus.mockResolvedValue({ connected: true });
    await act(async () => {
      refreshEngineStatus();
    });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("is still shown while the process is starting again after it was up", async () => {
    getEngineStatus.mockResolvedValue({ connected: true });
    render(<OfflineBanner />);
    await waitFor(() => expect(getEngineStatus).toHaveBeenCalled());
    await act(async () => {});

    getEngineStatus.mockResolvedValue({ connected: false, starting: true, reconnecting: true, restartAttempts: 1 });
    await act(async () => {
      refreshEngineStatus();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("CuePoint stopped working in the background. Starting it again (1 of 3)…");
  });

  it("says it could not start when the restart came back still stopped", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    bridge({ restartEngine: vi.fn().mockResolvedValue(STOPPED) });
    const onGetHelp = vi.fn();
    render(<OfflineBanner onGetHelp={onGetHelp} />);

    await userEvent.click(await screen.findByRole("button", { name: "Start it again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CuePoint could not start in the background. Quit and open CuePoint again.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Get help…" }));
    expect(onGetHelp).toHaveBeenCalledTimes(1);
  });

  it("offers no Get help button without a handler", async () => {
    getEngineStatus.mockResolvedValue(STOPPED);
    bridge({ restartEngine: vi.fn().mockResolvedValue(STOPPED) });
    render(<OfflineBanner />);
    await userEvent.click(await screen.findByRole("button", { name: "Start it again" }));
    await screen.findByText(/could not start/);
    expect(screen.queryByRole("button", { name: "Get help…" })).not.toBeInTheDocument();
  });

  it("pulses for a moment each time the pulse count changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getEngineStatus.mockResolvedValue(STOPPED);
      const { rerender } = render(<OfflineBanner pulse={0} />);
      const alert = await screen.findByRole("alert");
      const banner = alert.closest(".cp-offline")!;
      expect(banner).not.toHaveAttribute("data-pulse");

      rerender(<OfflineBanner pulse={1} />);
      expect(banner).toHaveAttribute("data-pulse");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(banner).not.toHaveAttribute("data-pulse");
    } finally {
      vi.useRealTimers();
    }
  });
});
