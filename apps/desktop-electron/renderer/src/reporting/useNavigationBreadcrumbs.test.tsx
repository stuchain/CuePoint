import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { fakeFacade } from "./fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "./reporting";
import { useNavigationBreadcrumbs } from "./useNavigationBreadcrumbs";

function Probe({ navigateRef }: { navigateRef: { current: ((to: string) => void) | null } }) {
  useNavigationBreadcrumbs();
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate, navigateRef]);
  return null;
}

describe("useNavigationBreadcrumbs", () => {
  afterEach(() => resetRendererReporting());

  it("records the destination id and nothing after it", async () => {
    const sdk = fakeFacade();
    await setupRendererReporting({
      sdk,
      bridge: { errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) } },
    });
    const navigateRef: { current: ((to: string) => void) | null } = { current: null };
    render(
      <MemoryRouter initialEntries={["/library?q=Secret%20Song#frag"]}>
        <Probe navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    for (const to of ["/clean", "/discover/artist/Some%20Artist?tab=x", "/nowhere"]) {
      act(() => navigateRef.current!(to));
    }
    const messages = sdk.breadcrumbs.map((c) => c.message);
    expect(messages).toEqual(["library", "clean", "discover"]);
    expect(JSON.stringify(sdk.breadcrumbs)).not.toMatch(/Secret|Artist|frag|tab/);
    expect(sdk.breadcrumbs.every((c) => c.category === "navigation")).toBe(true);
  });
});
