/**
 * Every reason the engine gives has a short token (R4-8).
 *
 * Runs over `similarReasons.fixture.json`, one of each reason the engine can
 * give, so a reason added to the engine without a token fails here, as it does
 * in `similarReasons.test.ts` for its sentence.
 */
import { describe, expect, it } from "vitest";

import fixture from "./similarReasons.fixture.json";
import { reasonTokens, tempoDeltaText, tokenRun } from "./reasonTokens";
import type { SimilarReason } from "./similarReasons";

const REASONS = fixture.reasons as SimilarReason[];

const key = (detail: "same" | "adjacent" | "relative", from: string, to = from): SimilarReason => ({
  component: "key",
  detail,
  points: 1,
  from,
  to,
});
const tempo = (detail: "same" | "close" | "half" | "double", from: number, to: number): SimilarReason => ({
  component: "tempo",
  detail,
  points: 1,
  from,
  to,
});

describe("every reason the engine gives", () => {
  it.each(REASONS.map((r) => [`${r.component}:${r.detail}`, r] as const))(
    "%s has a token of its own",
    (_, reason) => {
      const tokens = reasonTokens([reason]);
      switch (reason.component) {
        case "key":
          expect(tokens.key).not.toBeNull();
          break;
        case "tempo":
          expect(tokens.tempo).not.toBeNull();
          break;
        case "genre":
          expect(tokens.genre).toBe(true);
          break;
        case "label":
          expect(tokens.label).toBe(true);
          break;
        case "artist":
          expect(tokens.artist).toBe(true);
          break;
      }
      expect(tokenRun(tokens)).not.toBe("");
      expect(tokenRun(tokens)).not.toMatch(/undefined|NaN|\[object/);
    },
  );

  it("reads all ten together as one run", () => {
    // The fixture holds both a same and a close tempo and three key relations: the last of a
    // component wins, so the run is the whole fixture's final word on each.
    expect(tokenRun(reasonTokens(REASONS))).toMatch(/ · G · L · A$/);
  });
});

describe("reasonTokens", () => {
  it("reads no reasons as nothing", () => {
    expect(reasonTokens([])).toEqual({ key: null, tempo: null, genre: false, label: false, artist: false });
    expect(tokenRun(reasonTokens([]))).toBe("");
  });

  it("reads a key", () => {
    expect(reasonTokens([key("same", "8A")]).key).toBe("same");
    expect(reasonTokens([key("relative", "8A", "8B")]).key).toBe("rel.");
    expect(reasonTokens([key("adjacent", "8A", "9A")]).key).toBe("+1");
    expect(reasonTokens([key("adjacent", "9A", "8A")]).key).toBe("−1");
    expect(reasonTokens([key("adjacent", "12A", "1A")]).key).toBe("+1");
    expect(reasonTokens([key("adjacent", "1B", "12B")]).key).toBe("−1");
  });

  it("reads classic notation", () => {
    // Am is 8A and Em is 9A.
    expect(reasonTokens([key("adjacent", "Am", "Em")]).key).toBe("+1");
    expect(reasonTokens([key("adjacent", "Em", "Am")]).key).toBe("−1");
  });

  it("says next when a key cannot be read, and rel. when only the letter changes", () => {
    expect(reasonTokens([key("adjacent", "??", "9A")]).key).toBe("next");
    expect(reasonTokens([key("adjacent", "8A", "")]).key).toBe("next");
    expect(reasonTokens([key("adjacent", "8A", "8B")]).key).toBe("rel.");
  });

  it("reads a tempo", () => {
    expect(reasonTokens([tempo("close", 124, 126.4)]).tempo).toEqual({ delta: 2 });
    expect(reasonTokens([tempo("close", 126, 124)]).tempo).toEqual({ delta: -2 });
    expect(reasonTokens([tempo("same", 124, 124)]).tempo).toEqual({ delta: 0 });
    expect(reasonTokens([tempo("half", 124, 62)]).tempo).toBe("half");
    expect(reasonTokens([tempo("double", 124, 248)]).tempo).toBe("double");
  });

  it("reads genre, label and artist", () => {
    const tokens = reasonTokens([
      { component: "genre", detail: "same", points: 1, name: "House" },
      { component: "artist", detail: "shared", points: 1, names: ["Âme"] },
    ]);
    expect(tokens).toMatchObject({ genre: true, label: false, artist: true });
  });
});

describe("tokenRun", () => {
  it("orders key, tempo, then G, L, A", () => {
    const reasons: SimilarReason[] = [
      { component: "artist", detail: "shared", points: 1, names: ["Âme"] },
      { component: "label", detail: "same", points: 1, name: "Innervisions" },
      { component: "genre", detail: "same", points: 1, name: "House" },
      tempo("close", 126, 124),
      key("adjacent", "9A", "8A"),
    ];
    expect(tokenRun(reasonTokens(reasons))).toBe("−1 · −2 BPM · G · L · A");
  });

  it("writes each tempo token", () => {
    const run = (r: SimilarReason) => tokenRun(reasonTokens([r]));
    expect(run(tempo("same", 124, 124))).toBe("±0 BPM");
    expect(run(tempo("close", 124, 126))).toBe("+2 BPM");
    expect(run(tempo("close", 126, 124))).toBe("−2 BPM");
    expect(run(tempo("half", 124, 62))).toBe("0.5×");
    expect(run(tempo("double", 124, 248))).toBe("2×");
  });

  it("writes each key token", () => {
    const run = (r: SimilarReason) => tokenRun(reasonTokens([r]));
    expect(run(key("same", "8A"))).toBe("same");
    expect(run(key("relative", "8A", "8B"))).toBe("rel.");
    expect(run(key("adjacent", "8A", "9A"))).toBe("+1");
    expect(run(key("adjacent", "?", "?"))).toBe("next");
  });
});

describe("tempoDeltaText", () => {
  it("reads a tempo change without a unit, with the real minus", () => {
    expect(tempoDeltaText({ delta: -2 })).toBe("−2");
    expect(tempoDeltaText({ delta: 3 })).toBe("+3");
    expect(tempoDeltaText({ delta: 0 })).toBe("±0");
    expect(tempoDeltaText("half")).toBe("0.5×");
    expect(tempoDeltaText("double")).toBe("2×");
    expect(tempoDeltaText(null)).toBe("");
  });

  it("rounds a half away from zero", () => {
    expect(reasonTokens([tempo("close", 124, 123.5)]).tempo).toEqual({ delta: -1 });
    expect(reasonTokens([tempo("close", 124, 124.5)]).tempo).toEqual({ delta: 1 });
    expect(tempoDeltaText(reasonTokens([tempo("close", 124, 123.5)]).tempo)).toBe("−1");
  });
});
