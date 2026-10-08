import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_LEVEL_EVENT } from "./loop";

/**
 * The speaker button's behavior (DEC-191), against a made-up page: nothing starts until the press, a
 * press plays and publishes levels, a second press (or a hidden tab) stops and publishes 0.
 */
type Listener = (e?: unknown) => void;

function setup() {
  const listeners: Record<string, Listener[]> = {};
  const docListeners: Record<string, Listener[]> = {};
  const attrs: Record<string, string> = { "aria-pressed": "false" };
  const button = {
    dataset: { loopSrc: "/loop.mp3" },
    setAttribute: (k: string, v: string) => void (attrs[k] = v),
    addEventListener: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
  };
  const levels: number[] = [];
  const doc = {
    hidden: false,
    querySelector: (sel: string) => (sel === "[data-sound-toggle]" ? button : null),
    addEventListener: (type: string, fn: Listener) => void (docListeners[type] ??= []).push(fn),
    dispatchEvent: (e: { type: string; detail: number }) => {
      if (e.type === AUDIO_LEVEL_EVENT) levels.push(e.detail);
    },
  };
  const audio = { loop: false, preload: "", play: vi.fn(async () => undefined), pause: vi.fn() };
  const made = { contexts: 0, audios: 0 };
  const context = {
    resume: vi.fn(async () => undefined),
    destination: {},
    createAnalyser: () => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 128,
      connect: () => undefined,
      getByteFrequencyData: (a: Uint8Array) => a.fill(255),
    }),
    createMediaElementSource: () => ({ connect: () => undefined }),
  };
  const frames: (() => void)[] = [];
  vi.stubGlobal("document", doc);
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, init: { detail: number }) { this.detail = init.detail; } detail: number; });
  vi.stubGlobal("Audio", function () { made.audios += 1; return audio; });
  vi.stubGlobal("AudioContext", function () { made.contexts += 1; return context; });
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  return { button, attrs, listeners, docListeners, levels, audio, made, frames, doc };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("sound-client", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("makes no audio and fetches no file until the button is pressed", async () => {
    const env = setup();
    await import("./sound-client");
    expect(env.made).toEqual({ contexts: 0, audios: 0 });
    expect(env.audio.play).not.toHaveBeenCalled();
    expect(env.attrs["aria-pressed"]).toBe("false");
    expect(env.levels).toEqual([]);
  });

  it("plays on the first press, publishes the sound's level, and says it is on", async () => {
    const env = setup();
    await import("./sound-client");
    env.listeners["click"]![0]!();
    await settle();
    expect(env.made).toEqual({ contexts: 1, audios: 1 });
    expect(env.audio.loop).toBe(true);
    expect(env.audio.play).toHaveBeenCalledTimes(1);
    expect(env.attrs["aria-pressed"]).toBe("true");
    env.frames.shift()!(); // one animation frame
    expect(env.levels.at(-1)).toBe(1);
  });

  it("stops on the second press and publishes 0", async () => {
    const env = setup();
    await import("./sound-client");
    env.listeners["click"]![0]!();
    await settle();
    env.listeners["click"]![0]!();
    expect(env.audio.pause).toHaveBeenCalled();
    expect(env.attrs["aria-pressed"]).toBe("false");
    expect(env.levels.at(-1)).toBe(0);
  });

  it("stops when the tab is hidden", async () => {
    const env = setup();
    await import("./sound-client");
    env.listeners["click"]![0]!();
    await settle();
    env.doc.hidden = true;
    env.docListeners["visibilitychange"]![0]!();
    expect(env.audio.pause).toHaveBeenCalled();
    expect(env.attrs["aria-pressed"]).toBe("false");
  });

  it("leaves the button off when the browser refuses to play", async () => {
    const env = setup();
    env.audio.play.mockRejectedValueOnce(new Error("blocked"));
    await import("./sound-client");
    env.listeners["click"]![0]!();
    await settle();
    expect(env.attrs["aria-pressed"]).toBe("false");
  });
});
