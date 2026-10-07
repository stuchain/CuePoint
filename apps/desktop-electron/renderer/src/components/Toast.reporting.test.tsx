import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";

import { fakeFacade } from "../reporting/fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "../reporting/reporting";
import { ToastProvider, useToast } from "./Toast";

let push: ReturnType<typeof useToast>["push"];
function Grab() {
  push = useToast().push;
  return null;
}

describe("toasts as steps before an error (REPORT-06)", () => {
  afterEach(() => resetRendererReporting());

  it("records an error or warning toast's kind, never its words", async () => {
    const sdk = fakeFacade();
    await setupRendererReporting({
      sdk,
      bridge: { errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) } },
    });
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => {
      push("Could not move Secret Song.mp3", "warning");
      push("Saved", "success");
      push("Failed on Artist X", "error");
    });
    expect(sdk.breadcrumbs).toEqual([
      { category: "toast", message: "warning", level: "info" },
      { category: "toast", message: "error", level: "info" },
    ]);
  });
});
