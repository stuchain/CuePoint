import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogViewerDialog, OPEN_LOGS_FOLDER } from "./LogViewerDialog";

function installBridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    getCuepointLog: vi.fn(async () => ({ cuepoint_log: "line one\nline two" })),
    clearCuepointLogs: vi.fn(async () => ({})),
    getLogsDir: vi.fn(async () => ({ logs_dir: "/logs" })),
    showItemInFolder: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("LogViewerDialog", () => {
  it("shows the log text once it has loaded", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/line one/)).toBeInTheDocument());
  });

  it("says Loading logs while the first read runs", () => {
    installBridge({ getCuepointLog: vi.fn(() => new Promise(() => {})) });
    render(<LogViewerDialog open onClose={() => {}} />);
    expect(screen.getByText("Loading logs…")).toBeInTheDocument();
  });

  it("puts the red Clear logs button last, after a gap, in a button row", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    const clear = await screen.findByRole("button", { name: "Clear logs…" });
    expect(clear).toHaveClass("cp-btn--danger");
    const row = clear.parentElement!;
    expect(row).toHaveClass("cp-button-row");
    expect(row.lastElementChild).toBe(clear);
    expect(screen.getByRole("button", { name: OPEN_LOGS_FOLDER })).toBeInTheDocument();
  });

  it("calls Export a plain Export, since it opens no dialog", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    expect(await screen.findByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("names the thing in an error, without Failed to", async () => {
    installBridge({
      getCuepointLog: vi.fn(() => Promise.reject({})),
    });
    render(<LogViewerDialog open onClose={() => {}} />);
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(/could not load the logs/i);
    expect(notice.textContent).not.toMatch(/Failed to/);
  });

  it("asks before clearing", async () => {
    const clearCuepointLogs = vi.fn(async () => ({}));
    installBridge({ clearCuepointLogs });
    render(<LogViewerDialog open onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Clear logs…" }));
    expect(clearCuepointLogs).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Clear logs" }));
    await waitFor(() => expect(clearCuepointLogs).toHaveBeenCalled());
  });
});
