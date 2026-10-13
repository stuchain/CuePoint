import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { resetRowDensityForTests, saveRowDensity } from "../../tokens/rowDensity";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { useRowHeight } from "./trackTableLayout";

const wrapper = ({ children }: { children: ReactNode }) => <ScaleProvider>{children}</ScaleProvider>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
  resetRowDensityForTests();
  document.documentElement.style.setProperty("--row-height", "19px");
});

afterEach(() => {
  document.documentElement.style.removeProperty("--row-height");
  delete document.documentElement.dataset.rowDensity;
  localStorage.clear();
  resetRowDensityForTests();
});

describe("useRowHeight", () => {
  it("reads the stylesheet's row height", () => {
    const { result } = renderHook(() => useRowHeight(), { wrapper });
    expect(result.current).toBe(19);
  });

  it("measures again when the density changes", () => {
    const { result } = renderHook(() => useRowHeight(), { wrapper });
    expect(result.current).toBe(19);
    act(() => {
      // The stylesheet would answer 26 for roomy; jsdom resolves no calc, so say it.
      document.documentElement.style.setProperty("--row-height", "26px");
      saveRowDensity("roomy");
    });
    expect(result.current).toBe(26);
  });
});
