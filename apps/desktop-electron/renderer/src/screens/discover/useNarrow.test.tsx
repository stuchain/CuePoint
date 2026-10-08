/**
 * When the Runs tab stacks its list above the run (DISCOVER-10): below a
 * width that grows with the UI scale, measured on the element itself, and
 * never for an element not yet laid out.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { useNarrow } from "./useNarrow";

let width = 0;
let observed: Array<() => void> = [];

function Probe({ below }: { below: number }) {
  const [ref, narrow] = useNarrow(below);
  return (
    <div ref={ref} data-testid="probe">
      {narrow ? "narrow" : "wide"}
    </div>
  );
}

function mount(below: number) {
  return render(
    <ScaleProvider>
      <Probe below={below} />
    </ScaleProvider>,
  );
}

beforeEach(() => {
  observed = [];
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) {
      observed.push(() => callback());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width }) as DOMRect,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useNarrow", () => {
  it("is not narrow before the element has a width", () => {
    width = 0;
    mount(560);
    expect(screen.getByTestId("probe")).toHaveTextContent("wide");
  });

  it("is narrow below the width times the scale, and follows resizes", () => {
    // The default scale is 1.5: 560 at scale 1 is 840 pixels here.
    width = 800;
    mount(560);
    expect(screen.getByTestId("probe")).toHaveTextContent("narrow");
    width = 900;
    act(() => observed.forEach((notify) => notify()));
    expect(screen.getByTestId("probe")).toHaveTextContent("wide");
  });
});
