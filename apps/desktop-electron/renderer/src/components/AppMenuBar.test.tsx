import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { fakeFacade } from "../reporting/fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "../reporting/reporting";
import { AppMenuBar } from "./AppMenuBar";
import type { CuePointBridge } from "../api/cuepointBridge.types";

const noop = () => {};

function renderBar(onReportProblem: () => void) {
  return render(
    <MemoryRouter>
      <AppMenuBar
        onOpenSupport={noop}
        onOpenShortcuts={noop}
        onOpenPrivacy={noop}
        onOpenAbout={noop}
        onReportProblem={onReportProblem}
        onOpenDiagnostics={noop}
        onOpenLogViewer={noop}
        onShowOnboarding={noop}
        onOpenRekordboxInstructions={noop}
      />
    </MemoryRouter>,
  );
}

async function setUp(enabled: boolean, configured = true) {
  const bridge = {
    errorReporting: { get: async () => ({ enabled, configured }), set: async (v: boolean) => ({ enabled: v }) },
    engineErrorFields: () => null,
  } as unknown as CuePointBridge;
  window.cuepoint = bridge;
  await setupRendererReporting({ sdk: fakeFacade(), bridge });
}

describe("Help → Report a problem", () => {
  afterEach(() => {
    resetRendererReporting();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("opens the dialog when reporting is on", async () => {
    await setUp(true);
    const open = vi.fn();
    renderBar(open);
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    const item = await screen.findByRole("menuitem", { name: /report a problem/i });
    expect(item).toBeEnabled();
    await userEvent.click(item);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("is disabled, and says why, when reporting is off in Settings", async () => {
    await setUp(false);
    renderBar(noop);
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: /report a problem/i })).toBeDisabled();
    expect(await screen.findByText("Error reports are off in Settings")).toBeInTheDocument();
  });

  it("is disabled when reporting was never set up", async () => {
    await setUp(true, false);
    renderBar(noop);
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("menuitem", { name: /report a problem/i })).toBeDisabled();
    expect(await screen.findByText(/not set up in this build/i)).toBeInTheDocument();
  });
});
