import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(text).toMatch(/no analytics and no usage tracking/);
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

  it("keeps the explanation and the cache clean-up, and has no Clear logs: that is the Log viewer's (M243)", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    expect(screen.getByRole("button", { name: "Clear cache now…" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear logs/ })).toBeNull();
  });

  it("asks in the app, never with window.confirm, saying what the cache holds, and clears only on the dialog's button", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const clearCuepointCache = vi.fn().mockResolvedValue(undefined);
    install(async () => ({ enabled: true, configured: true }));
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.clearCuepointCache = clearCuepointCache;
    show();
    await userEvent.click(screen.getByRole("button", { name: "Clear cache now…" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(clearCuepointCache).not.toHaveBeenCalled();
    const ask = screen.getByRole("dialog", { name: "Clear cache?" });
    expect(ask).toHaveTextContent(/Beatport answers and artwork/);
    expect(ask).toHaveTextContent(/library, history and settings are not touched/);
    await userEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(clearCuepointCache).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Clear cache now…" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Clear cache?" })).getByRole("button", { name: "Clear cache" }));
    await waitFor(() => expect(clearCuepointCache).toHaveBeenCalledTimes(1));
  });

  it("offers the log viewer, where logs are cleared, when the app can open it", async () => {
    install(async () => ({ enabled: true, configured: true }));
    const onOpenLogViewer = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ToastProvider>
          <PrivacyDialog open onClose={() => {}} onOpenLogViewer={onOpenLogViewer} />
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open the log viewer…" }));
    expect(onOpenLogViewer).toHaveBeenCalledTimes(1);
  });

  it("spins only the cache button while the cache clears (M242)", async () => {
    let finish: () => void = () => {};
    const clearCuepointCache = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    install(async () => ({ enabled: true, configured: true }));
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.clearCuepointCache = clearCuepointCache;
    show();
    await userEvent.click(screen.getByRole("button", { name: "Clear cache now…" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Clear cache?" })).getByRole("button", { name: "Clear cache" }));
    await waitFor(() => expect(clearCuepointCache).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Clear cache now…" })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Clear cache now…" })).toBeEnabled());
  });
});

describe("the words of the dialog (C171)", () => {
  afterEach(() => {
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("has three headings and short plain sentences under them", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    const dialog = screen.getByRole("dialog");
    const headings = within(dialog).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "What stays on your computer",
      "What goes to Beatport",
      "Error reports",
    ]);
    for (const heading of headings) expect(heading).toHaveClass("cp-text-subhead");
    expect(dialog.querySelector("pre")).toBeNull();
    for (const sentence of dialog.querySelectorAll(".privacy-dialog__sentence")) {
      expect(sentence.textContent!.length).toBeLessThan(260);
    }
  });

  it("puts the clean-up button in a button row", () => {
    install(async () => ({ enabled: true, configured: true }));
    show();
    const row = screen.getByRole("button", { name: "Clear cache now…" }).parentElement!;
    expect(row).toHaveClass("cp-button-row");
  });

  it("says a clear failed by naming the thing", async () => {
    install(async () => ({ enabled: true, configured: true }));
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.clearCuepointCache = vi
      .fn()
      .mockRejectedValue(new Error("busy"));
    show();
    await userEvent.click(screen.getByRole("button", { name: "Clear cache now…" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Clear cache?" })).getByRole("button", { name: "Clear cache" }));
    expect(await screen.findByText("busy")).toBeInTheDocument();
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
