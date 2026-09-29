/**
 * The lanes' geometry (PREP-11, DEC-111), over the engine's own shape.
 *
 * Shape is seven entries: 124/8A, 124/8A (the same key), 63/9A (half time, one
 * step), a track with no BPM and no key, 124/8A, 124.5/8B (the relative key)
 * and 145/3B (a clash), with a second chapter from the fifth entry. Every value
 * is the engine's, so a lane cannot disagree with a warning.
 */
import { describe, expect, it } from "vitest";

import type { SetShape } from "../../api/cuepointBridge.types";
import {
  KEY_ROWS,
  LANE_GAP,
  MAX_COLUMN,
  MIN_COLUMN,
  TEMPO_ROWS,
  columnLabel,
  columnWidth,
  join,
  keyRow,
  laneLayout,
  linkWords,
  rangeText,
  type Rect,
} from "./prepareLanes";
import { SHAPE } from "./prepareSource.testFixture";

const shape = SHAPE.analysis.shape;
const ids = shape.entries.map((entry) => entry.entry_id);
const titles = new Map(SHAPE.entries.entries.map((entry) => [entry.entry_id, entry.track.title]));

function whole(rects: readonly Rect[]) {
  return rects.every((rect) =>
    [rect.x, rect.y, rect.width, rect.height].every((value) => Number.isInteger(value)),
  );
}

describe("the columns", () => {
  it("are one per entry, in the Set's order", () => {
    const layout = laneLayout(shape, titles, 700, 1);
    expect(layout.columns.map((column) => column.entryId)).toEqual(ids);
    expect(layout.columns.map((column) => column.x)).toEqual(ids.map((_, i) => i * layout.columnWidth));
    expect(layout.width).toBe(ids.length * layout.columnWidth);
  });

  it("share the width, never narrower than a mark or wider than the cap", () => {
    expect(columnWidth(7, 700, 1)).toBe(MAX_COLUMN);
    expect(columnWidth(100, 700, 1)).toBe(7);
    expect(columnWidth(1000, 700, 1)).toBe(MIN_COLUMN);
    expect(columnWidth(1000, 700, 2)).toBe(MIN_COLUMN * 2);
    expect(columnWidth(0, 700, 2)).toBe(MAX_COLUMN * 2);
  });

  it("say what each draws in their titles", () => {
    const layout = laneLayout(shape, titles, 700, 1);
    expect(layout.columns[2].label).toBe("3 · Half Time · 63 BPM · 9A");
    expect(layout.columns[3].label).toBe("4 · No Tempo · no BPM · no key");
    expect(columnLabel(0, "X", 124, "Am", { number: 8, letter: "A" })).toBe("1 · X · 124 BPM · 8A (Am)");
  });
});

describe("the tempo lane", () => {
  const layout = laneLayout(shape, titles, 700, 1);

  it("spans the BPMs drawn", () => {
    expect(layout.tempo.range).toEqual({ min: 63, max: 145 });
    expect(rangeText(layout.tempo.range)).toBe("63–145");
    expect(rangeText(null)).toBe("No BPMs");
    expect(rangeText({ min: 124, max: 124 })).toBe("124 BPM");
  });

  it("draws a mark per known BPM, higher for faster, and a gap for none (DEC-111)", () => {
    expect(layout.tempo.marks).toHaveLength(6);
    const at = (index: number) => layout.tempo.marks.find((mark) => Math.floor(mark.x / layout.columnWidth) === index);
    expect(at(3)).toBeUndefined();
    expect(at(6)!.y).toBe(0);
    expect(at(2)!.y).toBe(TEMPO_ROWS - 1);
    expect(at(0)!.y).toBeGreaterThan(at(6)!.y);
    expect(at(0)!.y).toBeLessThan(at(2)!.y);
  });

  it("draws half time as the step it is, and nothing into or out of a gap", () => {
    const boundary = (index: number) =>
      layout.tempo.steps.filter(
        (rect) => rect.x >= index * layout.columnWidth - 1 && rect.x <= index * layout.columnWidth,
      );
    const half = boundary(2);
    const run = half.find((rect) => rect.height > 1)!;
    expect(run.height).toBeGreaterThan(TEMPO_ROWS / 2);
    expect(boundary(3)).toEqual([]);
    expect(boundary(4)).toEqual([]);
  });

  it("puts a level transition on one row", () => {
    const level = layout.tempo.steps.filter((rect) => rect.x === layout.columnWidth - 1);
    expect(level).toEqual([{ x: layout.columnWidth - 1, y: layout.tempo.marks[0].y, width: 2, height: 1 }]);
  });
});

describe("the key lane", () => {
  const layout = laneLayout(shape, titles, 700, 1);

  it("places each key on the wheel's rows, B above A", () => {
    expect(keyRow(1, "A")).toBe(0);
    expect(keyRow(8, "A")).toBe(14);
    expect(keyRow(8, "B")).toBe(15);
    expect(keyRow(12, "B")).toBe(KEY_ROWS - 1);
    const y = (code: string) => layout.key.marks.find((mark) => mark.code === code)!.y;
    expect(y("8B")).toBe(y("8A") - 1);
    expect(y("9A")).toBe(y("8A") - 2);
    expect(y("8A")).toBe(layout.keyTop + KEY_ROWS - 1 - 14);
  });

  it("leaves a gap for an unknown key, with no line into or out of it", () => {
    expect(layout.key.marks.map((mark) => mark.entryId)).not.toContain(ids[3]);
    expect(layout.key.links.map((link) => link.toEntryId)).not.toContain(ids[3]);
    expect(layout.key.links.map((link) => link.toEntryId)).not.toContain(ids[4]);
  });

  it("draws each line in the style of the engine's relation", () => {
    const styles = Object.fromEntries(layout.key.links.map((link) => [link.toEntryId, link.style]));
    expect(styles).toEqual({ [ids[1]]: "same", [ids[2]]: "adjacent", [ids[5]]: "relative", [ids[6]]: "clash" });
    expect(linkWords("clash")).toBe("Keys clash");
    expect(linkWords("relative")).toBe("Relative key");
  });

  it("draws a solid line whole, a dashed one broken, and a clash dotted", () => {
    const into = (id: number) => layout.key.links.find((link) => link.toEntryId === id)!.rects;
    const onBoundary = (rects: Rect[]) => rects.filter((rect) => rect.x % layout.columnWidth === 0);
    // One step: a single run along the boundary, and the bridge into the mark.
    const solid = onBoundary(into(ids[2]));
    expect(solid.filter((rect) => rect.height > 1)).toHaveLength(1);
    // 8A to 3B is ten rows: dotted, one on and one off, never a run.
    const clash = onBoundary(into(ids[6]));
    expect(clash.length).toBeGreaterThan(4);
    expect(clash.every((rect) => rect.height === 1)).toBe(true);
    // Dashed: two on, one off, the last dash cut at the run's end, then the
    // bridge into the next mark.
    const dashed = join(10, 0, 9, 1, 1, "relative").filter((rect) => rect.x === 10);
    expect(dashed.map((rect) => [rect.y, rect.height])).toEqual([
      [0, 2],
      [3, 2],
      [6, 2],
      [9, 1],
      [9, 1],
    ]);
  });

  it("joins the same key along its row", () => {
    const same = layout.key.links.find((link) => link.toEntryId === ids[1])!.rects;
    expect(same).toEqual([{ x: layout.columnWidth - 1, y: layout.key.marks[0].y, width: 2, height: 1 }]);
  });
});

describe("the drawing", () => {
  it("marks where the second chapter starts", () => {
    const layout = laneLayout(shape, titles, 700, 1);
    expect(layout.boundaries).toEqual([
      { x: 4 * layout.columnWidth, y: 0, width: 1, height: layout.height, chapterId: shape.entries[4].chapter_id },
    ]);
  });

  it("stacks the key lane under the tempo lane", () => {
    const layout = laneLayout(shape, titles, 700, 2);
    expect(layout.tempoHeight).toBe(TEMPO_ROWS * 2);
    expect(layout.keyTop).toBe(layout.tempoHeight + LANE_GAP * 2);
    expect(layout.height).toBe(layout.keyTop + KEY_ROWS * 2);
  });

  it("is whole pixels at every scale and width", () => {
    for (const scale of [1, 2, 3]) {
      for (const width of [0, 13, 333, 700, 1999]) {
        const layout = laneLayout(shape, titles, width, scale);
        const rects = [
          ...layout.tempo.marks,
          ...layout.tempo.steps,
          ...layout.key.marks,
          ...layout.key.links.flatMap((link) => link.rects),
          ...layout.boundaries,
        ];
        expect(whole(rects)).toBe(true);
        expect(rects.every((rect) => rect.x >= -scale && rect.x + rect.width <= layout.width + scale)).toBe(true);
      }
    }
  });

  it("draws a Set of one tempo at mid height, and a Set with no values as nothing", () => {
    const flat: SetShape = {
      entries: [
        { entry_id: 1, chapter_id: 1, bpm: 124, key: "8A", camelot: { number: 8, letter: "A" } },
        { entry_id: 2, chapter_id: 1, bpm: 124, key: "8A", camelot: { number: 8, letter: "A" } },
      ],
      transitions: [{ from_entry_id: 1, to_entry_id: 2, key_relation: "same" }],
    };
    const layout = laneLayout(flat, new Map(), 100, 1);
    expect(layout.tempo.marks.every((mark) => mark.y === Math.floor((TEMPO_ROWS - 1) / 2))).toBe(true);
    const empty = laneLayout(
      { entries: [{ entry_id: 1, chapter_id: 1, bpm: null, key: null, camelot: null }], transitions: [] },
      new Map(),
      100,
      1,
    );
    expect(empty.tempo.marks).toEqual([]);
    expect(empty.key.marks).toEqual([]);
    expect(empty.tempo.range).toBeNull();
  });
});
