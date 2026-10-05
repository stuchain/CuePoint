import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { WaveformCanvas } from "./WaveformCanvas";
import { BANDS } from "./waveformLayout";
import { resetWaveformColourForTests, saveWaveformColour } from "./waveformColour";

/**
 * The canvas (WAVE-05): sized in device pixels from its box, filled with the
 * layout and nothing else, painted again when the theme changes, and hidden
 * from assistive technology because its holder says what it shows.
 *
 * jsdom has no canvas, so its context is a recorder here; the pixels are the
 * end-to-end test's.
 */

interface Recorder {
  fills: { colour: string; rect: number[] }[];
  clears: number;
}

let recorder: Recorder;

beforeEach(() => {
  localStorage.clear();
  resetWaveformColourForTests();
  recorder = { fills: [], clears: 0 };
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: () => {
      recorder.clears += 1;
      recorder.fills = [];
    },
    fillRect(x: number, y: number, w: number, h: number) {
      recorder.fills.push({ colour: String(this.fillStyle), rect: [x, y, w, h] });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 50,
    height: 20,
  } as DOMRect);
  // jsdom does not inherit custom properties into a child's computed style;
  // the app's tokens live on the root, so they are read from there.
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => document.documentElement.style.getPropertyValue(name),
      }) as CSSStyleDeclaration,
  );
  document.documentElement.dataset.scale = "1";
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
  document.documentElement.style.setProperty("--waveform-low", "#0000ff");
  document.documentElement.style.setProperty("--waveform-mono", "#ff00ff");
});

afterEach(() => {
  document.documentElement.removeAttribute("style");
  localStorage.clear();
  resetWaveformColourForTests();
});

function draw(props: Partial<Parameters<typeof WaveformCanvas>[0]> = {}) {
  return render(
    <ScaleProvider>
      <WaveformCanvas data={new Uint8Array(25 * BANDS).fill(200)} durationMs={10_000} {...props} />
    </ScaleProvider>,
  );
}

describe("WaveformCanvas", () => {
  it("is hidden from assistive technology", () => {
    const { container } = draw();
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes itself in device pixels and draws a column per scale pixel", () => {
    const { container } = draw();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBe(50 * (window.devicePixelRatio || 1));
    expect(canvas.height).toBe(20 * (window.devicePixelRatio || 1));
    expect(canvas.dataset.columns).toBe("50");
  });

  it("fills the layout with the theme's colours", () => {
    draw({ mode: "bands" });
    expect(recorder.fills.filter((f) => f.colour === "#0000ff")).toHaveLength(50);
  });

  it("follows the remembered colour choice unless told one", () => {
    saveWaveformColour("single");
    const { container } = draw();
    expect(container.querySelector("canvas")!.dataset.mode).toBe("single");
    expect(new Set(recorder.fills.map((f) => f.colour))).toEqual(new Set(["#ff00ff"]));
  });

  it("changes with the choice while it is shown", () => {
    const { container } = draw();
    act(() => saveWaveformColour("single"));
    expect(container.querySelector("canvas")!.dataset.mode).toBe("single");
  });

  it("paints again when the theme changes", async () => {
    draw({ mode: "bands" });
    const before = recorder.clears;

    await act(async () => {
      document.documentElement.style.setProperty("--waveform-low", "#00ff00");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(recorder.clears).toBeGreaterThan(before);
    expect(recorder.fills.filter((f) => f.colour === "#00ff00")).toHaveLength(50);
  });

  it("draws the playhead it is given", () => {
    document.documentElement.style.setProperty("--fg-primary", "#fafafa");
    draw({ playheadMs: 5_000 });
    const playhead = recorder.fills.at(-1)!;
    expect(playhead.colour).toBe("#fafafa");
    expect(playhead.rect[0]).toBe(25 * (window.devicePixelRatio || 1));
  });
});
