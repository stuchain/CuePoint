/**
 * The Prepare page's rules, over the engine's own answers (PREP-10).
 *
 * `prepare.fixture.json` holds Friday (six entries, track 1 twice, three named
 * chapters), Plain (one unnamed chapter) and the answers to each edit. These
 * tests hold the pure parts: the rows and their headings, what a drop and a
 * chapter change ask of the engine, the page's words, its menus, its dialog's
 * reading of a form, where `/prepare` goes, and the divider's width.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { CollectionNode, LibraryPlaylistNode, SetWarning } from "../../api/cuepointBridge.types";
import { buildCollectionTree } from "../library/collectionTree";
import { CHAPTER_NAME_MAX_LENGTH, chapterUpdate, readBpm } from "./chapterForm";
import { newSetSources, sourceKey } from "./newSetSources";
import { FRIDAY, IDS, PLAIN, TREE } from "./prepare.testFixture";
import {
  bpmRangeText,
  chapterTimeText,
  deletionLine,
  headerFacts,
  runningTimeLine,
  shortWarning,
  summarizeWarnings,
  timeCell,
  warningCountLine,
} from "./prepareFormat";
import { SOURCE_DEFAULT_WIDTH, SOURCE_MIN_WIDTH, clampSourceWidth, loadSourceWidth, saveSourceWidth } from "./prepareLayoutState";
import {
  LAST_SET_STORAGE_KEY,
  forgetLastSetId,
  loadLastSetId,
  preparePath,
  saveLastSetId,
  setIdFromRoute,
  setToOpen,
} from "./prepareLink";
import { entryMenuItems, headingMenuItems } from "./prepareMenus";
import {
  buildSetRows,
  canSplitAt,
  chapterMove,
  chapterName,
  dropMove,
  entriesOf,
  repeatAfter,
  rowKey,
  showsHeadings,
  type EntryRow,
  type PrepareRow,
} from "./prepareRows";

const [E1, E2, E3, E4, E6, E5] = IDS.friday_entries;
const rows = buildSetRows(FRIDAY.plan, FRIDAY.entries, FRIDAY.analysis);
const plainRows = buildSetRows(PLAIN.plan, PLAIN.entries, PLAIN.analysis);

function describeRow(row: PrepareRow): string {
  return row.kind === "heading" ? `# ${chapterName(row.chapter)}` : `${row.entry.entry_id}`;
}

function entry(id: number) {
  const found = FRIDAY.entries.entries.find((candidate) => candidate.entry_id === id);
  if (!found) throw new Error(`no entry ${id}`);
  return found;
}

function entryRow(id: number): EntryRow {
  return rows.find((row): row is EntryRow => row.kind === "entry" && row.entry.entry_id === id)!;
}

afterEach(() => localStorage.clear());

describe("the rows", () => {
  it("draws a heading above each chapter's entries, in the Set's order", () => {
    expect(rows.map(describeRow)).toEqual([
      "# Warm-up",
      `${E1}`,
      `${E2}`,
      "# Peak",
      `${E3}`,
      `${E4}`,
      "# Close",
      `${E6}`,
      `${E5}`,
    ]);
  });

  it("draws no heading for one unnamed chapter (DEC-103)", () => {
    expect(showsHeadings(PLAIN.plan.chapters)).toBe(false);
    expect(plainRows.every((row) => row.kind === "entry")).toBe(true);
    expect(plainRows).toHaveLength(2);
  });

  it("draws a heading for one chapter once it is named", () => {
    expect(showsHeadings([{ ...PLAIN.plan.chapters[0], name: "Opening" }])).toBe(true);
  });

  it("calls an unnamed chapter by its place, as the engine's messages do", () => {
    expect(chapterName({ name: "", position: 1 })).toBe("Chapter 2");
    expect(chapterName({ name: "Peak", position: 1 })).toBe("Peak");
  });

  it("keeps the running order, with its repeat, for playing", () => {
    const tracks = entriesOf(rows).map((found) => found.track.title);
    expect(tracks).toEqual(["Warm One", "Warm Two", "Peak One", "Peak Two", "Warm One", "Close"]);
  });

  it("puts each transition's warnings on the entry it leads into", () => {
    expect(entryRow(E4).transition.map((warning) => warning.kind)).toEqual(["tempo_jump", "key_clash"]);
    expect(entryRow(E3).transition).toEqual([]);
    const second = plainRows[1] as EntryRow;
    expect(second.transition.map((warning) => warning.kind).sort()).toEqual(["tempo_unknown"]);
  });

  it("gives each repeat its notice, and each heading its chapter's warnings", () => {
    expect(entryRow(E1).notices).toHaveLength(1);
    expect(entryRow(E6).notices[0].compared.others).toEqual([0]);
    const warmUp = rows[0];
    expect(warmUp.kind === "heading" && warmUp.warnings.map((warning) => warning.kind)).toEqual([
      "over_target",
      "bpm_outside_range",
    ]);
  });

  it("keys headings apart from entries", () => {
    const keys = rows.map(rowKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rowKey(rows[0])).toBeLessThan(0);
  });

  it("keeps an entry whose chapter the plan does not know, at the end", () => {
    const stray = { ...FRIDAY.entries.entries[0], chapter_id: 999 };
    const drawn = buildSetRows(FRIDAY.plan, { ...FRIDAY.entries, entries: [stray] }, null);
    expect(drawn.map(describeRow)).toEqual(["# Warm-up", "# Peak", "# Close", `${E1}`]);
  });
});

describe("a drop", () => {
  it("on a heading puts the entry at that chapter's start", () => {
    // From the end of the Set up to Peak: its place counted as it will be.
    expect(dropMove(rows, entry(E5), 3, 3)).toEqual({ entry_id: E5, position: 2, chapter_id: 2 });
    // Either half of the heading means the same.
    expect(dropMove(rows, entry(E5), 4, 3)).toEqual({ entry_id: E5, position: 2, chapter_id: 2 });
  });

  it("down the list lands one place earlier than the gap, counted without the entry", () => {
    expect(dropMove(rows, entry(E1), 3, 3)).toEqual({ entry_id: E1, position: 1, chapter_id: 2 });
    expect(dropMove(rows, entry(E1), 9, 8)).toEqual({ entry_id: E1, position: 5, chapter_id: 3 });
  });

  it("after a chapter's last entry keeps it in that chapter", () => {
    // Below Warm Two is the same gap as above Peak's heading; the row says which.
    expect(dropMove(rows, entry(E1), 3, 2)).toEqual({ entry_id: E1, position: 1, chapter_id: 1 });
  });

  it("across a boundary without moving still changes the chapter", () => {
    expect(dropMove(rows, entry(E3), 3, 2)).toEqual({ entry_id: E3, position: 2, chapter_id: 1 });
  });

  it("where the entry already is changes nothing", () => {
    expect(dropMove(rows, entry(E2), 2, 2)).toBeNull();
    expect(dropMove(rows, entry(E2), 3, 2)).toBeNull();
    expect(dropMove(rows, entry(E2), 3, 99)).toBeNull();
  });
});

describe("a chapter chosen in the Inspector", () => {
  it("moves the entry to the start of a later chapter", () => {
    expect(chapterMove(FRIDAY.plan, entry(E1), 3)).toEqual({ entry_id: E1, position: 3, chapter_id: 3 });
  });

  it("moves the entry to the end of an earlier chapter", () => {
    expect(chapterMove(FRIDAY.plan, entry(E5), 1)).toEqual({ entry_id: E5, position: 2, chapter_id: 1 });
  });

  it("does nothing for the chapter it is in, or one that is not there", () => {
    expect(chapterMove(FRIDAY.plan, entry(E1), 1)).toBeNull();
    expect(chapterMove(FRIDAY.plan, entry(E1), 42)).toBeNull();
  });
});

describe("chapter starts and repeats", () => {
  it("starts a chapter only where one does not already start", () => {
    expect(canSplitAt(rows, E1)).toBe(false);
    expect(canSplitAt(rows, E2)).toBe(true);
    expect(canSplitAt(rows, E3)).toBe(false);
    expect(canSplitAt(rows, E4)).toBe(true);
    expect(canSplitAt(rows, 999)).toBe(false);
  });

  it("puts a repeat straight after its entry, in its chapter", () => {
    expect(repeatAfter(entry(E2))).toEqual({ position: 2, chapter_id: 1 });
  });
});

describe("the words", () => {
  it("counts the timed entries and says how many are not (DEC-107)", () => {
    expect(runningTimeLine(FRIDAY.plan.running_time)).toBe("9:00 planned · 4 untimed");
    expect(runningTimeLine({ seconds: 5660, timed: 3, untimed: 0 })).toBe("1:34:20 planned");
  });

  it("counts the open warnings and the accepted ones", () => {
    expect(warningCountLine(FRIDAY.analysis)).toBe("5 warnings · 1 accepted");
    expect(warningCountLine({ ...FRIDAY.analysis, counts: {}, acknowledged: 0 })).toBe("No warnings");
    expect(warningCountLine({ ...FRIDAY.analysis, counts: { key_clash: 1 }, acknowledged: 0 })).toBe(
      "1 warning",
    );
  });

  it("states a chapter's time against its target, and its range", () => {
    const [warmUp, peak] = FRIDAY.plan.chapters;
    expect(chapterTimeText(warmUp)).toBe("9:00 of 8:00");
    expect(chapterTimeText(peak)).toBe("0:00 · 2 untimed");
    expect(bpmRangeText(warmUp)).toBe("120–123");
    expect(bpmRangeText(peak)).toBe("");
    expect(bpmRangeText({ bpm_min: 126, bpm_max: null })).toBe("from 126");
    expect(bpmRangeText({ bpm_min: null, bpm_max: 128.5 })).toBe("to 128.5");
  });

  it("sums a transition up, open warnings first, accepted ones muted", () => {
    const into4 = summarizeWarnings(entryRow(E4).transition);
    expect(into4).toMatchObject({ tone: "open", text: "+9.4% tempo" });
    expect(into4.title).toContain("Keys clash: 8A → 3B (accepted)");
    expect(summarizeWarnings(entryRow(E6).transition).text).toBe("−12.9% tempo · Key clash");
    const accepted = entryRow(E4).transition.map((warning) => ({ ...warning, acknowledged: true }));
    expect(summarizeWarnings(accepted as SetWarning[])).toMatchObject({
      tone: "accepted",
      text: "+9.4% tempo · Key clash accepted",
    });
    expect(summarizeWarnings([]).tone).toBe("none");
  });

  it("has a few words for every warning the engine gives", () => {
    const plain = (plainRows[1] as EntryRow).transition.map(shortWarning).sort();
    // A track with no key is no warning (DEC-201).
    expect(plain).toEqual(["No BPM"]);
    expect((rows[0].kind === "heading" ? rows[0].warnings : []).map(shortWarning)).toEqual([
      "Over target",
      "Outside BPM range",
    ]);
  });

  it("says how many entries have no key, and nothing when all do", () => {
    const keyless = headerFacts(6, FRIDAY.plan.running_time, { ...FRIDAY.analysis, without_key: 2 });
    expect(keyless[keyless.length - 1]?.text).toBe("2 entries without a key");
    const one = headerFacts(6, FRIDAY.plan.running_time, { ...FRIDAY.analysis, without_key: 1 });
    expect(one[one.length - 1]?.text).toBe("1 entry without a key");
    const all = headerFacts(6, FRIDAY.plan.running_time, { ...FRIDAY.analysis, without_key: 0 });
    expect(all.some((fact) => /without a key/.test(fact.text))).toBe(false);
  });

  it("puts the header's facts on one line, each longer sentence in its title", () => {
    const facts = headerFacts(6, FRIDAY.plan.running_time, FRIDAY.analysis);
    expect(facts.map((fact) => fact.text)).toEqual([
      "6 entries",
      "9:00 planned · 4 untimed",
      "5 warnings · 1 accepted",
      "Files never checked",
    ]);
    // Transitions, then entries, then chapters, in words that count.
    expect(facts[2]).toEqual({
      text: "5 warnings · 1 accepted",
      title: "2 tempo jumps, 1 key clash, 1 chapter over its target, 1 chapter outside its BPM range",
      strong: true,
    });
    const partly = { ...FRIDAY.analysis.files, never_checked: false, checked: 3, unchecked: 2 };
    expect(headerFacts(1, FRIDAY.plan.running_time, { ...FRIDAY.analysis, files: partly })[3].text).toBe(
      "2 files never checked",
    );
    const checked = { ...FRIDAY.analysis.files, never_checked: false, checked: 5, unchecked: 0 };
    const quiet = headerFacts(1, FRIDAY.plan.running_time, { ...FRIDAY.analysis, counts: {}, files: checked });
    expect(quiet.map((fact) => fact.text)).toEqual(["1 entry", "9:00 planned · 4 untimed", "No warnings · 1 accepted"]);
    expect(quiet[2].strong).toBe(false);
  });

  it("writes a planned time, or nothing", () => {
    expect(timeCell(270)).toBe("4:30");
    expect(timeCell(null)).toBe("");
  });

  it("says where a deleted chapter's entries go before it is deleted", () => {
    const [warmUp, peak] = FRIDAY.plan.chapters;
    expect(deletionLine(FRIDAY.plan.chapters, peak)).toBe(
      "Its 2 entries join “Warm-up”, with their times and notes. The chapter's name, notes and targets are deleted with it.",
    );
    expect(deletionLine(FRIDAY.plan.chapters, warmUp)).toContain("join “Peak”");
    expect(deletionLine(FRIDAY.plan.chapters, { ...peak, entry_ids: [] })).toMatch(/^It holds no entries\./);
  });
});

describe("the menus", () => {
  const noop = () => undefined;
  const handlers = {
    onPlay: noop,
    onPlayNext: noop,
    onAddToQueue: noop,
    onSplit: noop,
    onRepeat: noop,
    onRemove: noop,
  };

  it("offers one entry the Set's edits beside the track's", () => {
    const items = entryMenuItems({ count: 1, canSplit: true }, handlers, [
      { id: "similar", label: "Similar tracks", onSelect: noop },
    ]);
    expect(items.map((item) => item.id)).toEqual([
      "play",
      "play-next",
      "add-to-queue",
      "split",
      "repeat",
      "remove",
      "similar",
    ]);
    expect(items[0].label).toBe("Play Set from here");
    expect(items.find((item) => item.id === "split")?.disabled).toBe(false);
  });

  it("does not start a chapter where one starts", () => {
    const items = entryMenuItems({ count: 1, canSplit: false }, handlers);
    expect(items.find((item) => item.id === "split")?.disabled).toBe(true);
  });

  it("offers several entries playing and removing, and nothing about one place", () => {
    const items = entryMenuItems({ count: 3, canSplit: true }, handlers);
    expect(items.map((item) => item.label)).toEqual([
      "Play 3 entries",
      "Play next",
      "Add to queue",
      "Remove 3 entries from Set",
    ]);
    expect(entryMenuItems({ count: 0, canSplit: true }, handlers)).toEqual([]);
  });

  it("offers a heading its dialog, moving and deleting, within what can be", () => {
    const menu = { onEdit: noop, onMoveUp: noop, onMoveDown: noop, onDelete: noop };
    const first = headingMenuItems({ position: 0, chapters: 3 }, menu);
    expect(first.map((item) => [item.id, Boolean(item.disabled)])).toEqual([
      ["edit", false],
      ["move-up", true],
      ["move-down", false],
      ["delete", false],
    ]);
    const last = headingMenuItems({ position: 2, chapters: 3 }, menu);
    expect(last.find((item) => item.id === "move-down")?.disabled).toBe(true);
    const only = headingMenuItems({ position: 0, chapters: 1 }, menu);
    expect(only.find((item) => item.id === "delete")?.disabled).toBe(true);
  });
});

describe("the chapter dialog's form", () => {
  it("reads a BPM, or none, and refuses what is not one", () => {
    expect(readBpm("")).toEqual({ ok: true, value: null });
    expect(readBpm(" 124.5 ")).toEqual({ ok: true, value: 124.5 });
    expect(readBpm("fast").ok).toBe(false);
    expect(readBpm("0").ok).toBe(false);
    expect(readBpm("-3").ok).toBe(false);
  });

  it("sends every field as one write, blanks as clears", () => {
    expect(
      chapterUpdate(7, { name: " Peak ", target: " 45:00 ", bpmMin: 126, bpmMax: null, notes: "  " }),
    ).toEqual({ chapter_id: 7, name: "Peak", target: "45:00", bpm_min: 126, bpm_max: null, notes: null });
    expect(chapterUpdate(7, { name: "", target: "", bpmMin: null, bpmMax: null, notes: "Up" })).toEqual({
      chapter_id: 7,
      name: "",
      target: null,
      bpm_min: null,
      bpm_max: null,
      notes: "Up",
    });
  });

  it("holds the engine's limit on a name", () => {
    expect(CHAPTER_NAME_MAX_LENGTH).toBe(120);
  });
});

describe("New Set from…'s sources", () => {
  const node = (id: number, kind: CollectionNode["kind"], name: string, parent: number | null = null) =>
    ({ ...TREE[0], id, kind, name, parent_id: parent, depth: parent === null ? 0 : 1 }) as CollectionNode;
  const playlist = (id: number, kind: "folder" | "playlist", name: string) =>
    ({ id, parent_id: null, name, kind, depth: 0, position: id, path: name, track_count: 3 }) as LibraryPlaylistNode;

  it("offers Collections and Smart Collections, then Rekordbox playlists, never a folder or a Set", () => {
    const tree = buildCollectionTree([
      node(1, "folder", "Crates"),
      node(2, "collection", "Warm-up", 1),
      node(3, "smart", "Ada", 1),
      node(4, "set", "Friday"),
    ]);
    const groups = newSetSources(tree, [playlist(10, "folder", "SETS"), playlist(11, "playlist", "Sunday")]);
    expect(groups.map((group) => [group.label, group.sources.map((source) => `${source.kind} ${source.name}`)])).toEqual([
      ["CuePoint", ["collection Warm-up", "smart Ada"]],
      ["Rekordbox playlists", ["playlist Sunday"]],
    ]);
    // Filed beside its source, in CuePoint's tree; at the top for a playlist.
    expect(groups[0].sources[0].parentId).toBe(1);
    expect(groups[1].sources[0].parentId).toBeNull();
  });

  it("leaves out a group with nothing in it", () => {
    expect(newSetSources(buildCollectionTree(TREE), [])).toEqual([]);
  });

  it("keys a source by its kind, since a Collection and a playlist can share an id", () => {
    expect(sourceKey({ kind: "collection", id: 2 })).not.toBe(sourceKey({ kind: "playlist", id: 2 }));
  });
});

describe("where /prepare goes", () => {
  const tree = buildCollectionTree(TREE);

  it("reads a Set's id from its address, and nothing else", () => {
    expect(preparePath(12)).toBe("/prepare/12");
    expect(setIdFromRoute("12")).toBe(12);
    for (const bad of [undefined, "", "0", "-1", "1.5", "12a", "99999999999999999999"]) {
      expect(setIdFromRoute(bad)).toBeNull();
    }
  });

  it("reopens the Set last open while it is there, else the first in the tree", () => {
    expect(setToOpen(tree, IDS.plain)?.name).toBe("Plain");
    // Gigs, and in it Friday then Scratch, come before Plain.
    expect(setToOpen(tree, 999)?.name).toBe("Friday");
    expect(setToOpen(tree, null)?.name).toBe("Friday");
    expect(setToOpen([], 3)).toBeNull();
  });

  it("remembers the last Set, and forgets it", () => {
    expect(loadLastSetId()).toBeNull();
    saveLastSetId(4);
    expect(loadLastSetId()).toBe(4);
    forgetLastSetId();
    expect(loadLastSetId()).toBeNull();
    localStorage.setItem(LAST_SET_STORAGE_KEY, "not a set");
    expect(loadLastSetId()).toBeNull();
  });
});

describe("the divider's width", () => {
  it("stays between the source panel's floor and less than half the page", () => {
    expect(clampSourceWidth(100, 1280)).toBe(SOURCE_MIN_WIDTH);
    expect(clampSourceWidth(1000, 1280)).toBe(576);
    expect(clampSourceWidth(300.4, 1280)).toBe(300);
    expect(clampSourceWidth(Number.NaN, 1280)).toBe(SOURCE_DEFAULT_WIDTH);
    // A narrow window never collapses it below its floor.
    expect(clampSourceWidth(400, 300)).toBe(SOURCE_MIN_WIDTH);
  });

  it("is remembered as chosen, and read back defensively", () => {
    expect(loadSourceWidth()).toBe(SOURCE_DEFAULT_WIDTH);
    saveSourceWidth(420);
    expect(loadSourceWidth()).toBe(420);
    localStorage.setItem("cuepoint-prepare-source-width", "wide");
    expect(loadSourceWidth()).toBe(SOURCE_DEFAULT_WIDTH);
  });
});
