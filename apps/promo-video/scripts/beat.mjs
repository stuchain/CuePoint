#!/usr/bin/env node
/**
 * `npm run beat`: writes out/beat.wav, the promo's music, made here from nothing but math, so there is
 * no sample or track to license. Melodic breakbeat in the spirit of Bicep: a broken beat, wide detuned
 * pads, a rolling arp through a dotted-eighth delay, a sub bass, and a big room on everything. 128 BPM
 * in A minor (8A on the wheel), 16 bars on the same grid as the picture (src/timing.ts):
 *
 *   bar 0      pads and arp, filtered, alone
 *   bars 1-2   the breakbeat comes in; a riser clears the second half of bar 2
 *   bars 3-11  the drop: bass, open pads, the lead arp (the app shots)
 *   bars 12-15 the end card: everything open, one last hit on the third beat of the final bar
 *
 * Deterministic: the noise is seeded, so every run writes the same file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BAR, BARS, BEAT, DURATION, FINAL_HIT, KICKS, SNARES } from "../src/timing.ts";

const RATE = 44100;
const N = Math.round(DURATION * RATE);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out", "beat.wav");

/** The dry mix, a reverb send and a delay send, each stereo. */
const dry = [new Float32Array(N), new Float32Array(N)];
/** Pads and sub: mixed like `dry`, but ducked by the kick (the pump). */
const pumped = [new Float32Array(N), new Float32Array(N)];
const verb = [new Float32Array(N), new Float32Array(N)];
const echo = [new Float32Array(N), new Float32Array(N)];

// seeded noise (mulberry32)
let seed = 0x5eed;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const at = (bar, beat = 0) => bar * BAR + beat * BEAT;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const DROP = at(3);
const END = at(12);

/**
 * Adds a mono voice at time t (seconds), panned -1..1, with sends to the reverb and the delay. Every
 * voice fades in and out over a few milliseconds, so nothing clicks.
 */
function add(t, seconds, gain, pan, fn, sends = {}) {
  const start = Math.round(t * RATE);
  const len = Math.round(seconds * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  const rv = sends.verb ?? 0;
  const dl = sends.echo ?? 0;
  const edge = Math.round(0.003 * RATE);
  for (let i = 0; i < len && start + i < N; i++) {
    if (start + i < 0) continue;
    const env = Math.min(1, (i + 1) / edge, (len - i) / edge);
    const v = fn(i / RATE, i) * env;
    const j = start + i;
    const bus = sends.pump ? pumped : dry;
    bus[0][j] += v * gl;
    bus[1][j] += v * gr;
    if (rv) {
      verb[0][j] += v * gl * rv;
      verb[1][j] += v * gr * rv;
    }
    if (dl) {
      echo[0][j] += v * gl * dl;
      echo[1][j] += v * gr * dl;
    }
  }
}

// ---- drums ----

function kick(t, big = false) {
  let phase = 0;
  const len = big ? 0.9 : 0.42;
  add(t, len, big ? 1.1 : 0.95, 0, (s) => {
    const f = 42 + 120 * Math.exp(-s * 30);
    phase += (2 * Math.PI * f) / RATE;
    return Math.sin(phase) * Math.exp(-s * (big ? 3.5 : 7.5)) + (s < 0.005 ? (rnd() * 2 - 1) * 0.5 : 0);
  }, { verb: big ? 0.25 : 0.04 });
}

function snare(t) {
  let lp = 0;
  let phase = 0;
  add(t, 0.4, 0.55, 0.05, (s) => {
    const n = rnd() * 2 - 1;
    lp += 0.45 * (n - lp);
    phase += (2 * Math.PI * (190 - 40 * Math.min(1, s * 20))) / RATE;
    const body = Math.sin(phase) * Math.exp(-s * 30) * 0.6;
    return (n - lp * 0.6) * Math.exp(-s * 14) + body;
  }, { verb: 0.45 });
}

function hat(t, gain, open = false) {
  let prev = 0;
  add(t, open ? 0.25 : 0.05, gain, 0.3, (s) => {
    const n = rnd() * 2 - 1;
    const hp = n - prev; // crude high-pass: what is left is the hiss
    prev = n;
    return hp * Math.exp(-s * (open ? 14 : 80));
  }, { verb: 0.08 });
}

function rim(t) {
  add(t, 0.06, 0.18, -0.4, (s) => Math.sin(2 * Math.PI * 1700 * s) * Math.exp(-s * 90), { verb: 0.3, echo: 0.2 });
}

// ---- tonal ----

/** A detuned supersaw pad: seven saws, a slow low-pass that opens with `bright`, wide stereo. */
function pad(t, notes, seconds, gain, bright) {
  const voices = [-0.11, -0.07, -0.03, 0, 0.03, 0.07, 0.11];
  for (const [k, note] of notes.entries()) {
    for (const [vi, cents] of voices.entries()) {
      const f = midi(note) * 2 ** (cents / 12);
      const pan = (vi / (voices.length - 1)) * 1.6 - 0.8;
      let lp = 0;
      let lp2 = 0;
      const phase0 = rnd();
      add(t, seconds, gain / voices.length, pan, (s) => {
        const saw = 2 * ((s * f + phase0) % 1) - 1;
        const swell = Math.min(1, s / 0.35) * Math.min(1, (seconds - s) / 0.5);
        const cut = 0.01 + 0.12 * bright * (0.7 + 0.3 * Math.sin(s * 1.3 + k));
        lp += cut * (saw - lp);
        lp2 += cut * (lp - lp2);
        return lp2 * swell;
      }, { verb: 0.5, pump: true });
    }
  }
}

/** A plucked square: a short, bright note with a fast low-pass decay, sent to the delay. */
function pluck(t, note, gain, pan, bright) {
  const f = midi(note);
  let lp = 0;
  add(t, BEAT * 0.9, gain, pan, (s) => {
    const sq = ((s * f) % 1 < 0.5 ? 1 : -1) * 0.7 + (2 * ((s * f * 1.003) % 1) - 1) * 0.3;
    const cut = Math.min(0.9, 0.04 + bright * 0.5 * Math.exp(-s * 9));
    lp += cut * (sq - lp);
    return lp * Math.exp(-s * 5);
  }, { verb: 0.25, echo: 0.55 });
}

/** The sub: a sine with a little drive, ducked by the kick. */
function sub(t, note, seconds) {
  const f = midi(note);
  add(t, seconds, 0.55, 0, (s) => Math.tanh(Math.sin(2 * Math.PI * f * s) * 1.6) * Math.min(1, s * 40, (seconds - s) / 0.02), { pump: true });
}

function riser(t, seconds) {
  let lp = 0;
  add(t, seconds, 0.45, 0, (s) => {
    const u = s / seconds;
    lp += (0.02 + 0.5 * u * u) * (rnd() * 2 - 1 - lp);
    return lp * u * u;
  }, { verb: 0.4 });
}

function impact(t) {
  let lp = 0;
  add(t, BAR * 1.5, 0.5, 0, (s) => {
    lp += 0.08 * (rnd() * 2 - 1 - lp);
    return lp * Math.exp(-s * 1.8);
  }, { verb: 0.6 });
}

// Am9, Fmaj7, Cmaj7, Em7, one bar each: the wistful turn the genre lives on
const CHORDS = [
  { root: 45, pad: [57, 60, 64, 67, 71], arp: [69, 72, 76, 79, 83, 79, 76, 72] },
  { root: 41, pad: [57, 60, 64, 65, 69], arp: [65, 69, 72, 76, 81, 76, 72, 69] },
  { root: 48, pad: [55, 59, 60, 64, 67], arp: [67, 71, 72, 76, 79, 76, 72, 71] },
  { root: 40, pad: [55, 59, 62, 64, 67], arp: [64, 67, 71, 74, 79, 74, 71, 67] },
];
const chordAt = (bar) => CHORDS[bar % CHORDS.length];

for (let bar = 0; bar < BARS; bar++) {
  const c = chordAt(bar);
  const t0 = at(bar);
  const last = bar === BARS - 1;
  const inDrop = t0 >= DROP;
  const open = t0 >= END ? 1 : inDrop ? 0.75 : 0.45 + bar * 0.12;
  // pads, a bar each, opening up through the intro
  pad(t0, c.pad, last ? BAR * 0.62 : BAR + 0.15, 0.32, open);
  // the arp: sixteenths, the lead an octave up from the drop
  for (let s = 0; s < 16; s++) {
    if (last && s >= 8) break;
    const note = c.arp[s % 8] + (inDrop && s % 4 === 3 ? 12 : 0);
    pluck(at(bar, s / 4), note, inDrop ? 0.11 : 0.08, s % 2 ? 0.45 : -0.45, open);
  }
  // hats: shuffled sixteenths with accents, from bar 1
  if (bar >= 1) {
    for (let s = 0; s < 16; s++) {
      if (bar === 2 && s >= 8) break;
      if (last && s >= 8) break;
      const swing = s % 2 ? 0.035 : 0;
      const accent = s % 4 === 2 ? 0.2 : s % 2 ? 0.07 : 0.11;
      hat(at(bar, s / 4) + swing, accent, inDrop && s === 14);
    }
  }
  // the sub follows the chord's root on the kick's pattern, from the drop
  if (inDrop) {
    const steps = last ? [0] : [0, 1.75, 2.5];
    steps.forEach((b, i) => {
      const beats = i === steps.length - 1 ? (last ? 2.5 : 1.4) : steps[i + 1] - b;
      sub(at(bar, b), c.root - 12, beats * BEAT * 0.95);
    });
    if (!last) rim(at(bar, 3.5));
  }
}

for (const t of KICKS) kick(t, Math.abs(t - FINAL_HIT) < 1e-6);
for (const t of SNARES) snare(t);
riser(at(2, 0), BAR);
impact(DROP);
impact(END);
// the last hit: the chord, ringing out into the room
pad(FINAL_HIT, CHORDS[0].pad, BEAT * 2, 0.4, 1);

// ---- effects: dotted-eighth ping-pong delay, then a small Schroeder room ----

const delay = Math.round(BEAT * 0.75 * RATE);
for (let i = delay; i < N; i++) {
  // ping-pong: each side feeds the other
  echo[0][i] += echo[1][i - delay] * 0.42;
  echo[1][i] += echo[0][i - delay] * 0.42;
}
for (let i = 0; i < N; i++) {
  verb[0][i] += echo[0][i] * 0.3;
  verb[1][i] += echo[1][i] * 0.3;
}

function room(input, offset) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => d + offset);
  for (const d of combs) {
    const buf = new Float32Array(d);
    let lp = 0;
    for (let i = 0, k = 0; i < N; i++, k = (k + 1) % d) {
      const y = buf[k];
      lp = y * 0.6 + lp * 0.4; // damping
      buf[k] = input[i] + lp * 0.84;
      out[i] += y / combs.length;
    }
  }
  for (const d of [225, 556, 441].map((x) => x + offset)) {
    const buf = new Float32Array(d);
    for (let i = 0, k = 0; i < N; i++, k = (k + 1) % d) {
      const b = buf[k];
      const y = -out[i] + b;
      buf[k] = out[i] + b * 0.5;
      out[i] = y;
    }
  }
  return out;
}
const wetL = room(verb[0], 0);
const wetR = room(verb[1], 23);

// ---- master: sidechain the pads, sub, delay and room to the kick, saturate, normalize to -1 dBFS ----

const duck = new Float32Array(N).fill(1);
for (const k of KICKS) {
  const s = Math.round(k * RATE);
  const attack = Math.round(0.004 * RATE);
  for (let i = -attack; i < Math.round(0.3 * RATE) && s + i < N; i++) {
    if (s + i < 0) continue;
    // a 4 ms slope down into the duck, then the slow release back up
    const g = i < 0 ? 1 - 0.65 * ((i + attack) / attack) : 0.35 + 0.65 * (i / (0.3 * RATE)) ** 1.5;
    duck[s + i] = Math.min(duck[s + i], g);
  }
}
const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((dry[0][i] + pumped[0][i] * duck[i] + echo[0][i] * 0.5 * duck[i] + wetL[i] * 0.9 * duck[i]) * 0.55);
  R[i] = Math.tanh((dry[1][i] + pumped[1][i] * duck[i] + echo[1][i] * 0.5 * duck[i] + wetR[i] * 0.9 * duck[i]) * 0.55);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 10 ** (-1 / 20) / (peak || 1);
const fade = Math.round(0.02 * RATE);
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const env = Math.min(1, i / fade, (N - 1 - i) / fade);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm * env)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm * env)) * 32767), 46 + i * 4);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
console.log(`${OUT}  ${DURATION.toFixed(2)} s`);
