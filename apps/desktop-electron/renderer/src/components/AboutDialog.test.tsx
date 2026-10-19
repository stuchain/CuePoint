import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { AboutDialog, versionWords } from "./AboutDialog";
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

  it("shows the app's version and its build in one line, from main", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" });
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("about-version")).toHaveTextContent("2.0.0 (build abc1234)"));
    expect(screen.queryByText(/library service/i)).toBeNull();
  });

  it("says a build that recorded no commit has none, and that a source run is development", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: null, environment: "development" });
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("about-version")).toHaveTextContent("2.0.0 (build not recorded)"),
    );
    expect(screen.getByTestId("about-environment")).toHaveTextContent("Development");
  });

  it("still opens with an older main that has no build", async () => {
    installBridge(null);
    render(<AboutDialog open onClose={() => {}} />);

    expect(screen.getByTestId("about-version")).toHaveTextContent(/^\d/);
    expect(screen.getByTestId("about-version")).not.toHaveTextContent("build");
  });

  it("shows the build even when the engine bridge is not there", async () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" }, false);
    render(<AboutDialog open onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("about-version")).toHaveTextContent("(build abc1234)"));
  });
});

describe("the look of About (C134)", () => {
  afterEach(() => {
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("has the pixel logo, the name in the heading face and a label-value list without bullets", () => {
    installBridge({ version: "2.0.0", release: "cuepoint@2.0.0", dist: "abc1234", environment: "production" });
    render(<AboutDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "About CuePoint" });
    expect(dialog.querySelector("img.about-dialog__logo")).not.toBeNull();
    expect(within(dialog).getByText("CuePoint", { selector: ".about-dialog__name" })).toHaveClass("cp-text-section");
    expect(dialog.querySelector("dl.cp-facts")).not.toBeNull();
    expect(dialog.querySelector("ul")).toBeNull();
  });

  it("ends in one grey Close", () => {
    installBridge(null);
    render(<AboutDialog open onClose={() => {}} />);
    const close = screen.getAllByRole("button", { name: "Close" }).find((b) => b.classList.contains("cp-btn--secondary"));
    expect(close).toBeDefined();
  });
});

describe("versionWords", () => {
  it("writes the version one way", () => {
    expect(versionWords("1.2.3", { version: "1.2.3", release: "cuepoint@1.2.3", dist: "456", environment: "production" })).toBe(
      "1.2.3 (build 456)",
    );
    expect(versionWords("1.2.3", null)).toBe("1.2.3");
  });
});
