import { describe, expect, it } from "vitest";

import { descendants, footprint, parsePs, parseWindows } from "./processMemory";

const PS = `
    1     0   1000 /sbin/launchd
  100     1  95000 /Applications/CuePoint.app/Contents/MacOS/CuePoint
  101   100  60000 /Applications/CuePoint.app/Contents/Frameworks/CuePoint Helper (Renderer).app/Contents/MacOS/CuePoint Helper (Renderer)
  102   100  30000 /Applications/CuePoint.app/Contents/Frameworks/CuePoint Helper (GPU).app/Contents/MacOS/CuePoint Helper (GPU)
  200   100 400000 cuepoint-engine
  201   200 150000 cuepoint-engine
  202   100  20000 mpv
  999     1  50000 /usr/bin/python3
`;

describe("the process table", () => {
  it("reads ps output, paths with spaces included", () => {
    const table = parsePs(PS);
    expect(table).toHaveLength(8);
    expect(table.find((row) => row.pid === 101)).toEqual({
      pid: 101,
      ppid: 100,
      rssKb: 60000,
      name: "CuePoint Helper (Renderer)",
    });
  });

  it("reads PowerShell's JSON, one process or many, working set in bytes", () => {
    const one = parseWindows('{"ProcessId":4,"ParentProcessId":0,"Name":"System","WorkingSetSize":8192}');
    expect(one).toEqual([{ pid: 4, ppid: 0, name: "System", rssKb: 8 }]);
    const many = parseWindows(
      '[{"ProcessId":10,"ParentProcessId":1,"Name":"mpv.exe","WorkingSetSize":10485760},' +
        '{"ProcessId":11,"ParentProcessId":10,"Name":"cuepoint-engine.exe","WorkingSetSize":1048576}]',
    );
    expect(many.map((row) => [row.name, row.rssKb])).toEqual([
      ["mpv", 10240],
      ["cuepoint-engine", 1024],
    ]);
  });

  it("finds a process's descendants and nothing else", () => {
    const table = parsePs(PS);
    expect(descendants(table, 100).map((row) => row.pid).sort()).toEqual([101, 102, 200, 201, 202]);
    expect(descendants(table, 202)).toEqual([]);
  });

  it("adds up main, the renderers, both engine processes of a one-file build, and mpv", () => {
    const result = footprint(parsePs(PS), 100, [101]);
    expect(result.mainMb).toBeCloseTo(92.8, 1);
    expect(result.rendererMb).toBeCloseTo(58.6, 1);
    // The bootloader and the process it unpacks into.
    expect(result.engineMb).toBeCloseTo(537.1, 1);
    expect(result.mpvMb).toBeCloseTo(19.5, 1);
  });

  it("counts a python that is not the app's child as nothing, and no player as null", () => {
    const table = parsePs(PS).filter((row) => row.name !== "mpv");
    const result = footprint(table, 100, [101]);
    expect(result.mpvMb).toBeNull();
    // Process 999 is a python beside the app, not below it.
    expect(result.engineMb).toBeCloseTo(537.1, 1);
  });
});
