import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OPEN_LOG_FOLDER } from "../format/words";
import { LogViewerDialog } from "./LogViewerDialog";
import { expectNoAxeViolations } from "../test/axe";

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
    expect(screen.getByRole("button", { name: OPEN_LOG_FOLDER })).toBeInTheDocument();
  });

  it("saves as a text file through the native dialog, with a safe label and a toast, never a download (M264)", async () => {
    const saveLogTextDialog = vi.fn(async () => ({ canceled: false as const, filePath: "/home/dj/Music/cuepoint.log.txt" }));
    installBridge({ saveLogTextDialog });
    render(<LogViewerDialog open onClose={() => {}} />);
    await screen.findByText(/line one/);
    expect(screen.queryByRole("button", { name: /^Export/ })).toBeNull();
    await userEvent.type(screen.getByRole("searchbox"), "line");
    await userEvent.click(screen.getByRole("button", { name: "Save as text file…" }));
    await waitFor(() => expect(saveLogTextDialog).toHaveBeenCalled());
    expect(saveLogTextDialog).toHaveBeenCalledWith({ text: expect.stringContaining("line one"), label: "line" });
  });

  it("has no Save button when the bridge cannot open the dialog", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    await screen.findByText(/line one/);
    expect(screen.queryByRole("button", { name: "Save as text file…" })).toBeNull();
  });

  it("writes the levels as words, not capitals", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    await screen.findByText(/line one/);
    const options = within(screen.getByLabelText("Level")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All", "Debug", "Info", "Warning", "Error", "Critical"]);
  });

  it("drops Refresh while Auto-refresh is ticked, and brings it back when it is not", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    await screen.findByText(/line one/);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Auto-refresh" }));
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Auto-refresh" }));
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("says an empty log in the shared compact empty state, in Inter, not in the log face (M264)", async () => {
    installBridge({ getCuepointLog: vi.fn(async () => ({ cuepoint_log: "" })) });
    const { container } = render(<LogViewerDialog open onClose={() => {}} />);
    expect(await screen.findByText("Nothing logged yet")).toBeInTheDocument();
    expect(container.ownerDocument.querySelector(".cp-empty-state--compact")).not.toBeNull();
    expect(container.ownerDocument.querySelector("pre")).toBeNull();
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

describe("LogViewerDialog accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations", async () => {
    installBridge();
    render(<LogViewerDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/line one/)).toBeInTheDocument());
    await expectNoAxeViolations();
  });
});
