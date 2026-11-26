/**
 * A recording 2D context for the crowd's tests: jsdom has no canvas, so (as the waveform's tests do)
 * `getContext` is replaced with an object that remembers what was filled.
 */
export interface FillRecord {
  colour: string;
  rect: [number, number, number, number];
  alpha: number;
}

/** A filled path (a beam, the floor glow): what it was filled with and how opaque. */
export interface PathRecord {
  style: unknown;
  alpha: number;
}

export function makeContextMock() {
  const fills: FillRecord[] = [];
  const paths: PathRecord[] = [];
  const saved: number[] = [];
  const state = { fillStyle: "" as unknown, globalAlpha: 1, imageSmoothingEnabled: true, font: "", textBaseline: "" };
  const gradient = { addColorStop: () => undefined };
  const ctx = Object.assign(state, {
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ colour: String(state.fillStyle), rect: [x, y, w, h], alpha: state.globalAlpha });
    },
    clearRect: () => undefined,
    drawImage: () => undefined,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    translate: () => undefined,
    scale: () => undefined,
    arc: () => undefined,
    save() {
      saved.push(state.globalAlpha);
    },
    restore() {
      state.globalAlpha = saved.pop() ?? 1;
    },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill() {
      paths.push({ style: state.fillStyle, alpha: state.globalAlpha });
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, fills, paths };
}
