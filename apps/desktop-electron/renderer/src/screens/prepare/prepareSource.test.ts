/**
 * Where tracks go on the Prepare page, in pure functions (PREP-11, DEC-105).
 *
 * Over the engine's own answers (`prepareSource.fixture.json`): Build is Open
 * (Open One, Open Two, Bridge Deep) then Peak (Peak Loud, Peak Two, 140–150
 * BPM). The insertion point is the gap after the selected entry, or the end;
 * a track put there joins the chapter of the entry before it, which is the
 * chapter Suggestions narrows by.
 */
import { describe, expect, it } from "vitest";

import { WHOLE_LIBRARY } from "../clean/cleanRules";
import { buildSetRows, dropMove, dropPlace, entriesBefore, rowKey } from "./prepareRows";
import {
  SUGGESTION_LIMIT,
  emptyAnswerText,
  gapKey,
  insertLabel,
  insertedLine,
  insertionPoint,
  inSetText,
  keyRelationWords,
  noFitText,
  placeOf,
  pointText,
  pointWords,
  poolName,
  poolOrLibrary,
  poolParams,
  rangeNote,
  roomFor,
  sideButtonLabel,
  sideOnlyText,
  suggestionsRequest,
  unusedNotes,
} from "./prepareSource";
import { BLANK, BUILD, SHAPE, SOURCE_IDS, SUGGESTIONS } from "./prepareSource.testFixture";
import { PLAIN } from "./prepare.testFixture";

const [OPEN_ONE, OPEN_TWO, BRIDGE, PEAK_LOUD, PEAK_TWO] = SOURCE_IDS.build_entries;
const [OPEN, PEAK] = SOURCE_IDS.build_chapters;
const entries = BUILD.entries.entries;

describe("the insertion point", () => {
  it("is the end of the Set, in its last chapter, with nothing selected", () => {
    const point = insertionPoint(BUILD.plan, entries, null);
    expect(point.before?.entry_id).toBe(PEAK_TWO);
    expect(point.after).toBeNull();
    expect(point.chapter?.id).toBe(PEAK);
    expect(point.position).toBe(5);
  });

  it("is the gap after the selected entry, in that entry's chapter", () => {
    const point = insertionPoint(BUILD.plan, entries, OPEN_ONE);
    expect([point.before?.entry_id, point.after?.entry_id]).toEqual([OPEN_ONE, OPEN_TWO]);
    expect(point.chapter?.id).toBe(OPEN);
    expect(placeOf(point)).toEqual({ position: 1, chapter_id: OPEN });
  });

  it("on a chapter boundary joins the chapter before, as the engine places an insert", () => {
    const point = insertionPoint(BUILD.plan, entries, BRIDGE);
    expect([point.before?.entry_id, point.after?.entry_id]).toEqual([BRIDGE, PEAK_LOUD]);
    expect(point.chapter?.id).toBe(OPEN);
    expect(point.position).toBe(3);
  });

  it("is the end after the last entry selected", () => {
    const point = insertionPoint(BUILD.plan, entries, PEAK_TWO);
    expect(point.after).toBeNull();
    expect(point.position).toBe(5);
  });

  it("falls back to the end for an entry that has left the Set", () => {
    expect(insertionPoint(BUILD.plan, entries, 999_999).before?.entry_id).toBe(PEAK_TWO);
  });

  it("is the start of the first chapter in an empty Set", () => {
    const point = insertionPoint(BLANK.plan, BLANK.entries.entries, null);
    expect(point.before).toBeNull();
    expect(point.after).toBeNull();
    expect(point.position).toBe(0);
    expect(point.chapter?.id).toBe(BLANK.plan.chapters[0].id);
  });

  it("names a gap by its two entries and its chapter", () => {
    const one = gapKey(insertionPoint(BUILD.plan, entries, OPEN_ONE));
    expect(one).toBe(`${OPEN_ONE}:${OPEN_TWO}:${OPEN}`);
    expect(gapKey(insertionPoint(BUILD.plan, entries, null))).toBe(`${PEAK_TWO}:-:${PEAK}`);
    expect(gapKey(insertionPoint(BLANK.plan, BLANK.entries.entries, null))).toMatch(/^-:-:/);
  });
});

describe("the point in words", () => {
  it("names both neighbours and the chapter", () => {
    const words = pointWords(insertionPoint(BUILD.plan, entries, OPEN_ONE), BUILD.plan.chapters);
    expect(words).toEqual({ kind: "between", before: "Open One", after: "Open Two", chapter: "Open" });
    expect(pointText(words)).toBe("Between “Open One” and “Open Two”, in Open");
  });

  it("says the end of the Set", () => {
    const words = pointWords(insertionPoint(BUILD.plan, entries, null), BUILD.plan.chapters);
    expect(pointText(words)).toBe("After “Peak Two”, at the end of the Set, in Peak");
  });

  it("names no chapter in a Set that draws no headings (DEC-103)", () => {
    const words = pointWords(insertionPoint(PLAIN.plan, PLAIN.entries.entries, null), PLAIN.plan.chapters);
    expect(words.kind).toBe("end");
    expect(pointText(words)).not.toMatch(/, in /);
  });

  it("names an unnamed chapter by its place where headings are drawn", () => {
    const first = SHAPE.entries.entries[0].entry_id;
    const words = pointWords(insertionPoint(SHAPE.plan, SHAPE.entries.entries, first), SHAPE.plan.chapters);
    expect(pointText(words)).toMatch(/, in Chapter 1$/);
  });

  it("says an empty Set", () => {
    const words = pointWords(insertionPoint(BLANK.plan, [], null), BLANK.plan.chapters);
    expect(pointText(words)).toBe("At the start of the empty Set");
  });
});

describe("the pool", () => {
  it("is the Library's own parameters, on the Set route's names", () => {
    expect(poolParams(WHOLE_LIBRARY)).toEqual({ playlist_id: null, scope: null, collection_id: null });
    expect(poolParams("playlist:2")).toEqual({ playlist_id: 2, scope: null, collection_id: null });
    expect(poolParams("collection:3")).toEqual({ playlist_id: null, scope: "collection", collection_id: 3 });
    expect(poolParams("smart:4")).toEqual({ playlist_id: null, scope: "smart", collection_id: 4 });
  });

  it("falls back to the library for a pool the picker no longer offers", () => {
    const options = [
      { value: WHOLE_LIBRARY, label: "The whole library" },
      { value: "collection:3", label: "  Crate" },
      { value: "folder:1", label: "  Gigs", disabled: true },
    ];
    expect(poolOrLibrary("collection:3", options)).toBe("collection:3");
    expect(poolOrLibrary("collection:9", options)).toBe(WHOLE_LIBRARY);
    expect(poolOrLibrary("folder:1", options)).toBe(WHOLE_LIBRARY);
    expect(poolName("collection:3", options)).toBe("“Crate”");
    expect(poolName(WHOLE_LIBRARY, options)).toBe("your library");
  });
});

describe("what Suggestions asks", () => {
  it("names the gap, its chapter, the side and the pool", () => {
    const point = insertionPoint(BUILD.plan, entries, OPEN_ONE);
    expect(suggestionsRequest(SOURCE_IDS.build, point, "collection:3", null)).toEqual({
      set_id: SOURCE_IDS.build,
      before_entry_id: OPEN_ONE,
      after_entry_id: OPEN_TWO,
      chapter_id: OPEN,
      against: null,
      limit: SUGGESTION_LIMIT,
      playlist_id: null,
      scope: "collection",
      collection_id: 3,
    });
  });

  it("asks for the end with no entry after, and one side when asked", () => {
    const end = suggestionsRequest(SOURCE_IDS.build, insertionPoint(BUILD.plan, entries, null), WHOLE_LIBRARY, null);
    expect(end).toMatchObject({ before_entry_id: PEAK_TWO, after_entry_id: null, chapter_id: PEAK });
    const side = suggestionsRequest(SOURCE_IDS.build, insertionPoint(BUILD.plan, entries, BRIDGE), WHOLE_LIBRARY, "after");
    expect(side).toMatchObject({ before_entry_id: BRIDGE, after_entry_id: PEAK_LOUD, against: "after" });
  });

  it("asks nothing of an empty Set, which has nothing to fit against (DEC-105)", () => {
    expect(suggestionsRequest(SOURCE_IDS.blank, insertionPoint(BLANK.plan, [], null), WHOLE_LIBRARY, null)).toBeNull();
  });
});

describe("what an answer says", () => {
  it("explains a gap nothing bridges from its tempo gap and key relation, never loosening", () => {
    expect(noFitText(SUGGESTIONS.noFit.no_fit!, "Bridge Deep", "Peak Loud")).toBe(
      "Nothing fits between “Bridge Deep” (125 BPM) and “Peak Loud” (145 BPM): they are 16% " +
        "apart, and no tempo is close to both. Keys clash: 8A → 3B.",
    );
    const related = { ...SUGGESTIONS.noFit.no_fit!, key: { from: "8A", to: "9A", relation: "adjacent" as const } };
    expect(noFitText(related, "A", "B")).toMatch(/One step on the wheel: 8A → 9A\.$/);
    expect(noFitText({ ...related, key: null }, "A", "B")).toMatch(/close to both\.$/);
  });

  it("offers each side's own list, and says which one it is showing", () => {
    expect(sideButtonLabel("before", "Bridge Deep")).toBe("Fit after “Bridge Deep”");
    expect(sideButtonLabel("after", "Peak Loud")).toBe("Fit before “Peak Loud”");
    expect(sideOnlyText("before", "Bridge Deep")).toBe("Fitting after “Bridge Deep” only");
    expect(sideOnlyText("after", "Peak Loud")).toBe("Fitting before “Peak Loud” only");
  });

  it("says the chapter's range narrowed the list", () => {
    const peak = BUILD.plan.chapters.find((chapter) => chapter.id === PEAK)!;
    expect(rangeNote(SUGGESTIONS.end, peak)).toBe("Only tracks inside Peak's range, 140–150 BPM.");
    expect(rangeNote(SUGGESTIONS.both, peak)).toBeNull();
    expect(rangeNote({ bpm_range: { chapter_id: PEAK, min: 140, max: null } }, peak)).toMatch(/from 140 BPM/);
    expect(rangeNote({ bpm_range: { chapter_id: PEAK, min: null, max: 150 } }, peak)).toMatch(/up to 150 BPM/);
  });

  it("says an empty list plainly, the range named when it narrowed", () => {
    expect(emptyAnswerText(SUGGESTIONS.both, "your library")).toBe("Nothing in your library fits here.");
    expect(emptyAnswerText(SUGGESTIONS.end, "“Crate”")).toBe(
      "Nothing in “Crate” fits here inside the chapter's range.",
    );
  });

  it("draws a missing BPM or key as a note and the rest in the line's title", () => {
    const found = unusedNotes(
      { sides: ["before", "after"], unused: { before: ["tempo", "label"], after: ["key", "genre", "artist"] } },
      { before: "Open One", after: "Open Two" },
    );
    expect(found.notes).toEqual([
      "“Open One” has no BPM to compare.",
      "“Open Two” has no key to compare.",
    ]);
    expect(found.detail).toEqual([
      "“Open One” has no label to compare.",
      "“Open Two” has no genre or artist to compare.",
    ]);
    // The fixture's tracks carry no label: that is a title, never a line.
    expect(unusedNotes(SUGGESTIONS.both, { before: "A", after: "B" }).notes).toEqual([]);
  });

  it("uses the reasons' and warnings' words for key relations", () => {
    expect(keyRelationWords("same")).toBe("Same key");
    expect(keyRelationWords("adjacent")).toBe("One step on the wheel");
    expect(keyRelationWords("relative")).toBe("Relative key");
    expect(keyRelationWords(null)).toBe("Keys clash");
  });

  it("marks a track already in the Set with how often", () => {
    expect(inSetText(0)).toBeNull();
    expect(inSetText(1)).toBe("Already in this Set once: inserting it plays it again");
    expect(inSetText(2)).toMatch(/twice/);
    expect(inSetText(3)).toMatch(/3 times/);
  });
});

describe("inserting", () => {
  it("fits a gesture whole or refuses it before anything is written", () => {
    expect(roomFor(3, 997, 1000)).toBeNull();
    expect(roomFor(4, 997, 1000)).toBe(
      "A Set holds at most 1,000 entries. This one has 997, so 4 more will not fit.",
    );
  });

  it("names the button for what is selected", () => {
    expect(insertLabel(0)).toBe("Insert here");
    expect(insertLabel(1)).toBe("Insert here");
    expect(insertLabel(1200)).toBe("Insert 1,200 here");
  });

  it("says what went in", () => {
    expect(insertedLine(["Deep Spare"], "Build")).toBe("Inserted “Deep Spare” into “Build”.");
    expect(insertedLine([null], "Build")).toBe("Inserted 1 track into “Build”.");
    expect(insertedLine(["A", "B"], "Build")).toBe("Inserted 2 tracks into “Build”.");
  });
});

describe("where a drop lands (PREP-11 on PREP-10's rows)", () => {
  const rows = buildSetRows(BUILD.plan, BUILD.entries, BUILD.analysis);
  const at = (key: number) => rows.findIndex((row) => rowKey(row) === key);

  it("counts the entries before a row", () => {
    expect(entriesBefore(rows, 0)).toBe(0);
    expect(entriesBefore(rows, at(PEAK_LOUD))).toBe(3);
  });

  it("puts tracks at a chapter's start when dropped on its heading", () => {
    const heading = at(-PEAK);
    expect(dropPlace(rows, heading, heading)).toEqual({ position: 3, chapter_id: PEAK });
    expect(dropPlace(rows, heading + 1, heading)).toEqual({ position: 3, chapter_id: PEAK });
  });

  it("puts tracks before or after an entry, in that entry's chapter", () => {
    const bridge = at(BRIDGE);
    expect(dropPlace(rows, bridge, bridge)).toEqual({ position: 2, chapter_id: OPEN });
    // Below Bridge Deep is the end of Open, not the start of Peak.
    expect(dropPlace(rows, bridge + 1, bridge)).toEqual({ position: 3, chapter_id: OPEN });
    expect(dropPlace(rows, at(PEAK_TWO) + 1, at(PEAK_TWO))).toEqual({ position: 5, chapter_id: PEAK });
  });

  it("is the same place a moved entry goes, counted without it", () => {
    const moving = entries.find((entry) => entry.entry_id === OPEN_ONE)!;
    const bridge = at(BRIDGE);
    // Dropped below Bridge Deep: the place is 3, and the entry leaving 0 makes it 2.
    expect(dropPlace(rows, bridge + 1, bridge)?.position).toBe(3);
    expect(dropMove(rows, moving, bridge + 1, bridge)).toEqual({ entry_id: OPEN_ONE, position: 2, chapter_id: OPEN });
    expect(dropPlace(rows, 99, 99)).toBeNull();
  });
});
