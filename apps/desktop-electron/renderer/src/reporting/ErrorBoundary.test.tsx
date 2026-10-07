import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ErrorBoundary } from "./ErrorBoundary";
import { fakeFacade } from "./fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "./reporting";

function Broken(): never {
  throw new Error("render failed");
}

async function startReporting() {
  const sdk = fakeFacade();
  await setupRendererReporting({
    sdk,
    bridge: {
      errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) },
    },
  });
  return sdk;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs a caught render error; the tests assert what the user sees instead.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => resetRendererReporting());

  it("shows the error screen, records one event with a component stack, and shows the short id", async () => {
    const sdk = await startReporting();
    render(
      <ErrorBoundary scope="app">
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(sdk.exceptions).toHaveLength(1);
    expect((sdk.exceptions[0]!.error as Error).message).toBe("render failed");
    expect(JSON.stringify(sdk.exceptions[0]!.hint)).toContain("componentStack");
    expect(JSON.stringify(sdk.exceptions[0]!.hint)).toMatch(/at Broken/);
    const shown = screen.getByTestId("error-screen-report-id").textContent;
    expect(shown).toMatch(/^[0-9a-f]{8}$/);
  });

  it("Reload reloads the window", async () => {
    await startReporting();
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    try {
      render(
        <ErrorBoundary scope="app">
          <Broken />
        </ErrorBoundary>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Reload" }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("shows no id, and still the screen, when nothing was reported", () => {
    render(
      <ErrorBoundary scope="page">
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByTestId("error-screen-report-id")).toBeNull();
  });

  it("clears when its reset key changes", () => {
    function Host() {
      const [key, setKey] = useState("a");
      return (
        <>
          <button onClick={() => setKey("b")}>go</button>
          <ErrorBoundary scope="page" resetKey={key}>
            {key === "a" ? <Broken /> : <p>fine</p>}
          </ErrorBoundary>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByTestId("error-screen")).toBeInTheDocument();
    return userEvent.click(screen.getByText("go")).then(() => {
      expect(screen.getByText("fine")).toBeInTheDocument();
    });
  });
});
