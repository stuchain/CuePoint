import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fakeFacade } from "../reporting/fakeFacade.testFixture";
import { reportUnexpected, resetRendererReporting, setupRendererReporting } from "../reporting/reporting";
import { GetHelpDialog } from "./GetHelpDialog";
import type { CuePointBridge } from "../api/cuepointBridge.types";

function installBridge(enabled: boolean, version = "1.2.3", extra: Record<string, unknown> = {}) {
  const bridge = {
    ...extra,
    errorReporting: {
      get: async () => ({ enabled, configured: true }),
      set: async (value: boolean) => ({ enabled: value }),
    },
    getEngineStatus: async () => ({ connected: true, version }),
    engineErrorFields: () => null,
  } as unknown as CuePointBridge;
  window.cuepoint = bridge;
  return bridge;
}

async function start(enabled: boolean) {
  const bridge = installBridge(enabled);
  const sdk = fakeFacade();
  await setupRendererReporting({ sdk, bridge });
  return sdk;
}

describe("GetHelpDialog", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("sends one feedback item with the note as written, the version and the last report id", async () => {
    const sdk = await start(true);
    const last = reportUnexpected(new Error("earlier failure"));
    render(<GetHelpDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("get-help-version")).toHaveTextContent("1.2.3"));
    expect(screen.getByTestId("get-help-last-report")).toHaveTextContent(last!.slice(0, 8));
    expect(screen.getByText(/sent exactly as you write it/i)).toBeInTheDocument();

    const note = "It broke when I opened  Secret Song.mp3";
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, note);
    await userEvent.click(screen.getByRole("button", { name: "Send note" }));

    expect(sdk.feedback).toHaveLength(1);
    expect(sdk.feedback[0]).toEqual({
      message: note,
      associatedEventId: last,
      tags: { "app.version": "1.2.3", "last.report": last },
    });
    expect(await screen.findByText(/your note was sent/i)).toBeInTheDocument();
  });

  it("does not send an empty note", async () => {
    await start(true);
    render(<GetHelpDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    expect(screen.getByRole("button", { name: "Send note" })).toBeDisabled();
  });

  it("checks the choice itself: with reports off it says so and sends nothing", async () => {
    const sdk = await start(true);
    // The user turned reports off after the page started; the dialog reads it again.
    installBridge(false);
    render(<GetHelpDialog open onClose={() => {}} />);

    expect(await screen.findByText(/sending is off in settings/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send note" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
    expect(sdk.feedback).toHaveLength(0);
  });
});

describe("GetHelpDialog across sessions", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("drops a send answer that lands after the dialog was closed and reopened", async () => {
    const sdk = await start(true);
    let finish: (value: { id: string; sent: boolean }) => void = () => {};
    vi.mocked(sdk.captureFeedback).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = render(<GetHelpDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "it broke");
    await userEvent.click(screen.getByRole("button", { name: "Send note" }));

    view.rerender(<GetHelpDialog open={false} onClose={() => {}} />);
    view.rerender(<GetHelpDialog open onClose={() => {}} />);
    await act(async () => finish({ id: "e".repeat(32), sent: true }));

    expect(screen.queryByText(/your note was sent/i)).toBeNull();
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
  });

  it("drops a help file answer that lands after the dialog was closed and reopened", async () => {
    let finish: (value: { canceled: boolean; bundle_path: string }) => void = () => {};
    const exportSupportBundle = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    installBridge(false, "1.2.3", { exportSupportBundle, showItemInFolder: vi.fn() });
    const view = render(<GetHelpDialog open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save a help file…" }));

    view.rerender(<GetHelpDialog open={false} onClose={() => {}} />);
    view.rerender(<GetHelpDialog open onClose={() => {}} />);
    await act(async () => finish({ canceled: false, bundle_path: "/tmp/help.zip" }));

    expect(screen.queryByText("Help file saved")).toBeNull();
  });
});

describe("GetHelpDialog when the send fails or reporting is not set up", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("says the note was not sent when Sentry did not take it, and does not say it was sent", async () => {
    const sdk = await start(true);
    vi.mocked(sdk.captureFeedback).mockResolvedValue({ id: "e".repeat(32), sent: false });
    render(<GetHelpDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "it broke");
    await userEvent.click(screen.getByRole("button", { name: "Send note" }));

    expect(await screen.findByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/your note was sent/i)).toBeNull();
    // The note is kept, so it can be sent again.
    expect(box).toHaveValue("it broke");
  });

  it("shows the sending state while it waits", async () => {
    const sdk = await start(true);
    let finish: (value: { id: string; sent: boolean }) => void = () => {};
    vi.mocked(sdk.captureFeedback).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<GetHelpDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "it broke");
    await userEvent.click(screen.getByRole("button", { name: "Send note" }));

    expect(screen.queryByText(/your note was sent/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Send note" })).toBeDisabled();
    await act(async () => finish({ id: "e".repeat(32), sent: true }));
    expect(await screen.findByText(/your note was sent/i)).toBeInTheDocument();
  });

  it("says sending is off in this version when reporting was never set up", async () => {
    window.cuepoint = {
      errorReporting: { get: async () => ({ enabled: true, configured: false }), set: async (v: boolean) => ({ enabled: v }) },
    } as unknown as CuePointBridge;
    await setupRendererReporting({ sdk: fakeFacade(), bridge: window.cuepoint });
    render(<GetHelpDialog open onClose={() => {}} />);
    expect(await screen.findByText(/sending is off in this version/i)).toBeInTheDocument();
    expect(screen.queryByText(/off in settings/i)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send note" })).toBeNull();
    // Only the footer's Close (the header's close is the other button named Close).
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe("GetHelpDialog help file", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("leads with the question and the labelled note box", async () => {
    await start(true);
    render(<GetHelpDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Get help" })).toBeInTheDocument();
    expect(screen.getByText("Something not working? Tell us what you were doing.")).toBeInTheDocument();
    expect(screen.getByLabelText("What were you doing?")).toBeInTheDocument();
  });

  it("saves a help file with the sanitize options, shows it, and says so", async () => {
    const exportSupportBundle = vi.fn().mockResolvedValue({ canceled: false, bundle_path: "/tmp/help.zip" });
    const showItemInFolder = vi.fn().mockResolvedValue(undefined);
    installBridge(false, "1.2.3", { exportSupportBundle, showItemInFolder });
    render(<GetHelpDialog open onClose={() => {}} />);

    expect(screen.getByText(/your sign-in and your user folder name are left out/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save a help file…" }));

    expect(exportSupportBundle).toHaveBeenCalledWith({ include_logs: true, include_config: true, sanitize: true });
    expect(showItemInFolder).toHaveBeenCalledWith("/tmp/help.zip");
    expect(await screen.findByText("Help file saved")).toBeInTheDocument();
  });

  it("still says the file was saved when showing it in the folder fails", async () => {
    const exportSupportBundle = vi.fn().mockResolvedValue({ canceled: false, bundle_path: "/tmp/help.zip" });
    const showItemInFolder = vi.fn().mockRejectedValue(new Error("no file manager"));
    installBridge(false, "1.2.3", { exportSupportBundle, showItemInFolder });
    render(<GetHelpDialog open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save a help file…" }));

    expect(await screen.findByText("Help file saved")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says nothing when the save dialog is canceled", async () => {
    const exportSupportBundle = vi.fn().mockResolvedValue({ canceled: true });
    const showItemInFolder = vi.fn();
    installBridge(false, "1.2.3", { exportSupportBundle, showItemInFolder });
    render(<GetHelpDialog open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save a help file…" }));

    await waitFor(() => expect(exportSupportBundle).toHaveBeenCalled());
    expect(showItemInFolder).not.toHaveBeenCalled();
    expect(screen.queryByText("Help file saved")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the failure in words, not only in the console", async () => {
    const exportSupportBundle = vi.fn().mockRejectedValue(new Error("Disk is full."));
    installBridge(false, "1.2.3", { exportSupportBundle, showItemInFolder: vi.fn() });
    render(<GetHelpDialog open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Save a help file…" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Disk is full.");
    expect(screen.queryByText("Help file saved")).toBeNull();
  });

  it("opens the logs folder", async () => {
    const getLogsDir = vi.fn().mockResolvedValue({ logs_dir: "/var/logs/cuepoint" });
    const showItemInFolder = vi.fn().mockResolvedValue(undefined);
    installBridge(true, "1.2.3", { exportSupportBundle: vi.fn(), getLogsDir, showItemInFolder });
    render(<GetHelpDialog open onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Open logs folder" }));

    expect(showItemInFolder).toHaveBeenCalledWith("/var/logs/cuepoint");
  });

  it("hides the pieces whose bridge method is missing", async () => {
    installBridge(true);
    render(<GetHelpDialog open onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Save a help file…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open logs folder" })).toBeNull();
  });

  it("hands Diagnostics and the log viewer to the app from the support details", async () => {
    installBridge(true);
    const onOpenDiagnostics = vi.fn();
    const onOpenLogViewer = vi.fn();
    render(<GetHelpDialog open onClose={() => {}} onOpenDiagnostics={onOpenDiagnostics} onOpenLogViewer={onOpenLogViewer} />);

    const toggle = screen.getByRole("button", { name: "Details for support" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: "Diagnostics…" }));
    await userEvent.click(screen.getByRole("button", { name: "Log viewer…" }));

    expect(onOpenDiagnostics).toHaveBeenCalledTimes(1);
    expect(onOpenLogViewer).toHaveBeenCalledTimes(1);
  });
});

describe("the look of Get help (C12, C118, C123)", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("uses the shared text box, with its label above", async () => {
    await start(true);
    render(<GetHelpDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    expect(box).toHaveClass("cp-textarea");
    expect(screen.getByLabelText("What were you doing?")).toBe(box);
  });

  it("writes the version one way, with its build", async () => {
    installBridge(true, "1.2.3", {
      buildInfo: async () => ({ version: "1.2.3", release: "cuepoint@1.2.3", dist: "abc1234", environment: "production" }),
    });
    render(<GetHelpDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("get-help-version")).toHaveTextContent("1.2.3 (build abc1234)"));
    expect(document.querySelector("dl.cp-facts")).not.toBeNull();
  });

  it("opens the logs folder with a grey button beside the help file button", async () => {
    installBridge(true, "1.2.3", {
      exportSupportBundle: vi.fn(),
      getLogsDir: vi.fn(),
      showItemInFolder: vi.fn(),
    });
    render(<GetHelpDialog open onClose={() => {}} />);
    const open = screen.getByRole("button", { name: "Open logs folder" });
    expect(open).toHaveClass("cp-btn--secondary");
    expect(open.parentElement).toHaveClass("cp-button-row");
  });
});
