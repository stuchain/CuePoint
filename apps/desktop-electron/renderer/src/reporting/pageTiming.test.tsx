import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { usePageTiming } from "./pageTiming";

function Probe({ navigateRef }: { navigateRef: { current: ((to: string) => void) | null } }) {
  usePageTiming();
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate, navigateRef]);
  return null;
}

async function frames() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

describe("usePageTiming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as { cuepoint?: unknown }).cuepoint;
  });

  it("sends one report per pathname change with the destination id, never the path", async () => {
    const reportPageSwitch = vi.fn();
    (window as unknown as { cuepoint: unknown }).cuepoint = { reportPageSwitch };
    const navigateRef: { current: ((to: string) => void) | null } = { current: null };
    render(
      <MemoryRouter initialEntries={["/library?q=Secret"]}>
        <Probe navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    await frames();
    for (const to of ["/clean", "/discover/artist/Some%20Artist?tab=x", "/nowhere", "/clean"]) {
      act(() => navigateRef.current!(to));
      await frames();
    }
    expect(reportPageSwitch.mock.calls.map((c) => c[0])).toEqual(["library", "clean", "discover", "clean"]);
    for (const [, ms] of reportPageSwitch.mock.calls) {
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(reportPageSwitch.mock.calls)).not.toMatch(/Secret|Artist/);
  });

  it("does not report a second time for a re-render on the same path", async () => {
    const reportPageSwitch = vi.fn();
    (window as unknown as { cuepoint: unknown }).cuepoint = { reportPageSwitch };
    const view = render(
      <MemoryRouter initialEntries={["/library"]}>
        <Probe navigateRef={{ current: null }} />
      </MemoryRouter>,
    );
    await frames();
    view.rerender(
      <MemoryRouter initialEntries={["/library"]}>
        <Probe navigateRef={{ current: null }} />
      </MemoryRouter>,
    );
    await frames();
    expect(reportPageSwitch).toHaveBeenCalledTimes(1);
  });

  it("works when the bridge lacks the method", async () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = {};
    const navigateRef: { current: ((to: string) => void) | null } = { current: null };
    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Probe navigateRef={navigateRef} />
      </MemoryRouter>,
    );
    act(() => navigateRef.current!("/clean"));
    await expect(frames()).resolves.toBeUndefined();
  });
});
