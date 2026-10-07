import { describe, expect, it } from "vitest";

import { IncidentTracker, OUTPUT_LINE_CHARS, OUTPUT_TAIL_LINES, capLine, outputText, type ProcessIncident, type ProcessReporter } from "./processWatch";

/** The rules for what a supervisor says (REPORT-05); the supervisors' own tests drive them for real. */

function recorded() {
  const incidents: ProcessIncident[] = [];
  const crumbs: string[] = [];
  const reporter: ProcessReporter = {
    breadcrumb: (_category, message) => crumbs.push(message),
    incident: (incident) => incidents.push(incident),
  };
  return { incidents, crumbs, tracker: new IncidentTracker("engine", reporter) };
}

const exit = (code: number | null, uptimeMs: number | null = 100) => ({ code, signal: null, uptimeMs });

describe("an incident", () => {
  it("opens on an exit, collects exits and restarts, and ends with one event when recovered", () => {
    const { incidents, crumbs, tracker } = recorded();
    tracker.exited(exit(3));
    tracker.restarting(1, 1000);
    tracker.exited(exit(4, 50));
    tracker.restarting(2, 2000);
    expect(incidents).toEqual([]);
    expect(tracker.isOpen).toBe(true);

    tracker.recovered({ stderr: ["boom"] });

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.data).toEqual({ exit_code: 4, signal: null, restarts: 2, uptime_ms: 50, exits: 2 });
    expect(crumbs).toEqual([
      "engine exited unexpectedly",
      "engine restarting",
      "engine exited unexpectedly",
      "engine restarting",
    ]);
    expect(tracker.isOpen).toBe(false);
  });

  it("is over once it is reported: a healthy engine later says nothing, and a new exit is a new incident", () => {
    const { incidents, tracker } = recorded();
    tracker.exited(exit(1));
    tracker.recovered({});
    tracker.recovered({});
    expect(incidents).toHaveLength(1);

    tracker.exited(exit(2));
    tracker.gaveUp("no more", {});
    expect(incidents).toHaveLength(2);
    expect(incidents[1]!.outcome).toBe("gave-up");
    expect(incidents[1]!.data.reason).toBe("no more");
  });

  it("a launch that failed is reported once per key, and not at all inside an open incident", () => {
    const { incidents, tracker } = recorded();
    tracker.startFailed("health", "did not answer", "slow", {});
    tracker.startFailed("health", "did not answer", "slow", {});
    tracker.startFailed("missing", "not found", "gone", {});
    expect(incidents.map((i) => i.message)).toEqual(["did not answer", "not found"]);

    tracker.exited(exit(1));
    tracker.startFailed("spawn", "could not start", "x", {});
    expect(incidents).toHaveLength(2);
  });

  it("a give-up with no incident open sends nothing, so a second loop cannot report a second time", () => {
    const { incidents, tracker } = recorded();
    tracker.exited(exit(1));
    tracker.gaveUp("first", {});
    tracker.gaveUp("second", {});
    tracker.gaveUp("third", {});
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.data.reason).toBe("first");
  });

  it("an incident abandoned at quit is dropped, unsent", () => {
    const { incidents, tracker } = recorded();
    tracker.exited(exit(1));
    tracker.abandon();
    tracker.recovered({});
    tracker.gaveUp("x", {});
    expect(incidents).toEqual([]);
    expect(tracker.isOpen).toBe(false);
  });

  it("a reporter that throws never reaches the supervisor", () => {
    const tracker = new IncidentTracker("player", {
      breadcrumb: () => {
        throw new Error("sdk");
      },
      incident: () => {
        throw new Error("sdk");
      },
    });
    expect(() => {
      tracker.exited(exit(1));
      tracker.restarting(1, 1);
      tracker.exited(exit(1));
      tracker.gaveUp("x", {});
    }).not.toThrow();
  });

  it("without a reporter does nothing", () => {
    const tracker = new IncidentTracker("player", undefined);
    expect(() => {
      tracker.exited(exit(1));
      tracker.recovered({});
    }).not.toThrow();
  });

  it("names the attachment for the process", () => {
    const { incidents, tracker } = recorded();
    tracker.exited(exit(1));
    tracker.gaveUp("x", { stdout: ["a"] });
    expect(incidents[0]!.attachment?.filename).toBe("engine-output.txt");
    const player: ProcessIncident[] = [];
    const other = new IncidentTracker("player", { breadcrumb: () => undefined, incident: (i) => player.push(i) });
    other.exited(exit(1));
    other.gaveUp("x", {});
    expect(player[0]!.attachment?.filename).toBe("player-output.txt");
  });
});

describe("the tail as text", () => {
  it("puts each stream under its heading and keeps the last lines", () => {
    const lines = Array.from({ length: OUTPUT_TAIL_LINES + 5 }, (_, i) => `line ${i}`);
    const text = outputText({ stdout: lines, stderr: [] });
    expect(text.split("\n")[0]).toBe(`== stdout (last ${OUTPUT_TAIL_LINES} lines) ==`);
    expect(text).not.toContain("line 0\n");
    expect(text).toContain(`line ${OUTPUT_TAIL_LINES + 4}`);
    expect(text).toContain("== stderr (last 0 lines) ==\n(nothing)");
  });

  it("leaves out a stream the process does not have", () => {
    expect(outputText({ stderr: ["x"] })).toBe("== stderr (last 1 lines) ==\nx");
  });
});

describe("a kept line", () => {
  it("is cut at the cap with a marker, and a shorter one is left alone", () => {
    expect(capLine("short")).toBe("short");
    const capped = capLine("y".repeat(OUTPUT_LINE_CHARS * 3));
    expect(capped.length).toBeLessThan(OUTPUT_LINE_CHARS + 20);
    expect(capped.endsWith("...[truncated]")).toBe(true);
  });
});
