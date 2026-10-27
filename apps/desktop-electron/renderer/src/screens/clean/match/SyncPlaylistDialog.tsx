/**
 * Sync a playlist to files (the Review tab's green **Sync <name> to files…** button).
 *
 * Syncing is for the **ticked** tracks of one review. Opening this opens the Sync window
 * (`SaveToFilesDialog`, its `sync` variant) at once, saying "Loading the ticked tracks…" in its
 * body while it reads which they are: one window, never a small one first (M277). It **writes
 * nothing**: the window's
 * preview lays the Beatport matches' BPM, Genre, Label and Year over what the tracks show, in the
 * engine's memory, and counts what would change in the files for each value. The person chooses
 * the values there, and only there.
 *
 * Pressing **Sync N tracks** is one engine job: it writes the files, then, for what each file
 * actually got, accepts the ticked tracks and copies those values into CuePoint's own, as one
 * recorded batch. **Undo this sync** restores the files and takes that batch back. Cancelling the
 * window has nothing to take back, because nothing was done.
 *
 * It also syncs several reviews at once (M509, "Sync all reviewed"): the ticked tracks of every
 * one are read and handed to the window as one selection, so there is one preview and one job.
 */
import { useEffect, useRef, useState } from "react";

import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { quoted } from "../../../format/words";
import { SaveToFilesDialog } from "../../../components/saveToFiles/SaveToFilesDialog";
import { reportUnexpected } from "../../../reporting/reporting";
import { syncAllSelection } from "./syncAll";
import type { ReviewSource } from "./useMatchReview";

interface SyncPlaylistDialogProps {
  open: boolean;
  /** The playlist's name, for the title ("Sync hJ to your files"). */
  name: string;
  /** What is reviewed: the ticked tracks of this, or of each of these, are synced. */
  source: ReviewSource | readonly ReviewSource[];
  /** The window's title while it reads; "Sync “hJ” to your files" from `name` when left out. */
  title?: string;
  onClose: () => void;
  /** Files were written (or put back): the page counts again. */
  onChanged: () => void;
}

type Phase = "reading" | "ready" | "empty" | "failed";

export function SyncPlaylistDialog({ open, name, source, title, onClose, onChanged }: SyncPlaylistDialogProps) {
  const [phase, setPhase] = useState<Phase>("reading");
  const [ids, setIds] = useState<number[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  /** One per opening: a new opening is a new Sync window, with its own preview. */
  const [opening, setOpening] = useState(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const run = useRef(0);

  useEffect(() => {
    if (!open) return;
    run.current += 1;
    const mine = run.current;
    const current = () => run.current === mine;
    setOpening(mine);
    setPhase("reading");
    setProblem(null);
    setIds([]);
    void (async () => {
      try {
        const read = window.cuepoint?.getMatchReview;
        if (!read) throw new Error(NEEDS_DESKTOP);
        const given = sourceRef.current;
        const sources: readonly ReviewSource[] = Array.isArray(given) ? given : [given as ReviewSource];
        const answers = await Promise.all(
          sources.map(({ jobId, playlistId }) =>
            read({
              ...(jobId ? { jobId } : {}),
              ...(playlistId !== undefined ? { playlistId } : {}),
              tickedIds: true,
            }),
          ),
        );
        if (!current()) return;
        // One selection, each track once, for one preview and one job (M509).
        const picked = syncAllSelection(answers.map((answer) => answer.ids ?? []))?.track_ids ?? [];
        setIds(picked);
        setPhase(picked.length === 0 ? "empty" : "ready");
      } catch (cause) {
        reportUnexpected(cause);
        if (current()) {
          setProblem(userMessage(cause));
          setPhase("failed");
        }
      }
    })();
    // The source is read once, when the window opens: a later change is another opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <SaveToFilesDialog
      key={opening}
      open={open}
      variant="sync"
      selection={phase === "ready" ? { track_ids: ids } : null}
      count={ids.length}
      // Until the tracks are known the window is named for the playlist; then for how many (M277).
      title={phase === "ready" ? undefined : (title ?? `Sync ${quoted(name)} to your files`)}
      loadingWhat={phase === "reading" ? "the ticked tracks" : undefined}
      unavailable={
        phase === "empty"
          ? { text: "Nothing is ticked, so there is nothing to sync.", tone: "info" }
          : phase === "failed"
            ? { text: problem ?? "", tone: "danger" }
            : undefined
      }
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
