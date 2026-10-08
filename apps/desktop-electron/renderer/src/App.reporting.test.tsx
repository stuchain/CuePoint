/**
 * A page that throws shows the error screen in the content area and leaves the
 * sidebar and the player bar working (REPORT-06, DEC-126).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import App from "./App";
import { LAST_DESTINATION_STORAGE_KEY } from "./components/shell";
import { fakeFacade } from "./reporting/fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "./reporting/reporting";
import type { CuePointBridge } from "./api/cuepointBridge.types";

vi.mock("./screens/SettingsScreen", () => ({
  SettingsScreen: () => {
    throw new Error("settings page broke");
  },
}));
vi.mock("./components/player/PlayerSlot", () => ({
  PlayerSlot: () => <div data-testid="player-bar-probe">player bar</div>,
}));

describe("a page that throws", () => {
  beforeEach(() => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    // The app reopens on the stored destination, whatever the hash says.
    localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, "settings");
    window.location.hash = "#/settings";
    window.scrollTo = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    resetRendererReporting();
    localStorage.clear();
    window.location.hash = "";
  });

  it("shows the error screen in the page, keeps the sidebar and player bar, and one event is recorded", async () => {
    const sdk = fakeFacade();
    await setupRendererReporting({
      sdk,
      bridge: {
        errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) },
      } as Pick<CuePointBridge, "errorReporting">,
    });
    render(<App />);

    expect(screen.getByTestId("error-screen")).toBeInTheDocument();
    expect(sdk.exceptions).toHaveLength(1);
    expect(screen.getByTestId("player-bar-probe")).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    await userEvent.click(within(nav).getByRole("link", { name: "Library" }));
    expect(screen.queryByTestId("error-screen")).toBeNull();
    expect(screen.getByText(/Nothing imported yet/i)).toBeInTheDocument();
    expect(screen.getByTestId("player-bar-probe")).toBeInTheDocument();
  });
});
