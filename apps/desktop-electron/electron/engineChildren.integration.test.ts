import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { resolvePlayerBinary } from "./playerLaunch";
import { stopProcessTree } from "./processTree";

/**
 * The waveform analysis's decoders end with the engine (WAVE-03).
 *
 * The engine analyses each file in a child `mpv` at lowered priority
 * (WAVE-01). When the app stops the engine it stops the process tree
 * (CLEAN-14): `taskkill /T` on Windows; elsewhere a signal, after which a
 * decoder writing into the engine's pipe dies of the broken pipe. Either way
 * no decoder may outlive the engine that started it, decoding for minutes into
 * nothing.
 *
 * This starts a stand-in engine — Python decoding a long file through the real
 * `audio_decode` and the real `mpv` — stops it exactly as the app does, and
 * requires the decoder to be gone. Skips without a fetched `mpv` or a Python;
 * desktop CI has both.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const SRC = path.join(REPO_ROOT, "src");

const mpv = resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env })?.path;

function findPython(): string | null {
  const candidates = [
    process.env.CUEPOINT_TEST_PYTHON,
    path.join(REPO_ROOT, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"),
    "python3",
    "python",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import sys; assert sys.version_info >= (3, 11)"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const python = mpv ? findPython() : null;
const describeWithDecoder = mpv && python ? describe : describe.skip;

/** A silent mono WAV, eight-bit at 8 kHz: ten minutes is 4.8 MB. */
function silentWav(file: string, seconds: number): void {
  const rate = 8000;
  const samples = rate * seconds;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28); // bytes a second
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits a sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(samples, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.alloc(samples, 0x80)]));
}

/** True while a process with this id exists. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

// The engine's half: decode in the background, as a run does, and say which
// child is decoding. The decoder is the real one, spawned the real way, told
// only to play at a hundredth of the speed: mpv decodes ten minutes of audio
// in under a second, and a decode that ends by itself during the wait below
// would pass whether or not stopping the engine ended it. Slowed, it runs for
// over a minute, so only the stop can end it in time.
const ENGINE = `
import sys, threading, time
from cuepoint.data import audio_decode as ad

arguments = ad.decoder_arguments
def slowed(*args, **kwargs):
    built = arguments(*args, **kwargs)
    return built[:-2] + ["--speed=0.01"] + built[-2:]
ad.decoder_arguments = slowed

source, decoder = sys.argv[1], sys.argv[2]
threading.Thread(target=lambda: ad.decode_envelope(source, decoder), daemon=True).start()
deadline = time.monotonic() + 20
while ad.live_children() == 0:
    if time.monotonic() > deadline:
        sys.exit("no decoder started")
    time.sleep(0.01)
with ad._LIVE_LOCK:
    print(next(iter(ad._LIVE)).pid, flush=True)
time.sleep(600)
`;

// The worker's half (C19g): the engine hands its analysis to a child process,
// which runs the decoders. The worker program patches the decoder to the same
// hundredth of the speed, then runs the real loop; the engine computes through
// the real client and says which process is the worker.
const WORKER = `
import sys
from cuepoint.data import audio_decode as ad

arguments = ad.decoder_arguments
def slowed(*args, **kwargs):
    built = arguments(*args, **kwargs)
    return built[:-2] + ["--speed=0.01"] + built[-2:]
ad.decoder_arguments = slowed

from cuepoint.engine.analysis_worker import main
raise SystemExit(main())
`;

const WORKER_ENGINE = `
import sys, threading, time
from pathlib import Path
from cuepoint.services.analysis_worker_client import WorkerComputer

source, decoder, program = sys.argv[1], sys.argv[2], sys.argv[3]
computer = WorkerComputer(command=[sys.executable, "-c", program])
threading.Thread(
    target=lambda: computer.compute(source, Path(decoder), overview=True, detail=False),
    daemon=True,
).start()
deadline = time.monotonic() + 30
while computer.pid is None:
    if time.monotonic() > deadline:
        sys.exit("no worker started")
    time.sleep(0.01)
print(computer.pid, flush=True)
time.sleep(600)
`;

/** The ids of a process's children (POSIX), by `pgrep -P`. */
function childrenOf(pid: number): number[] {
  const found = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" });
  return (found.stdout ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
}

let workdir: string | null = null;
let workerPid: number | null = null;
let mpvPids: number[] = [];
let engine: ChildProcess | null = null;
let decoderPid: number | null = null;

afterEach(() => {
  if (engine && engine.exitCode === null) engine.kill("SIGKILL");
  if (decoderPid !== null && alive(decoderPid)) {
    try {
      process.kill(decoderPid, "SIGKILL");
    } catch {
      // Gone between the look and the kill.
    }
  }
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  for (const pid of [workerPid, ...mpvPids]) {
    if (pid !== null && alive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Gone between the look and the kill.
      }
    }
  }
  workdir = null;
  engine = null;
  decoderPid = null;
  workerPid = null;
  mpvPids = [];
});

describeWithDecoder("the waveform decoders end with the engine (WAVE-03)", () => {
  it("leaves no decoder running once the app stops the engine", async () => {
    workdir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-decoders-"));
    const long = path.join(workdir, "ten minutes of silence.wav");
    silentWav(long, 600);

    const started = spawn(python!, ["-c", ENGINE, long, mpv!], {
      env: { ...process.env, PYTHONPATH: SRC, CUEPOINT_HOME: workdir },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    engine = started;
    let errors = "";
    started.stderr!.on("data", (chunk: Buffer) => (errors += chunk.toString()));
    const pid = await new Promise<number>((resolve, reject) => {
      let out = "";
      started.stdout!.on("data", (chunk: Buffer) => {
        out += chunk.toString();
        const line = out.split(/\r?\n/)[0];
        if (out.includes("\n") && line) resolve(Number(line));
      });
      started.once("exit", (code) => reject(new Error(`engine exited ${code}: ${errors}`)));
    });
    decoderPid = pid;
    expect(alive(pid)).toBe(true);

    // Still decoding a second in: the decode does not end on its own in time.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(alive(pid)).toBe(true);

    stopProcessTree(started);

    await waitFor(() => started.exitCode !== null || started.signalCode !== null, "the engine");
    // The decoder ends at its next write into the closed pipe. Slowed, it
    // writes seldom: seconds apart here, longer on a slow Intel Mac runner,
    // yet far inside the minute and more it would otherwise decode for.
    await waitFor(() => !alive(pid), "the decoder to end with the engine", 30_000);
  }, 90_000);

  it("leaves no analysis worker, nor a decoder under it, once the app stops the engine", async () => {
    workdir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-worker-"));
    const long = path.join(workdir, "ten minutes of silence.wav");
    silentWav(long, 600);

    const started = spawn(python!, ["-c", WORKER_ENGINE, long, mpv!, WORKER], {
      env: { ...process.env, PYTHONPATH: SRC, CUEPOINT_HOME: workdir },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    engine = started;
    let errors = "";
    started.stderr!.on("data", (chunk: Buffer) => (errors += chunk.toString()));
    const pid = await new Promise<number>((resolve, reject) => {
      let out = "";
      started.stdout!.on("data", (chunk: Buffer) => {
        out += chunk.toString();
        const line = out.split(/\r?\n/)[0];
        if (out.includes("\n") && line) resolve(Number(line));
      });
      started.once("exit", (code) => reject(new Error(`engine exited ${code}: ${errors}`)));
    });
    workerPid = pid;
    expect(alive(pid)).toBe(true);

    if (process.platform !== "win32") {
      // The worker's decoder, taken before the stop: pgrep cannot find it after.
      await waitFor(() => childrenOf(pid).length > 0, "the worker to start a decoder", 30_000);
      mpvPids = childrenOf(pid);
    }
    // Slowed, the decode runs for over a minute: only the stop can end it in time.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(alive(pid)).toBe(true);

    stopProcessTree(started);

    await waitFor(() => started.exitCode !== null || started.signalCode !== null, "the engine");
    // The worker reads end-of-file on its pipe, ends its decoders and exits.
    await waitFor(() => !alive(pid), "the worker to end with the engine", 30_000);
    for (const decoder of mpvPids) {
      await waitFor(() => !alive(decoder), "the worker's decoder to end with it", 30_000);
    }
  }, 90_000);
});
