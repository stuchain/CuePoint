#!/usr/bin/env node
/**
 * `npm run beat`: writes out/beat.wav, the promo's music, made here from nothing but math, so there is
 * no sample or track to license. A 128 BPM house groove in A minor (8A on the wheel), 16 bars, on the
 * same grid as the picture (src/timing.ts): chip arpeggio from the first beat, kick from bar 1, a
 * riser into the app shots at bar 5 where the bass and claps come in, and a crash on the end card.
 * Deterministic: the noise is seeded, so every run writes the same file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BAR, BARS, BEAT, DURATION, KICKS } from "../src/timing.ts";

const RATE = 44100;
const N = Math.round(DURATION * RATE);
const L = new Float32Array(N);
const R = new Float32Array(N);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out", "beat.wav");

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

/** Adds a mono voice at time t (seconds), panned -1..1. */
function add(t, seconds, gain, pan, fn) {
  const start = Math.round(t * RATE);
  const len = Math.round(seconds * RATE);
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < len && start + i < N; i++) {
    if (start + i < 0) continue;
    const v = fn(i / RATE, i);
    L[start + i] += v * gl;
    R[start + i] += v * gr;
  }
}

function kick(t) {
  let phase = 0;
  add(t, 0.42, 0.95, 0, (s) => {
    const f = 45 + 110 * Math.exp(-s * 28);
    phase += (2 * Math.PI * f) / RATE;
    const release = Math.min(1, (0.42 - s) * 100); // fade the tail out instead of cutting it
    return (Math.sin(phase) * Math.exp(-s * 7.5) + (s < 0.004 ? (rnd() * 2 - 1) * 0.4 : 0)) * release;
  });
}

function hat(t, open = false) {
  let prev = 0;
  add(t, open ? 0.22 : 0.06, open ? 0.16 : 0.2, 0.25, (s) => {
    const n = rnd() * 2 - 1;
    const hp = n - prev; // crude high-pass: what is left is the hiss
    prev = n;
    return hp * Math.exp(-s * (open ? 18 : 70));
  });
}

function clap(t) {
  let lp = 0;
  add(t, 0.25, 0.42, -0.1, (s) => {
    const n = rnd() * 2 - 1;
    lp += 0.35 * (n - lp);
    const bursts = s < 0.03 ? (Math.floor(s / 0.01) % 2 === 0 ? 1 : 0.3) : 1;
    return (n - lp) * bursts * Math.exp(-s * 16);
  });
}

/** A pulse wave, the chip voice; `cutoff` 0..1 closes a one-pole low-pass over it. */
function chip(t, note, seconds, gain, pan, cutoff = 1, duty = 0.25) {
  const f = midi(note);
  let lp = 0;
  const a = Math.min(1, 0.02 + cutoff * cutoff);
  add(t, seconds, gain, pan, (s) => {
    // centred on zero (a pulse wave's mean is 2·duty − 1), with a short attack and release: no clicks
    const v = ((s * f) % 1 < duty ? 1 : -1) - (2 * duty - 1);
    lp += a * (v - lp);
    return lp * Math.min(1, s * 400, (seconds - s) * 400) * Math.exp(-s * 6);
  });
}

function bass(t, note, seconds) {
  const f = midi(note);
  add(t, seconds, 0.5, 0, (s) => {
    const p = (s * f) % 1;
    const tri = 4 * Math.abs(p - 0.5) - 1;
    const sq = p < 0.5 ? 1 : -1;
    return (tri * 0.8 + sq * 0.12) * Math.min(1, s * 300) * Math.min(1, (seconds - s) * 60);
  });
}

function noiseSweep(t, seconds, gain, rising) {
  let lp = 0;
  add(t, seconds, gain, 0, (s) => {
    const u = s / seconds;
    const amt = rising ? u : 1 - u;
    lp += (0.02 + 0.6 * amt * amt) * (rnd() * 2 - 1 - lp);
    return lp * (rising ? u * u : Math.exp(-s * 2.2));
  });
}

// Am, F, C, G, two bars each: roots and chord tones (MIDI)
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [57, 60, 65, 69] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
];
const chordAt = (bar) => CHORDS[Math.floor(bar / 2) % CHORDS.length];

for (let bar = 0; bar < BARS; bar++) {
  const c = chordAt(bar);
  const last = bar === BARS - 1;
  // the arpeggio opens up over the opening shot, then sits back under the app shots
  const cutoff = bar < 5 ? 0.15 + (bar / 5) * 0.6 : bar >= 13 ? 0.9 : 0.7;
  for (let s = 0; s < 16; s++) {
    if (last && s >= 8) break;
    const note = c.tones[[0, 1, 2, 3, 2, 1, 3, 2][s % 8]] + (s % 16 >= 8 && bar >= 13 ? 12 : 0);
    chip(at(bar, s / 4), note, BEAT / 4, 0.14, s % 2 ? 0.35 : -0.35, cutoff);
  }
  for (let b = 0; b < 4; b++) {
    if (last && b >= 2) break;
    if (bar >= 2 && !(bar === 4 && b >= 2)) hat(at(bar, b + 0.5), bar >= 5 && b === 3);
    if (bar >= 5 && (b === 1 || b === 3)) clap(at(bar, b));
    if (bar >= 5) {
      bass(at(bar, b + 0.5), c.root, BEAT * 0.42);
      if (b === 0) bass(at(bar, b), c.root, BEAT * 0.2);
    }
  }
}
// riser into the app shots, crashes on the cuts that matter
noiseSweep(at(4, 0), BAR, 0.5, true);
noiseSweep(at(5), BAR * 1.5, 0.35, false);
noiseSweep(at(13), BAR * 2, 0.35, false);
// the kick, on the list the picture pulses to (src/timing.ts)
for (const t of KICKS) kick(t);
// the last hit: the chord, ringing out
for (const n of chordAt(15).tones) chip(at(15, 2), n, BEAT * 2, 0.1, 0, 0.8, 0.5);

// master: gentle saturation, normalize to -1 dBFS, 20 ms fades
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * 1.2);
  R[i] = Math.tanh(R[i] * 1.2);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = (10 ** (-1 / 20)) / (peak || 1);
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
