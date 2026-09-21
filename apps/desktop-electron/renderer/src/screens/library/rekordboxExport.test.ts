/**
 * What the Rekordbox export dialog says (EXPORT-07), over real engine answers.
 *
 * `rekordboxExport.fixture.json` is produced by
 * `src/tests/unit/services/rekordbox_export/test_rekordbox_export_dialog_fixture.py`,
 * which builds each situation over a real library and records what the engine
 * answers. These tests fail if the dialog stops telling the situations apart;
 * that one fails if the engine stops answering them.
 *
 * The risk the specification names is wording — a preview that undersells a
 * warning is how someone exports what they did not mean to — so the sentences
 * are asserted, not only their presence.
 */
import { describe, expect, it } from "vitest";

import type {
  RekordboxExportHistory,
  RekordboxExportPreview,
  RekordboxExportPreviewAnswer,
  RekordboxExportRefusal,
  RekordboxExportResult,
} from "../../api/cuepointBridge.types";
import type { CollectionTreeNode } from "./collectionTree";
import fixture from "./rekordboxExport.fixture.json";
import {
  EXPORT_KEY_FORMATS,
  OPEN_IN_REKORDBOX,
  canConfirm,
  changeLine,
  confirmBlocker,
  confirmLabel,
  copyLine,
  coveredByFolder,
  exportChoice,
  exportWarnings,
  fieldLines,
  formatSize,
  historyOutcome,
  keyFormatConsequence,
  keyFormatLabel,
  keyFormatName,
  playlistCount,
  playlistHeadline,
  playlistKindNote,
  refusalStep,
  refusalText,
  rememberedFolderLine,
  resultHeadline,
  sourceLine,
  stalenessWarning,
  trackCountLine,
  unknownTracksLine,
} from "./rekordboxExport";
import { KEY_FORMATS } from "./tagWriting";

function preview(name: keyof typeof fixture): RekordboxExportPreview {
  const answer = fixture[name] as unknown as RekordboxExportPreviewAnswer;
  expect(answer.preview).not.toBeNull();
  return answer.preview!;
}

function refusal(name: keyof typeof fixture): RekordboxExportRefusal {
  const answer = fixture[name] as unknown as RekordboxExportPreviewAnswer;
  expect(answer.refusal).not.toBeNull();
  return answer.refusal!;
}

const WHOLE = preview("whole_library");
const CHOSEN = preview("chosen");
const STALE = preview("stale");
const COLLISION = preview("collision");
const WRITTEN = fixture.result_written as unknown as RekordboxExportResult;
const CANCELLED = fixture.result_cancelled as unknown as RekordboxExportResult;
const HISTORY = fixture.history as unknown as RekordboxExportHistory;
const NO_HISTORY = fixture.history_empty as unknown as RekordboxExportHistory;

describe("the fixture is the engine's", () => {
  it("holds every situation the dialog draws", () => {
    expect(Object.keys(fixture).sort()).toEqual(
      [
        "chosen",
        "chosen_camelot",
        "chosen_short",
        "collision",
        "destination_is_source",
        "destination_not_xml",
        "empty_collection",
        "empty_folder",
        "history",
        "history_empty",
        "library_busy",
        "never_imported",
        "result_cancelled",
        "result_written",
        "source_invalid",
        "source_missing",
        "stale",
        "stale_unknown",
        "whole_library",
      ].sort(),
    );
  });

  it("answers exactly one of a preview and a refusal, every time", () => {
    for (const [name, value] of Object.entries(fixture)) {
      if (!("refusal" in value)) continue;
      const answer = value as unknown as RekordboxExportPreviewAnswer;
      expect((answer.preview === null) !== (answer.refusal === null), name).toBe(true);
    }
  });
});

describe("the key notation (DEC-089)", () => {
  it("offers the file-tag path's three labels, not a second vocabulary", () => {
    expect(EXPORT_KEY_FORMATS).toBe(KEY_FORMATS);
    expect(EXPORT_KEY_FORMATS.map((format) => format.value)).toEqual(["normal", "camelot", "short"]);
    expect(keyFormatLabel("camelot")).toBe("Camelot (8A, 12B)");
  });

  it("says nothing for classic, which is what Rekordbox writes", () => {
    expect(keyFormatConsequence("normal")).toBeNull();
  });

  it.each([
    ["camelot", "Camelot keys (8A)"],
    ["short", "short keys (Amin)"],
  ] as const)("states re-importing %s stores it as CuePoint's own key", (format, name) => {
    const line = keyFormatConsequence(format)!;
    expect(line).toContain(name);
    expect(line).toContain("import this file into CuePoint later");
    expect(line).toContain("CuePoint's own key");
    expect(line).toContain("classic keys (Am)");
  });

  it("names each notation inside a sentence", () => {
    expect(keyFormatName("normal")).toBe("classic (Am)");
    expect(keyFormatName("camelot")).toBe("Camelot (8A)");
    expect(keyFormatName("short")).toBe("short (Amin)");
  });

  it("is what the engine rewrote the keys in", () => {
    // Camelot rewrites every key the file spells classically: three where the
    // classic preview of the same library rewrites the one override.
    expect(preview("chosen_camelot").fields_changed.key).toBe(3);
    expect(CHOSEN.fields_changed.key).toBe(1);
    expect(preview("chosen_short").key_format).toBe("short");
  });
});

describe("the source file (DEC-082)", () => {
  it("names the file and promises it is never changed", () => {
    expect(sourceLine(CHOSEN.source)).toBe(
      "Patches a copy of collection.xml, the file your library was imported from. That file is never changed.",
    );
  });

  it("says nothing about staleness when the file is the one imported", () => {
    expect(CHOSEN.source.stale).toBe(false);
    expect(stalenessWarning(CHOSEN.source)).toBeNull();
  });

  it("warns with the real numbers when the file changed since the import", () => {
    const warning = stalenessWarning(STALE.source)!;
    expect(warning).toContain("collection.xml has changed since you imported it");
    expect(warning).toContain("saved ");
    expect(warning).toContain("after the import read it as saved");
    expect(warning).toContain(`now ${formatSize(830, 821)}, was ${formatSize(821, 830)}`);
    expect(warning).toContain("830 bytes");
    expect(warning).toContain("821 bytes");
    expect(warning).toContain("Refreshing first");
  });

  it("says it cannot tell when the import recorded nothing to compare", () => {
    const unknown = preview("stale_unknown");
    expect(unknown.source.stale).toBeNull();
    expect(stalenessWarning(unknown.source)).toContain("cannot tell whether the file has changed");
  });

  it("counts the tracks the file holds that CuePoint does not know", () => {
    expect(unknownTracksLine(CHOSEN)).toBe(
      "1 track in the file is not in your CuePoint library. It is exported exactly as it is.",
    );
    expect(unknownTracksLine({ ...CHOSEN, unknown_track_count: 3 })).toBe(
      "3 tracks in the file are not in your CuePoint library. They are exported exactly as they are.",
    );
    expect(unknownTracksLine({ ...CHOSEN, unknown_track_count: 0 })).toBeNull();
  });
});

describe("sizes", () => {
  it("rounds large files and keeps small ones exact", () => {
    expect(formatSize(821)).toBe("821 bytes");
    expect(formatSize(21_800_000)).toBe("20.8 MB");
    expect(formatSize(4096)).toBe("4.0 KB");
  });

  it("falls back to the exact count when rounding would hide a change", () => {
    expect(formatSize(21_800_000, 21_800_010)).toBe("21,800,000 bytes");
    expect(formatSize(21_800_000, 21_800_000)).toBe("20.8 MB");
  });
});

describe("the tracks", () => {
  it("counts the tracks in the exported file, which are the file's own", () => {
    expect(trackCountLine(CHOSEN)).toBe("4 tracks in the exported file");
  });

  it("counts what is rewritten, and breaks it down by field in the export's order", () => {
    expect(changeLine(CHOSEN)).toBe("2 tracks rewritten with CuePoint's values");
    expect(fieldLines(CHOSEN)).toEqual(["Key: 1 track", "Genre: 1 track", "Rating: 1 track"]);
  });

  it("says plainly when nothing is rewritten", () => {
    expect(changeLine(WHOLE)).toBe(
      "No track has a CuePoint value that differs from the file, so none is rewritten.",
    );
    expect(fieldLines(WHOLE)).toEqual([]);
  });

  it("describes an export that changes nothing as a copy", () => {
    expect(WHOLE.changes_nothing).toBe(true);
    expect(copyLine(WHOLE)).toContain("exact copy of your collection file");
    expect(copyLine(CHOSEN)).toBeNull();
  });
});

describe("the playlists", () => {
  it("counts what is added and names the folder it goes in", () => {
    expect(playlistHeadline(CHOSEN, 3)).toBe("4 playlists added, in a folder called “CuePoint”");
  });

  it("tells nothing chosen from a choice that holds nothing", () => {
    expect(playlistHeadline(WHOLE, 0)).toBe(
      "No playlists are added. Tick a Collection to send it to Rekordbox as a playlist.",
    );
    const empty = preview("empty_folder");
    expect(empty.playlists).toEqual([]);
    expect(playlistHeadline(empty, 1)).toBe(
      "What you ticked holds no Collections, so no playlists are added.",
    );
  });

  it("keeps an empty Collection as a playlist, because someone chose it", () => {
    const empty = preview("empty_collection");
    expect(empty.playlists).toHaveLength(1);
    expect(playlistCount(empty.playlists[0]!)).toBe("0 tracks");
  });

  it("counts a playlist the file cannot fully hold as what is written of what was asked", () => {
    const saturday = CHOSEN.playlists.find((playlist) => playlist.name === "Saturday")!;
    expect(saturday.path).toBe("CuePoint/Gigs/Saturday");
    expect(playlistCount(saturday)).toBe("3 tracks of 4");
    const summer = CHOSEN.playlists.find((playlist) => playlist.name === "Summer")!;
    expect(playlistCount(summer)).toBe("1 track");
  });

  it("marks a Smart Collection as its membership now (DEC-081)", () => {
    const fast = CHOSEN.playlists.find((playlist) => playlist.kind === "smart")!;
    expect(playlistKindNote(fast)).toBe("Smart Collection, as it matches now");
    expect(playlistKindNote(CHOSEN.playlists[0]!)).toBeNull();
  });
});

describe("the warnings", () => {
  it("come in the specification's order: absent tracks, missing files, a collision", () => {
    const all = exportWarnings({
      ...CHOSEN,
      playlist_folder: "CuePoint (2)",
      playlist_folder_renamed: true,
    });
    expect(all.map((warning) => warning.key)).toEqual(["absent", "missing", "collision"]);
  });

  it("says tracks the file lacks are left out of playlists, and how many entries", () => {
    const [absent] = exportWarnings(CHOSEN);
    expect(absent).toEqual({
      key: "absent",
      tone: "warning",
      text:
        "1 track in your library is not in this file, so 2 playlist entries pointing at it are " +
        "left out. The playlists above count what is left.",
    });
  });

  it("is only a note when no chosen playlist holds the absent tracks", () => {
    const [absent] = exportWarnings(WHOLE);
    expect(absent!.tone).toBe("note");
    expect(absent!.text).toBe(
      "1 track in your library is not in this file. None of the playlists above holds it.",
    );
  });

  it("counts missing audio files, which are exported unchanged (DEC-088)", () => {
    const missing = exportWarnings(CHOSEN).find((warning) => warning.key === "missing")!;
    expect(missing.text).toBe(
      "1 track has its audio file missing. It is exported unchanged, and Rekordbox will show it as missing too.",
    );
  });

  it("says a never-checked library is not counted, rather than claiming zero", () => {
    expect(WHOLE.missing_file_count).toBeNull();
    const unchecked = exportWarnings(WHOLE).find((warning) => warning.key === "unchecked")!;
    expect(unchecked.tone).toBe("note");
    expect(unchecked.text).toContain("never been checked");
    expect(exportWarnings(CHOSEN).some((warning) => warning.key === "unchecked")).toBe(false);
  });

  it("says nothing about missing files when a check found none", () => {
    const keys = exportWarnings({ ...CHOSEN, missing_file_count: 0 }).map((warning) => warning.key);
    expect(keys).not.toContain("missing");
    expect(keys).not.toContain("unchecked");
  });

  it("reports a name collision and that nothing is merged into the existing folder", () => {
    const collision = exportWarnings(COLLISION).find((warning) => warning.key === "collision")!;
    expect(collision.text).toBe(
      "Your file already has a top-level folder called “CuePoint”, so the playlists go in " +
        "“CuePoint (2)” instead. Nothing is added to the existing folder.",
    );
  });
});

describe("confirming", () => {
  it("says what it will do, never OK", () => {
    expect(confirmLabel(CHOSEN)).toBe("Export 4 tracks and 4 playlists");
    expect(confirmLabel(WHOLE)).toBe("Export 4 tracks");
    expect(confirmLabel(preview("empty_collection"))).toBe("Export 4 tracks and 1 playlist");
    expect(confirmLabel({ ...WHOLE, track_count: 3880 })).toBe("Export 3,880 tracks");
    expect(confirmLabel(null)).toBe("Export");
  });

  const ready = { preview: CHOSEN, refusal: null, destination: "C:\\x.xml", working: false };

  it("can be pressed with a preview, a destination and no refusal", () => {
    expect(canConfirm(ready)).toBe(true);
    expect(confirmBlocker(ready)).toBeNull();
  });

  it("is held while a refusal stands, whatever else is ready", () => {
    for (const name of ["never_imported", "source_missing", "destination_is_source", "library_busy"] as const) {
      const state = { ...ready, refusal: refusal(name) };
      expect(canConfirm(state), name).toBe(false);
      expect(confirmBlocker(state)).toContain("problem above");
    }
  });

  it("waits for the preview, and for a destination", () => {
    expect(canConfirm({ ...ready, preview: null })).toBe(false);
    expect(confirmBlocker({ ...ready, preview: null })).toBe("The preview has not answered yet.");
    expect(canConfirm({ ...ready, destination: null })).toBe(false);
    expect(confirmBlocker({ ...ready, destination: null })).toBe("Choose where to save the file.");
  });

  it("cannot be pressed twice while working", () => {
    expect(canConfirm({ ...ready, working: true })).toBe(false);
  });

  it("goes ahead with a stale source, which is reported and not refused (DEC-082)", () => {
    expect(canConfirm({ ...ready, preview: STALE })).toBe(true);
  });
});

describe("refusals", () => {
  it("name the file and the next step for each source refusal", () => {
    expect(refusalText(refusal("never_imported"))).toBe(
      "There is no collection file to export from. Import your Rekordbox collection first.",
    );
    expect(refusalText(refusal("source_missing"))).toBe(
      "The collection file this library was imported from is not there any more: " +
        "C:\\Users\\dj\\Music\\collection.xml. The export patches that file, so it has to be " +
        "found first: import it again from where it is now.",
    );
    expect(refusalText(refusal("source_invalid"))).toContain("cannot be read as a Rekordbox collection");
    expect(refusalText(refusal("source_invalid"))).toContain("collection.xml");
  });

  it("say the source is never the destination, in words", () => {
    expect(refusalText(refusal("destination_is_source"))).toBe(
      "That is the file your library was imported from, and an export never writes over it. Choose a different file.",
    );
    expect(refusalText(refusal("destination_not_xml"))).toBe(
      "An export is saved as an .xml file. Choose a name ending in .xml.",
    );
  });

  it.each([
    ["destination_is_folder", "That is a folder."],
    ["destination_folder_missing", "does not exist"],
    ["destination_blank", "Choose where to save"],
    ["source_unreadable", "could not be read"],
  ] as const)("say %s in words", (reason, words) => {
    const code = reason.startsWith("source")
      ? "REKORDBOX_EXPORT_SOURCE_REFUSED"
      : "REKORDBOX_EXPORT_DESTINATION_REFUSED";
    const text = refusalText({ code, message: "engine", reason, path: "C:\\x", job_id: null, job_type: null });
    expect(text).toContain(words);
  });

  it("name the job a busy library is waiting for", () => {
    expect(refusalText(refusal("library_busy"))).toBe(
      "An import is running. The export waits for it, and the preview answers when it ends.",
    );
    const other = { ...refusal("library_busy"), job_type: "something_new" };
    expect(refusalText(other)).toContain("Another library job is running");
  });

  it("fall back to the engine's own words for anything unforeseen", () => {
    expect(
      refusalText({
        code: "REKORDBOX_EXPORT_SOURCE_REFUSED",
        message: "The engine's sentence.",
        reason: null,
        path: null,
        job_id: null,
        job_type: null,
      }),
    ).toBe("The engine's sentence.");
  });

  it("offer the step each one needs", () => {
    expect(refusalStep(refusal("never_imported"))).toBe("import");
    expect(refusalStep(refusal("source_missing"))).toBe("import");
    expect(refusalStep(refusal("source_invalid"))).toBe("import");
    expect(refusalStep({ ...refusal("source_missing"), reason: "source_unreadable" })).toBe("retry");
    expect(refusalStep(refusal("destination_is_source"))).toBe("choose");
    expect(refusalStep(refusal("destination_not_xml"))).toBe("choose");
    expect(refusalStep(refusal("library_busy"))).toBe("wait");
  });
});

describe("the result", () => {
  it("says what was written, and where", () => {
    expect(resultHeadline(WRITTEN)).toBe(
      "Exported to CuePoint Export 2026-09-21.xml: 4 tracks, 3 rewritten, 4 playlists added.",
    );
  });

  it("says a stopped export wrote nothing", () => {
    expect(resultHeadline(CANCELLED)).toBe(
      "Stopped. Nothing was written, and the file you chose was left as it was.",
    );
  });

  it("says why a failed one failed", () => {
    expect(resultHeadline({ ...WRITTEN, outcome: "failed", error: "The disk is full" })).toBe(
      "The export failed: The disk is full.",
    );
  });

  it("tells a DJ how to see it in Rekordbox, and that it is not merged", () => {
    expect(OPEN_IN_REKORDBOX).toContain("Imported Library");
    expect(OPEN_IN_REKORDBOX).toContain("rekordbox xml");
    expect(OPEN_IN_REKORDBOX).toContain("rather than merged into it");
  });

  it("is the preview's own report, number for number (DEC-084)", () => {
    expect(WRITTEN.report!.track_count).toBe(WRITTEN.track_count);
    expect(WRITTEN.report!.changed_track_count).toBe(WRITTEN.changed_track_count);
    expect(WRITTEN.report!.playlists).toHaveLength(WRITTEN.playlist_count);
  });
});

describe("what is chosen", () => {
  function node(id: number, kind: CollectionTreeNode["kind"], children: CollectionTreeNode[] = []) {
    return { id, kind, name: `n${id}`, children } as unknown as CollectionTreeNode;
  }
  const TREE = [
    node(1, "folder", [node(2, "collection"), node(3, "folder", [node(4, "smart")])]),
    node(5, "collection"),
  ];

  it("sends nothing when nothing is ticked", () => {
    expect(exportChoice(TREE, new Set())).toEqual([]);
  });

  it("sends a ticked folder once, and nothing under it again", () => {
    expect(exportChoice(TREE, new Set([2, 1, 4]))).toEqual([1]);
    expect(exportChoice(TREE, new Set([3, 4, 5]))).toEqual([3, 5]);
  });

  it("sends in tree order, whatever order they were ticked in", () => {
    expect(exportChoice(TREE, new Set([5, 2]))).toEqual([2, 5]);
  });

  it("draws everything under a ticked folder as covered, and nothing else", () => {
    expect([...coveredByFolder(TREE, new Set([1]))].sort()).toEqual([2, 3, 4]);
    expect([...coveredByFolder(TREE, new Set([3]))]).toEqual([4]);
    expect(coveredByFolder(TREE, new Set([2, 5])).size).toBe(0);
  });
});

describe("Settings", () => {
  it("shows where the save dialog opens: the last written export's folder", () => {
    expect(rememberedFolderLine(HISTORY.remembered)).toBe("C:\\Users\\dj\\Music\\Exports");
    expect(HISTORY.remembered.key_format).toBe("camelot");
  });

  it("says Documents when nothing has been exported", () => {
    expect(rememberedFolderLine(NO_HISTORY.remembered)).toContain("Nothing exported yet");
    expect(rememberedFolderLine(NO_HISTORY.remembered)).toContain("Documents");
  });

  it("says a remembered folder that has gone is gone", () => {
    const gone = { ...HISTORY.remembered, folder_exists: false };
    expect(rememberedFolderLine(gone)).toContain("no longer there");
  });

  it("describes each past export by how it ended", () => {
    const [cancelled, written] = HISTORY.exports;
    expect(historyOutcome(written!)).toBe("4 tracks · 3 rewritten · 4 playlists · Camelot (8A)");
    expect(historyOutcome(cancelled!)).toBe("Stopped — nothing was written");
    expect(historyOutcome({ ...written!, outcome: "failed", error: "Disk full" })).toBe(
      "Failed: Disk full",
    );
  });
});
