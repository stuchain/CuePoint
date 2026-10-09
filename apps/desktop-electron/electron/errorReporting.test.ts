import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorReportingChoice } from "./errorReporting";
import { MAIN_SETTINGS_FILE, MainSettingsStore } from "./mainSettings";

/**
 * The error-reporting choice (REPORT-01, DEC-128).
 *
 * The file is written before the engine is told, and an engine that is down
 * never fails the call.
 */

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function settingsFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-reporting-"));
  made.push(dir);
  return path.join(dir, MAIN_SETTINGS_FILE);
}

/** A store that keeps the setting in memory and records each call. */
function recordingStore(calls: string[], stored = true, failWrites = false) {
  let errorReporting = stored;
  return {
    read: () => ({ setListFolder: null, errorReporting, lastCheckedAt: null, lastSeenVersion: null, pendingInstall: null }),
    update: (patch: { errorReporting?: boolean }) => {
      calls.push(`write ${String(patch.errorReporting)}`);
      if (failWrites) throw new Error("disk full");
      errorReporting = patch.errorReporting ?? errorReporting;
      return { setListFolder: null, errorReporting, lastCheckedAt: null, lastSeenVersion: null, pendingInstall: null };
    },
  };
}

describe("setting the choice", () => {
  it("writes the file before it tells the engine", async () => {
    const calls: string[] = [];
    const choice = new ErrorReportingChoice(recordingStore(calls), async (enabled) => {
      calls.push(`engine ${String(enabled)}`);
    });

    await expect(choice.set(false)).resolves.toEqual({ enabled: false });

    expect(calls).toEqual(["write false", "engine false"]);
  });

  it("still writes, and answers, when the engine rejects", async () => {
    const file = settingsFile();
    const choice = new ErrorReportingChoice(new MainSettingsStore(file), async () => {
      throw new Error("engine is not running");
    });

    await expect(choice.set(false)).resolves.toEqual({ enabled: false });

    expect(new MainSettingsStore(file).read().errorReporting).toBe(false);
    expect(choice.enabled()).toBe(false);
  });

  it("rejects when the file cannot be written, and changes nothing", async () => {
    const calls: string[] = [];
    const choice = new ErrorReportingChoice(recordingStore(calls, true, true), async () => {
      calls.push("engine");
    });
    expect(choice.enabled()).toBe(true);

    await expect(choice.set(false)).rejects.toThrow("The setting could not be saved.");

    expect(choice.enabled()).toBe(true);
    expect(calls).toEqual(["write false"]);
  });
});

describe("overlapping changes", () => {
  it("reach the engine in the order they were made, whatever one failing does", async () => {
    const told: boolean[] = [];
    const releases: Array<() => void> = [];
    const choice = new ErrorReportingChoice(new MainSettingsStore(settingsFile()), (enabled) => {
      told.push(enabled);
      return new Promise((resolve, reject) => {
        releases.push(() => (told.length === 1 ? reject(new Error("down")) : resolve(undefined)));
      });
    });

    const first = choice.set(false);
    const second = choice.set(true);
    await Promise.resolve();
    expect(told).toEqual([false]);

    releases[0]!();
    await first;
    await vi.waitFor(() => expect(told).toEqual([false, true]));
    releases[1]!();
    await expect(second).resolves.toEqual({ enabled: true });
  });
});

describe("reading the choice", () => {
  it("is on when there is no file", () => {
    const choice = new ErrorReportingChoice(new MainSettingsStore(settingsFile()), async () => {});
    expect(choice.enabled()).toBe(true);
  });

  it("reflects the file at construction", () => {
    const file = settingsFile();
    new MainSettingsStore(file).update({ errorReporting: false });
    const choice = new ErrorReportingChoice(new MainSettingsStore(file), async () => {});
    expect(choice.enabled()).toBe(false);
  });

  it("reflects the last set", async () => {
    const choice = new ErrorReportingChoice(new MainSettingsStore(settingsFile()), async () => {});
    await choice.set(false);
    expect(choice.enabled()).toBe(false);
    await choice.set(true);
    expect(choice.enabled()).toBe(true);
  });
});
