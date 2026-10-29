import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  RECOVERY_RELOAD_CHANNEL,
  RECOVERY_REPORT_CHANNEL,
  RECOVERY_WINDOW_MS,
  WINDOW_REOPENED_MESSAGE,
  createRendererRecovery,
  resolveRecoveryPaths,
} from "./rendererRecovery";

/**
 * A window that stopped (HARDEN-05): one stop reloads it, two within a minute load the recovery
 * page, a clean exit does neither, and the recovery page's preload exposes only its two calls.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => fs.readFileSync(path.join(here, name), "utf8");

function rig(options: { quitting?: boolean } = {}) {
  let clock = 1_000_000;
  const calls: string[] = [];
  const recovery = createRendererRecovery({
    now: () => clock,
    isQuitting: () => options.quitting === true,
    reload: () => calls.push("reload"),
    showRecoveryPage: () => calls.push("recovery.html"),
  });
  return { recovery, calls, advance: (ms: number) => (clock += ms) };
}

describe("a stopped window", () => {
  it("is reloaded once on a crash", () => {
    const { recovery, calls } = rig();
    expect(recovery.handle({ reason: "crashed" })).toBe("reloaded");
    expect(calls).toEqual(["reload"]);
  });

  it("loads recovery.html when it stops twice within 60 seconds", () => {
    const { recovery, calls, advance } = rig();
    recovery.handle({ reason: "crashed" });
    advance(RECOVERY_WINDOW_MS - 1);
    expect(recovery.handle({ reason: "oom" })).toBe("recovery-page");
    expect(calls).toEqual(["reload", "recovery.html"]);
  });

  it("reloads again when the second stop comes a minute or more later", () => {
    const { recovery, calls, advance } = rig();
    recovery.handle({ reason: "crashed" });
    advance(RECOVERY_WINDOW_MS);
    expect(recovery.handle({ reason: "crashed" })).toBe("reloaded");
    expect(calls).toEqual(["reload", "reload"]);
  });

  it("counts afresh after the recovery page: Reload does not carry the old stops", () => {
    const { recovery, calls, advance } = rig();
    recovery.handle({ reason: "crashed" });
    advance(1000);
    recovery.handle({ reason: "crashed" });
    advance(1000);
    expect(recovery.handle({ reason: "crashed" })).toBe("reloaded");
    expect(calls).toEqual(["reload", "recovery.html", "reload"]);
  });

  it("does nothing for a clean exit", () => {
    const { recovery, calls } = rig();
    expect(recovery.handle({ reason: "clean-exit" })).toBe("ignored");
    expect(calls).toEqual([]);
  });

  it("a clean exit is not a stop: it neither reloads nor counts toward the two", () => {
    const { recovery, calls, advance } = rig();
    recovery.handle({ reason: "crashed" });
    advance(1000);
    recovery.handle({ reason: "clean-exit" });
    expect(calls).toEqual(["reload"]);
    advance(1000);
    expect(recovery.handle({ reason: "crashed" })).toBe("recovery-page");
  });

  it("does nothing while the app is quitting", () => {
    const { recovery, calls } = rig({ quitting: true });
    expect(recovery.handle({ reason: "killed" })).toBe("ignored");
    expect(calls).toEqual([]);
  });

  it("says what the page will show, word for word", () => {
    expect(WINDOW_REOPENED_MESSAGE).toBe("CuePoint's window stopped and was reopened.");
  });
});

describe("the recovery page and its preload", () => {
  /** Run the preload as Electron would, with a recording `electron` module. */
  function runPreload() {
    const exposed: Record<string, Record<string, () => unknown>> = {};
    const invoked: string[] = [];
    const sent: string[] = [];
    const electron = {
      contextBridge: {
        exposeInMainWorld: (key: string, api: Record<string, () => unknown>) => {
          exposed[key] = api;
        },
      },
      ipcRenderer: {
        invoke: (channel: string, ...args: unknown[]) => {
          invoked.push(`${channel}(${args.length})`);
          return Promise.resolve(true);
        },
        send: (channel: string) => sent.push(channel),
        on: () => sent.push("on"),
      },
    };
    const requires: string[] = [];
    vm.runInNewContext(read("recoveryPreload.cjs"), {
      require: (name: string) => {
        requires.push(name);
        return electron;
      },
    });
    return { exposed, invoked, sent, requires };
  }

  it("exposes exactly two calls, reload and report, and nothing else", () => {
    const { exposed, requires, sent } = runPreload();
    expect(requires).toEqual(["electron"]);
    expect(Object.keys(exposed)).toEqual(["cuepointRecovery"]);
    expect(Object.keys(exposed.cuepointRecovery).sort()).toEqual(["reload", "report"]);
    expect(sent).toEqual([]); // listens for nothing, sends nothing of its own
  });

  it("runs each call in main on its own channel, with no argument from the page", () => {
    const { exposed, invoked } = runPreload();
    exposed.cuepointRecovery.reload();
    exposed.cuepointRecovery.report();
    expect(invoked).toEqual([`${RECOVERY_RELOAD_CHANNEL}(0)`, `${RECOVERY_REPORT_CHANNEL}(0)`]);
  });

  it("is handled by main on those channels, and the page is shown in a window with this preload only", () => {
    const main = read("main.ts");
    expect(main).toContain("RECOVERY_RELOAD_CHANNEL");
    expect(main).toContain("RECOVERY_REPORT_CHANNEL");
    expect(main).toContain("resolveRecoveryPaths(__dirname)");
    expect(main).toMatch(/preload: recoveryPaths\.preload/);
    expect(main).toMatch(/sandbox: true/);
  });

  it("says what the mockup says, word for word, with no script or style from outside", () => {
    const html = read("recovery.html");
    expect(html).toContain("<h1>CuePoint's window stopped twice</h1>");
    expect(html).toContain(
      "<p>It stopped again within a minute of being reopened. Your library is safe. Reload to try once more.</p>",
    );
    expect(html).toMatch(/>Reload<\/button>/);
    expect(html).toMatch(/>Report this problem<\/button>/);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("<style>");
  });

  it("is found beside the bundle, where preload.cjs is", () => {
    const found = resolveRecoveryPaths(path.join(here, "..", "electron-dist"));
    expect(found.page).toBe(path.join(here, "recovery.html"));
    expect(found.preload).toBe(path.join(here, "recoveryPreload.cjs"));
    expect(fs.existsSync(found.page)).toBe(true);
    expect(fs.existsSync(found.preload)).toBe(true);
  });

  it("ships in the package, with the preload next to the bundle", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));
    expect(pkg.build.files).toContain("electron/recovery.html");
    expect(pkg.build.files).toContain("electron/recoveryPreload.cjs");
  });
});
