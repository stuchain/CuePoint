import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fakeFacade } from "../reporting/fakeFacade.testFixture";
import { reportUnexpected, resetRendererReporting, setupRendererReporting } from "../reporting/reporting";
import { ReportProblemDialog } from "./ReportProblemDialog";
import type { CuePointBridge } from "../api/cuepointBridge.types";

function installBridge(enabled: boolean, version = "1.2.3") {
  const bridge = {
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

describe("ReportProblemDialog", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("sends one feedback item with the note as written, the version and the last report id", async () => {
    const sdk = await start(true);
    const last = reportUnexpected(new Error("earlier failure"));
    render(<ReportProblemDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("report-problem-version")).toHaveTextContent("1.2.3"));
    expect(screen.getByTestId("report-problem-last-report")).toHaveTextContent(last!.slice(0, 8));
    expect(screen.getByText(/sent exactly as you write it/i)).toBeInTheDocument();

    const note = "It broke when I opened  Secret Song.mp3";
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, note);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

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
    render(<ReportProblemDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("checks the choice itself: with reports off it says so and sends nothing", async () => {
    const sdk = await start(true);
    // The user turned reports off after the page started; the dialog reads it again.
    installBridge(false);
    render(<ReportProblemDialog open onClose={() => {}} />);

    expect(await screen.findByText(/error reports are off in settings/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(sdk.feedback).toHaveLength(0);
  });
});

describe("ReportProblemDialog when the send fails or reporting is not set up", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("says the note was not sent when Sentry did not take it, and does not say it was sent", async () => {
    const sdk = await start(true);
    vi.mocked(sdk.captureFeedback).mockResolvedValue({ id: "e".repeat(32), sent: false });
    render(<ReportProblemDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "it broke");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText(/could not be sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/your note was sent/i)).toBeNull();
    // The note is kept, so it can be sent again.
    expect(box).toHaveValue("it broke");
  });

  it("shows the sending state while it waits", async () => {
    const sdk = await start(true);
    let finish: (value: { id: string; sent: boolean }) => void = () => {};
    vi.mocked(sdk.captureFeedback).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ReportProblemDialog open onClose={() => {}} />);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toBeEnabled());
    await userEvent.type(box, "it broke");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.queryByText(/your note was sent/i)).toBeNull();
    expect(screen.getByRole("button", { name: "…" })).toBeDisabled();
    await act(async () => finish({ id: "e".repeat(32), sent: true }));
    expect(await screen.findByText(/your note was sent/i)).toBeInTheDocument();
  });

  it("says reports are not available in this build when reporting was never set up", async () => {
    window.cuepoint = {
      errorReporting: { get: async () => ({ enabled: true, configured: false }), set: async (v: boolean) => ({ enabled: v }) },
    } as unknown as CuePointBridge;
    await setupRendererReporting({ sdk: fakeFacade(), bridge: window.cuepoint });
    render(<ReportProblemDialog open onClose={() => {}} />);
    expect(await screen.findByText(/not available in this build/i)).toBeInTheDocument();
    expect(screen.queryByText(/off in settings/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
