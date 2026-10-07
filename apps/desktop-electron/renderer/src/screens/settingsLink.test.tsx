/**
 * Discover's link to the Beatport token field (DISCOVER-10): Settings scrolls
 * to the field and focuses it when a link asks, and not on an ordinary visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ToastProvider } from "../components";
import { ScaleProvider } from "../tokens/ScaleContext";
import { ThemeProvider } from "../tokens/ThemeContext";
import { BEATPORT_TOKEN_FIELD_ID, SettingsExportScreen } from "./SettingsExportScreen";
import { settingsFocus, settingsFocusState } from "./settingsLink";

function renderSettings(state: unknown) {
  return render(
    <ThemeProvider>
      <ScaleProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[{ pathname: "/settings", state }]}>
            <SettingsExportScreen />
          </MemoryRouter>
        </ToastProvider>
      </ScaleProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    getJob: vi.fn(),
    getBeatportTokenStatus: vi.fn(async () => ({ configured: false, masked: null })),
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("settingsFocus", () => {
  it("reads the field a link asked for, one token per navigation", () => {
    const first = settingsFocusState("beatport-token");
    const second = settingsFocusState("beatport-token");
    expect(settingsFocus({ state: first })).toEqual({
      focus: "beatport-token",
      token: first.token,
    });
    expect(first.token).not.toBe(second.token);
  });

  it("reads the error-reporting switch as a field a link can ask for", () => {
    const state = settingsFocusState("error-reporting");
    expect(settingsFocus({ state })).toEqual({ focus: "error-reporting", token: state.token });
  });

  it("reads nothing from an ordinary visit or a stranger's state", () => {
    expect(settingsFocus({ state: null })).toBeNull();
    expect(settingsFocus({ state: { settingsFocus: "password" } })).toBeNull();
    expect(settingsFocus({ state: "beatport-token" })).toBeNull();
  });
});

describe("Settings opened from Discover", () => {
  it("focuses the Beatport token field once its status is read", async () => {
    // Chromium drops the focus of a field disabled after it was focused, and
    // the field is disabled while its status loads; jsdom keeps it. So what is
    // checked is when the focus came: after the read, on an enabled field.
    let read = false;
    let answer: (status: { configured: boolean; masked: null }) => void = () => {};
    (window.cuepoint as { getBeatportTokenStatus: unknown }).getBeatportTokenStatus = vi.fn(
      () =>
        new Promise((resolve) => {
          answer = (status) => {
            read = true;
            resolve(status);
          };
        }),
    );
    const focusedWhen: Array<{ read: boolean; disabled: boolean }> = [];
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) {
      if (this.id === BEATPORT_TOKEN_FIELD_ID) {
        focusedWhen.push({ read, disabled: (this as HTMLInputElement).disabled });
      }
      focus.call(this);
    });
    renderSettings(settingsFocusState("beatport-token"));
    await new Promise((settle) => setTimeout(settle, 20));
    expect(focusedWhen).toEqual([]);
    answer({ configured: false, masked: null });
    // The field's label holds its hint too, so it is found by the id the link uses.
    const field = document.getElementById(BEATPORT_TOKEN_FIELD_ID)!;
    expect(field).toHaveAttribute("type", "password");
    expect(screen.getByText("Beatport token")).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveFocus());
    expect(focusedWhen).toEqual([{ read: true, disabled: false }]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("moves nothing on an ordinary visit", async () => {
    renderSettings(null);
    const field = document.getElementById(BEATPORT_TOKEN_FIELD_ID)!;
    await new Promise((settle) => setTimeout(settle, 20));
    expect(field).not.toHaveFocus();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
