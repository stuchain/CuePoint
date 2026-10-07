import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";

import { ErrorBoundary } from "./ErrorBoundary";
import { E2E_CRASH_EVENT, E2eCrashProbe, resetE2eCrashProbe } from "./E2eCrashProbe";

function mount() {
  return render(
    <ErrorBoundary scope="page">
      <E2eCrashProbe />
    </ErrorBoundary>,
  );
}

describe("E2eCrashProbe", () => {
  afterEach(() => {
    delete (window as { cuepoint?: unknown }).cuepoint;
    resetE2eCrashProbe();
  });

  it("asks main once, however many pages mount", async () => {
    const enabled = vi.fn(async () => false);
    window.cuepoint = { testHooks: { enabled } } as never;
    const first = mount();
    await waitFor(() => expect(enabled).toHaveBeenCalled());
    first.unmount();
    mount();
    mount();
    await act(async () => {});
    expect(enabled).toHaveBeenCalledTimes(1);
  });

  it("throws on the event only when main says this is a test run", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const enabled = vi.fn(async () => true);
    window.cuepoint = { testHooks: { enabled } } as never;
    mount();
    await waitFor(() => expect(enabled).toHaveBeenCalled());
    await act(async () => {});
    act(() => {
      window.dispatchEvent(new Event(E2E_CRASH_EVENT));
    });
    expect(screen.getByTestId("error-screen")).toBeInTheDocument();
  });

  it("does nothing for a user's build", async () => {
    const enabled = vi.fn(async () => false);
    window.cuepoint = { testHooks: { enabled } } as never;
    mount();
    await waitFor(() => expect(enabled).toHaveBeenCalled());
    await act(async () => {});
    act(() => {
      window.dispatchEvent(new Event(E2E_CRASH_EVENT));
    });
    expect(screen.queryByTestId("error-screen")).toBeNull();
  });
});
