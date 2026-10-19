/**
 * Sync a playlist to files (the Review tab's green **Sync <name> to files…** button).
 *
 * Syncing is for the **ticked** tracks of one review. Opening this reads which they are and opens
 * the Sync window (`SaveToFilesDialog`, its `sync` variant), and **writes nothing**: the window's
 * preview lays the Beatport matches' BPM, Genre, Label and Year over what the tracks show, in the
 * engine's memory, and counts what would change in the files for each value. The person chooses
 * the values there, and only there.
 *
 * Pressing **Sync N tracks** is one engine job: it writes the files, then, for what each file
 * actually got, accepts the ticked tracks and copies those values into CuePoint's own, as one
 * recorded batch. **Undo this sync** restores the files and takes that batch back. Cancelling the
 * window has nothing to take back, because nothing was done.
 */
import { useEffect, useRef, useState } from "react";

import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { quoted } from "../../../format/words";
import { Loading } from "../../../components/Loading";
import { Modal } from "../../../components/Modal";
import { Notice } from "../../../components/Notice";
import { SaveToFilesDialog } from "../../../components/saveToFiles/SaveToFilesDialog";
import { reportUnexpected } from "../../../reporting/reporting";
import type { ReviewSource } from "./useMatchReview";

interface SyncPlaylistDialogProps {
  open: boolean;
  /** The playlist's name, for the title ("Sync hJ to your files"). */
  name: string;
  /** What is reviewed: the ticked tracks of this are synced. */
  source: ReviewSource;
  onClose: () => void;
  /** Files were written (or put back): the page counts again. */
  onChanged: () => void;
}

type Phase = "reading" | "ready" | "empty" | "failed";

export function SyncPlaylistDialog({ open, name, source, onClose, onChanged }: SyncPlaylistDialogProps) {
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
        const { jobId, playlistId } = sourceRef.current;
        const answer = await read({
          ...(jobId ? { jobId } : {}),
          ...(playlistId !== undefined ? { playlistId } : {}),
          tickedIds: true,
        });
        if (!current()) return;
        const picked = answer.ids ?? [];
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
    <>
      <Modal
        open={open && phase !== "ready"}
        title={`Sync ${quoted(name)} to your files`}
        onClose={onClose}
        closeLabel={phase === "reading" ? "Cancel" : "Close"}
      >
        {phase === "reading" && (
          <>
            <Loading what="the ticked tracks" />
            <p className="cp-modal__lead">Nothing is written to your files.</p>
          </>
        )}
        {phase === "empty" && <p role="status">Nothing is ticked, so there is nothing to sync.</p>}
        {phase === "failed" && <Notice kind="danger">{problem}</Notice>}
      </Modal>
      <SaveToFilesDialog
        key={opening}
        open={open && phase === "ready"}
        variant="sync"
        selection={{ track_ids: ids }}
        count={ids.length}
        onClose={onClose}
        onChanged={onChanged}
      />
    </>
  );
}
