/**
 * "Save set list…" and "Copy set list" (DEC-110, PREP-08's dialog).
 *
 * One hook for every place a Set is: the Library's tree now (PREP-09), the
 * Prepare page's header later (PREP-11). Both need the same loop, and a loop
 * written twice is a loop that learns about a refusal in one place only.
 *
 * **The dialog chooses, the engine judges** (DEC-083, DEC-110). The main
 * process opens the native dialog and answers a path; the engine refuses a
 * path it will not write and says why. A refusal whose next step is another
 * place reopens the dialog at the file refused, with the reason said, until
 * the user saves or cancels.
 *
 * **Copying needs no preload method** (PREP-11): the engine answers the text
 * and the web Clipboard API takes it.
 */
import { useCallback, useMemo } from "react";

import type { SetRefusal } from "../../api/cuepointBridge.types";
import { writeClipboard } from "../library/trackClipboard";
import {
  CLIPBOARD_REFUSED,
  NO_SET_LISTS,
  reopensDialog,
  setListCopiedLine,
  setListSavedLine,
} from "./setList";
import { reportUnexpected } from "../../reporting/reporting";

/** The Set a set list is of: its id, and the name the file is named after. */
interface SetListTarget {
  id: number;
  name: string;
}

interface SetListOptions {
  /** Said out loud: a toast, a status line — the page decides. */
  onMessage: (message: string, tone: "success" | "warning") => void;
  /** The Set has gone (`SET_NOT_FOUND`): whatever draws it should re-read. */
  onGone?: () => void;
}

interface SetListActions {
  /** False when the shell has no `sets` namespace, so nothing is offered. */
  available: boolean;
  save: (target: SetListTarget) => Promise<void>;
  copy: (target: SetListTarget) => Promise<void>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useSetList({ onMessage, onGone }: SetListOptions): SetListActions {
  const refused = useCallback(
    (refusal: SetRefusal) => {
      onMessage(refusal.message, "warning");
      if (refusal.code === "SET_NOT_FOUND") onGone?.();
    },
    [onGone, onMessage],
  );

  const save = useCallback(
    async (target: SetListTarget) => {
      const sets = window.cuepoint?.sets;
      if (!sets) {
        onMessage(NO_SET_LISTS, "warning");
        return;
      }
      try {
        let currentPath: string | null = null;
        // Until a file is written or the user cancels: each pass is one
        // choice the user made, so this cannot spin on its own.
        for (;;) {
          const choice = await sets.chooseSetListDestination({
            setName: target.name,
            currentPath,
          });
          if (choice.canceled) return;
          const answer = await sets.saveSetList({
            set_id: target.id,
            destination_path: choice.filePath,
          });
          if (!answer.refusal) {
            onMessage(setListSavedLine(target.name, answer.value.saved), "success");
            return;
          }
          refused(answer.refusal);
          if (!reopensDialog(answer.refusal)) return;
          currentPath = answer.refusal.path ?? choice.filePath;
        }
      } catch (cause) {
        reportUnexpected(cause);
        onMessage(messageOf(cause), "warning");
      }
    },
    [onMessage, refused],
  );

  const copy = useCallback(
    async (target: SetListTarget) => {
      const sets = window.cuepoint?.sets;
      if (!sets) {
        onMessage(NO_SET_LISTS, "warning");
        return;
      }
      try {
        const answer = await sets.setListText({ set_id: target.id });
        if (answer.refusal) {
          refused(answer.refusal);
          return;
        }
        const wrote = await writeClipboard(answer.value.text);
        onMessage(
          wrote ? setListCopiedLine(target.name) : CLIPBOARD_REFUSED,
          wrote ? "success" : "warning",
        );
      } catch (cause) {
        reportUnexpected(cause);
        onMessage(messageOf(cause), "warning");
      }
    },
    [onMessage, refused],
  );

  const available = Boolean(window.cuepoint?.sets);
  return useMemo(() => ({ available, save, copy }), [available, copy, save]);
}
