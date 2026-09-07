/**
 * What a drag carries between the table and the tree (ORG-09, ORG-11).
 *
 * One module so the drop target and the drag source cannot disagree about the
 * format, and one property worth more than the rest: **nothing but our own
 * mime type is read**. A drag that accepted `text/plain` would treat a
 * paragraph dragged out of a text editor as a selection of tracks, and a file
 * dropped from the desktop as one too.
 */
import { describe, expect, it, vi } from "vitest";

import {
  COLLECTION_NODE_MIME,
  TRACK_IDS_MIME,
  draggedNodeId,
  draggedTrackIds,
  isCuePointDrag,
  setDraggedNodeId,
  setDraggedTrackIds,
} from "./collectionDrag";

/** A DataTransfer that remembers what was put on it, as the real one does. */
function transfer(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    get types() {
      return Object.keys(data);
    },
    getData: (format: string) => data[format] ?? "",
    setData: (format: string, value: string) => {
      data[format] = value;
    },
  };
}

describe("tracks", () => {
  it("round-trips a selection", () => {
    const drag = transfer();
    setDraggedTrackIds(drag, [7, 8, 9]);
    expect(draggedTrackIds(drag)).toEqual([7, 8, 9]);
  });

  it("also writes plain text, which is what a drop outside the app pastes", () => {
    const drag = transfer();
    setDraggedTrackIds(drag, [7, 8]);
    expect(drag.getData("text/plain")).toBe("7, 8");
  });

  it("reads nothing from a drag carrying only text", () => {
    expect(draggedTrackIds(transfer({ "text/plain": "[1,2,3]" }))).toEqual([]);
  });

  it("reads nothing from a file drag", () => {
    expect(draggedTrackIds(transfer({ Files: "" }))).toEqual([]);
  });

  it("survives a payload that is not what it should be", () => {
    expect(draggedTrackIds(transfer({ [TRACK_IDS_MIME]: "not json" }))).toEqual([]);
    expect(draggedTrackIds(transfer({ [TRACK_IDS_MIME]: '{"ids":[1]}' }))).toEqual([]);
  });

  it("keeps only the numbers", () => {
    expect(draggedTrackIds(transfer({ [TRACK_IDS_MIME]: '[1,"two",3]' }))).toEqual([1, 3]);
  });

  it("answers empty for no drag at all", () => {
    expect(draggedTrackIds(null)).toEqual([]);
  });

  it("does not read a transfer that answers every format with its text", () => {
    // Some platforms hand back the same payload whatever format is asked for.
    // The declared *types* are what decides, so a paragraph dragged out of a
    // text editor is not read as a selection of tracks.
    const sloppy = {
      types: ["text/plain"],
      getData: () => "[1,2,3]",
      setData: () => undefined,
    };
    expect(draggedTrackIds(sloppy)).toEqual([]);
  });
});

describe("a node of the tree", () => {
  it("round-trips", () => {
    const drag = transfer();
    setDraggedNodeId(drag, 12);
    expect(draggedNodeId(drag)).toBe(12);
  });

  it("is null when the drag carries something else", () => {
    expect(draggedNodeId(transfer({ [TRACK_IDS_MIME]: "[1]" }))).toBeNull();
    expect(draggedNodeId(null)).toBeNull();
  });

  it("is null when the payload is not a number", () => {
    expect(draggedNodeId(transfer({ [COLLECTION_NODE_MIME]: "twelve" }))).toBeNull();
  });

  it("is null for a transfer that answers every format with its text", () => {
    const sloppy = { types: ["text/plain"], getData: () => "12", setData: () => undefined };
    expect(draggedNodeId(sloppy)).toBeNull();
  });
});

describe("recognizing our own drag", () => {
  it("knows both payloads", () => {
    expect(isCuePointDrag(transfer({ [TRACK_IDS_MIME]: "[]" }))).toBe(true);
    expect(isCuePointDrag(transfer({ [COLLECTION_NODE_MIME]: "1" }))).toBe(true);
  });

  it("does not claim a file or a paragraph", () => {
    expect(isCuePointDrag(transfer({ Files: "" }))).toBe(false);
    expect(isCuePointDrag(transfer({ "text/plain": "hello" }))).toBe(false);
    expect(isCuePointDrag(null)).toBe(false);
  });
});

describe("the format itself", () => {
  it("is a mime type of our own, not text", () => {
    // `text/plain` would be accepted by every text field on the machine, so a
    // dropped selection would paste a JSON array into someone's search box.
    expect(TRACK_IDS_MIME).toBe("application/x-cuepoint-track-ids");
    expect(COLLECTION_NODE_MIME).toBe("application/x-cuepoint-collection-node");
  });

  it("is written through the module rather than spelled out by a caller", () => {
    const setData = vi.fn();
    setDraggedTrackIds({ types: [], getData: () => "", setData }, [1]);
    expect(setData).toHaveBeenCalledWith(TRACK_IDS_MIME, "[1]");
  });
});
