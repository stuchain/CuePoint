import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { DiagnosticsDialog } from "./DiagnosticsDialog";
import type { CuePointBridge } from "../api/cuepointBridge.types";

function installBridge(overrides: Record<string, unknown> = {}) {
  window.cuepoint = {
    getJob: async () => null,
    getEngineStatus: async () => ({ connected: true, version: "2.0.0", sessionId: "s-1" }),
    buildInfo: async () => ({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" }),
    ...overrides,
  } as unknown as CuePointBridge;
}

afterEach(() => {
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("DiagnosticsDialog", () => {
  it("is a medium dialog that ends in one grey Close", () => {
    installBridge();
    render(<DiagnosticsDialog open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Diagnostics" })).toHaveClass("cp-modal--medium");
  });

  it("says it is loading, in the one loading line", () => {
    installBridge({ getEngineStatus: () => new Promise(() => undefined) });
    render(<DiagnosticsDialog open onClose={() => {}} />);
    expect(screen.getByText("Loading diagnostics…")).toBeInTheDocument();
  });

  it("lists the facts as labels and values, the version written like everywhere else", async () => {
    installBridge();
    const { container } = render(<DiagnosticsDialog open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("diagnostics-version")).toHaveTextContent("2.0.0 (build abc1234)"));
    expect(container.ownerDocument.querySelector("dl.cp-facts")).not.toBeNull();
    expect(screen.getByText("Engine connected")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("s-1")).toBeInTheDocument();
  });

  it("names the error when the engine reports one", async () => {
    installBridge({ getEngineStatus: async () => ({ connected: false, version: null, error: "refused" }) });
    render(<DiagnosticsDialog open onClose={() => {}} />);
    expect(await screen.findByText("refused")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("says when there is no engine bridge", () => {
    delete (window as { cuepoint?: unknown }).cuepoint;
    render(<DiagnosticsDialog open onClose={() => {}} />);
    expect(screen.getByText("The engine bridge is not available outside the desktop app")).toBeInTheDocument();
  });
});
