import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import type { CuePointBridge } from "../api/cuepointBridge.types";
import { ExitClearingSettings } from "../screens/ExitClearingSettings";
import { CLEAR_CACHE_ON_EXIT_KEY, CLEAR_LOGS_ON_EXIT_KEY } from "../screens/exitClearing";
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

describe("the exit-clearing choices, in Help → Privacy and in Settings → Privacy (SET-7)", () => {
  afterEach(() => {
    localStorage.clear();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  const cache = () => screen.getByRole("checkbox", { name: "Clear cache" });
  const logs = () => screen.getByRole("checkbox", { name: "Clear logs" });

  function both(open: boolean) {
    return render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <PrivacyDialog open={open} onClose={() => {}} />
          <ExitClearingSettings />
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  it("share the keys the dialog has always used", async () => {
    install(async () => ({ enabled: true, configured: true }));
    both(false);
    await userEvent.click(cache());
    expect(localStorage.getItem(CLEAR_CACHE_ON_EXIT_KEY)).toBe("1");
    expect(localStorage.getItem(CLEAR_LOGS_ON_EXIT_KEY)).toBe("0");
    expect(CLEAR_CACHE_ON_EXIT_KEY).toBe("cuepoint-privacy-clear-cache-on-exit");
    expect(CLEAR_LOGS_ON_EXIT_KEY).toBe("cuepoint-privacy-clear-logs-on-exit");
  });

  it("show in the dialog what Settings set, and tell main", async () => {
    const setPrivacyExitPrefs = vi.fn();
    window.cuepoint = {
      setPrivacyExitPrefs,
      errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (v: boolean) => ({ enabled: v }) },
    } as unknown as CuePointBridge;
    const section = both(false);
    await userEvent.click(logs());
    expect(setPrivacyExitPrefs).toHaveBeenLastCalledWith({ clearCacheOnExit: false, clearLogsOnExit: true });
    section.unmount();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <PrivacyDialog open onClose={() => {}} />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("checkbox", { name: "Clear logs on exit" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Clear cache on exit" })).not.toBeChecked();
  });

  it("show in Settings what the dialog saved, even while Settings is open", async () => {
    install(async () => ({ enabled: true, configured: true }));
    const { rerender } = render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <ExitClearingSettings />
          <PrivacyDialog open onClose={() => {}} />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(cache()).not.toBeChecked();
    // The dialog's own boxes are labelled "… on exit"; its Save writes both.
    await userEvent.click(screen.getByRole("checkbox", { name: "Clear cache on exit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(cache()).toBeChecked();
    expect(logs()).not.toBeChecked();
    rerender(<div />);
  });

  it("are read again whenever the dialog opens", async () => {
    install(async () => ({ enabled: true, configured: true }));
    const view = both(false);
    localStorage.setItem(CLEAR_LOGS_ON_EXIT_KEY, "1");
    view.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <PrivacyDialog open onClose={() => {}} />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("checkbox", { name: "Clear logs on exit" })).toBeChecked();
  });

  it("are linked from the dialog to Settings → Privacy", async () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    await userEvent.click(screen.getByRole("button", { name: "Change these in Settings → Privacy" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings|privacy");
  });

  it("save the dialog's ticked boxes before leaving for Settings → Privacy", async () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    await userEvent.click(screen.getByRole("checkbox", { name: "Clear logs on exit" }));
    expect(localStorage.getItem(CLEAR_LOGS_ON_EXIT_KEY)).not.toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Change these in Settings → Privacy" }));
    expect(localStorage.getItem(CLEAR_LOGS_ON_EXIT_KEY)).toBe("1");
    expect(localStorage.getItem(CLEAR_CACHE_ON_EXIT_KEY)).toBe("0");
    expect(screen.getByTestId("where")).toHaveTextContent("/settings|privacy");
  });

  it("read as off when storage throws", () => {
    install(async () => ({ enabled: true, configured: true }));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    both(false);
    expect(cache()).not.toBeChecked();
    vi.restoreAllMocks();
  });
});
