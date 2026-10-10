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

  it("says the installed app checks GitHub for updates, and that it sends nothing about you (DIST-06)", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveTextContent(/does not check for updates/i);
    expect(dialog).toHaveTextContent(/checks GitHub for updates at launch and every 4 hours/i);
    expect(dialog).toHaveTextContent(/no id, no account and nothing from your library/);
    expect(dialog).toHaveTextContent(/Settings → About & updates/);
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

  it("links to Settings → Privacy, where the choices are", async () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    await userEvent.click(screen.getByRole("button", { name: "Change these in Settings → Privacy" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings|privacy");
  });

  it("holds no copy of the choices: no switches, no Save", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change in Settings" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });

  it("keeps the explanation and the one-off clean-up buttons", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    expect(screen.getByRole("button", { name: "Clear cache now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear logs now" })).toBeInTheDocument();
  });
});

describe("the exit-clearing choices live in Settings → Privacy only (SET-7, PAGES-03B)", () => {
  afterEach(() => {
    localStorage.clear();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  const cache = () => screen.getByRole("checkbox", { name: "Clear cache" });

  it("keep the keys the dialog always used, so nothing stored is lost", async () => {
    install(async () => ({ enabled: true, configured: true }));
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <ExitClearingSettings />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(cache());
    expect(localStorage.getItem(CLEAR_CACHE_ON_EXIT_KEY)).toBe("1");
    expect(localStorage.getItem(CLEAR_LOGS_ON_EXIT_KEY)).toBe("0");
    expect(CLEAR_CACHE_ON_EXIT_KEY).toBe("cuepoint-privacy-clear-cache-on-exit");
    expect(CLEAR_LOGS_ON_EXIT_KEY).toBe("cuepoint-privacy-clear-logs-on-exit");
  });

  it("tell main when Settings changes them", async () => {
    const setPrivacyExitPrefs = vi.fn();
    window.cuepoint = {
      setPrivacyExitPrefs,
      errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (v: boolean) => ({ enabled: v }) },
    } as unknown as CuePointBridge;
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <ExitClearingSettings />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Clear logs" }));
    expect(setPrivacyExitPrefs).toHaveBeenLastCalledWith({ clearCacheOnExit: false, clearLogsOnExit: true });
  });

  it("read as off when storage throws", () => {
    install(async () => ({ enabled: true, configured: true }));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <ExitClearingSettings />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(cache()).not.toBeChecked();
    vi.restoreAllMocks();
  });
});
