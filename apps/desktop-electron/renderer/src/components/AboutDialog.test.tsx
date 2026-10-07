import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { AboutDialog } from "./AboutDialog";
import type { AppBuildInfo, CuePointBridge } from "../api/cuepointBridge.types";

function installBridge(build: AppBuildInfo | null, withEngine = true) {
  window.cuepoint = {
    ...(withEngine
      ? { getJob: async () => null, getEngineStatus: async () => ({ connected: true, version: "2.0.0" }) }
      : {}),
    ...(build ? { buildInfo: async () => build } : {}),
  } as unknown as CuePointBridge;
}

describe("AboutDialog", () => {
  afterEach(() => {
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("shows the app's version and its build, from main", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" });
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("about-build")).toHaveTextContent("Build: abc1234"));
    expect(screen.getByTestId("about-version")).toHaveTextContent("Version: 2.0.0");
    expect(screen.getByText(/connected \(2\.0\.0\)/)).toBeInTheDocument();
  });

  it("says a build that recorded no commit has none, and that a source run is development", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: null, environment: "development" });
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("about-build")).toHaveTextContent("Build: not recorded (development)"));
  });

  it("still opens with an older main that has no build", async () => {
    installBridge(null);
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText(/connected \(2\.0\.0\)/)).toBeInTheDocument());
    expect(screen.getByTestId("about-build")).toHaveTextContent("Build: unknown");
  });

  it("shows the build even when the engine bridge is not there", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" }, false);
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("about-build")).toHaveTextContent("Build: abc1234"));
    expect(screen.getByText(/not connected/)).toBeInTheDocument();
  });
});
