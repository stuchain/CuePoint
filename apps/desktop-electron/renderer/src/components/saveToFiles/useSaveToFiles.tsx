/**
 * The save bar and its window, mounted on a page (G4 step 8, C23).
 *
 * One hook gives a page both: the green bar that says how many tracks hold values
 * the files do not, and the save window it opens. The bar's own buttons open the
 * window on every unsaved track (the whole library, Q2); a page can also open it
 * on fewer, as a playlist's "Save N to files…" does. The window announces the
 * change after a save or a restore, so the bar and every page's counts read again
 * without the page doing anything.
 */
import { useCallback, useState, type ReactNode } from "react";

import type { BatchSelection, FilterRule } from "../../api/cuepointBridge.types";
import { SaveToFilesBar } from "./SaveToFilesBar";
import { SaveToFilesDialog } from "./SaveToFilesDialog";
import { UNSAVED_SELECTION } from "./saveChoices";

interface SaveRequest {
  /** One per opening: a new opening is a new window, with its own preview. */
  id: number;
  selection: BatchSelection;
  count: number;
  view: "choices" | "changes";
}

export interface SaveToFiles {
  /** The bar, for the bottom of the page body. Draws nothing when there is nothing to save. */
  bar: ReactNode;
  /** The window, to render once in the page. */
  dialog: ReactNode;
  /** Open the window on these tracks' unsaved values. */
  open: (selection: BatchSelection, count: number) => void;
}

/** The unsaved tracks of one playlist: what its row's "Save N to files…" saves. */
export function unsavedInPlaylist(playlistId: number): BatchSelection {
  const unsaved = UNSAVED_SELECTION.query?.filters?.rules ?? [];
  const inPlaylist: FilterRule = {
    field: "in_playlist",
    operator: "any_of",
    value: [{ kind: "playlist", id: playlistId }],
  };
  return { query: { filters: { match: "all", rules: [...unsaved, inPlaylist] } } };
}

/** The unsaved tracks of one match run: what Save N to files… saves from a past search's review. */
export function unsavedInRun(jobId: string): BatchSelection {
  const unsaved = UNSAVED_SELECTION.query?.filters?.rules ?? [];
  const inRun: FilterRule = { field: "match_run", operator: "is", value: jobId };
  return { query: { filters: { match: "all", rules: [...unsaved, inRun] } } };
}

interface SaveToFilesOptions {
  /** False while the page is hidden (a kept-alive page): the bar reads nothing then. */
  active?: boolean;
  /** Bumped by the page after a change it made itself, so the bar counts again. */
  refreshKey?: number;
}

export function useSaveToFiles({ active = true, refreshKey = 0 }: SaveToFilesOptions = {}): SaveToFiles {
  // The last request stays after closing, so the window can play its exit as it was.
  const [request, setRequest] = useState<SaveRequest | null>(null);
  const [shown, setShown] = useState(false);
  const show = useCallback((selection: BatchSelection, count: number, view: SaveRequest["view"]) => {
    setRequest((last) => ({ id: (last?.id ?? 0) + 1, selection, count, view }));
    setShown(true);
  }, []);
  const open = useCallback(
    (selection: BatchSelection, count: number) => show(selection, count, "choices"),
    [show],
  );
  const close = useCallback(() => setShown(false), []);

  const bar = (
    <SaveToFilesBar
      onSeeChanges={(tracks) => show(UNSAVED_SELECTION, tracks, "changes")}
      onSave={(tracks) => show(UNSAVED_SELECTION, tracks, "choices")}
      active={active}
      refreshKey={refreshKey}
    />
  );
  const dialog = (
    <SaveToFilesDialog
      key={request?.id ?? 0}
      open={shown && request !== null}
      selection={request?.selection ?? null}
      count={request?.count ?? 0}
      initialView={request?.view ?? "choices"}
      canMarkSaved
      onClose={close}
    />
  );
  return { bar, dialog, open };
}
