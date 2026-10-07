import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { CuePointBridge } from "../api/cuepointBridge.types";
import { settingsFocus } from "../screens/settingsLink";
import { ToastProvider } from "./Toast";
import { PrivacyDialog } from "./PrivacyDialog";

function install(get: () => Promise<{ enabled: boolean; configured: boolean }>) {
  window.cuepoint = { errorReporting: { get, set: async (v: boolean) => ({ enabled: v }) } } as unknown as CuePointBridge;
}

function Where() {
  const location = useLocation();
  const focus = settingsFocus(location);
  return <p data-testid="where">{`${location.pathname}|${focus?.focus ?? ""}`}</p>;
}

function show() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <Routes>
          <Route path="*" element={<><PrivacyDialog open onClose={() => {}} /><Where /></>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("PrivacyDialog (REPORT-08, DEC-128)", () => {
  afterEach(() => {
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("no longer says there is no telemetry, and says what error reports are", async () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/No telemetry or analytics/i);
    expect(text).not.toMatch(/No background data collection/i);
    expect(text).toMatch(/No analytics or usage tracking/);
    expect(text).toMatch(/Sentry/);
    expect(text).toMatch(/cleaned on your computer/);
    expect(text).not.toMatch(/\b30 days\b/);
    expect(text).toMatch(/Privacy Notice/);
    await waitFor(() => expect(screen.getByTestId("privacy-error-reports")).toHaveTextContent("Error reports: on"));
  });

  it("shows the switch's state when off, and when it cannot be read", async () => {
    install(async () => ({ enabled: false, configured: true }));
    const first = show();
    await waitFor(() => expect(screen.getByTestId("privacy-error-reports")).toHaveTextContent("Error reports: off"));
    first.unmount();

    install(async () => {
      throw new Error("no");
    });
    show();
    await waitFor(() =>
      expect(screen.getByTestId("privacy-error-reports")).toHaveTextContent("Error reports: could not be read"),
    );
  });

  it("says so when this build cannot send (no DSN)", async () => {
    install(async () => ({ enabled: true, configured: false }));
    show();
    await waitFor(() =>
      expect(screen.getByTestId("privacy-error-reports")).toHaveTextContent("not available in this build"),
    );
  });

  it("links to the setting in Settings", async () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    await userEvent.click(screen.getByRole("button", { name: "Change in Settings" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings|error-reporting");
  });
});
