/**
 * The note under the Library's header after an import (LIB-1, DEC-132).
 *
 * An import is followed by work nobody asked for: CuePoint checks the files,
 * reads the cover art and draws every waveform, and for a large library that
 * is hours. Without a word on the page the Library looks finished and then
 * slows down. The note says what is going on, that the user can keep working,
 * and where progress is — the status strip, whose jobs it reads (`useActiveJob`)
 * — and, live, which step is running and how far it is.
 *
 * It belongs to the notice line: it shows only after an import (the page hands
 * it the moment of the import), never while someone works in the table, only
 * while one of the five jobs runs, and it can be dismissed for the session.
 * Once the chain has ended it is done for that import: a file check or waveform
 * run started later never brings it back. The page mounts it only while an
 * import is armed and neither done nor dismissed (`isReadyNoteOpen`, in `libraryNoticeMemory`).
 */
import { useEffect, useState } from "react";

import { Button } from "../../components";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { JOB_POLL_MS, useActiveJob } from "../../components/shell/useActiveJob";
import { wasDismissed, rememberDismissal, wasChainDone, rememberChainDone } from "./libraryNoticeMemory";
import "./LibraryNotice.css";

/** What each job of the chain after an import is doing, as a clause for "Now: …". */
const CHAIN: Record<string, string> = {
  file_check: "checking your music files",
  artwork_scan: "reading cover art",
  waveform_analysis: "drawing waveforms",
  marks_backfill: "reading cue points and beat grids",
  credit_index: "getting artist and label pages ready",
};

/** The job to describe: a running one of the chain before a queued one. */
function chainJob(jobs: readonly EngineJobSummary[]): EngineJobSummary | null {
  const chain = jobs.filter((job) => Object.hasOwn(CHAIN, job.type));
  return chain.find((job) => job.state === "running") ?? chain[0] ?? null;
}

/** "drawing waveforms, 1,204 of 12,000": the step, and how far it is when that is known. */
function nowLine(job: EngineJobSummary): string {
  const done = job.progress?.completed_tracks;
  const total = job.progress?.total_tracks;
  const step = CHAIN[job.type]!;
  if (typeof done !== "number" || typeof total !== "number" || total <= 0) return `Now: ${step}`;
  return `Now: ${step}, ${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

interface LibraryReadyNoteProps {
  /** When the import finished; null when none has this session, and nothing shows. */
  armedAt: number;
  /** How often to ask what is running; the status strip's pace unless a test hurries it. */
  pollMs?: number;
  /**
   * Whether the note is on the page, for the notice line to give way to the next
   * notice; null until the first answer, so the next one does not flash.
   */
  onShownChange?: (shown: boolean | null) => void;
}

export function LibraryReadyNote({
  armedAt,
  pollMs = JOB_POLL_MS,
  onShownChange,
}: LibraryReadyNoteProps) {
  const { jobs, loaded } = useActiveJob(pollMs);
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const [doneFor, setDoneFor] = useState<number | null>(null);

  const job = chainJob(jobs);
  const dismissed = dismissedFor === armedAt || wasDismissed(armedAt);
  const done = doneFor === armedAt || wasChainDone(armedAt);
  const shown = !dismissed && !done && job !== null;

  // The first answer with no chain job left ends it for this import: either
  // the work finished while the note showed, or there was none to wait for.
  const chainEnded = loaded && job === null;
  useEffect(() => {
    if (!chainEnded) return;
    rememberChainDone(armedAt);
    setDoneFor(armedAt);
  }, [armedAt, chainEnded]);

  useEffect(() => {
    onShownChange?.(loaded ? shown : null);
  }, [loaded, onShownChange, shown]);

  if (!shown) return null;

  const dismiss = () => {
    rememberDismissal(armedAt);
    setDismissedFor(armedAt);
  };

  return (
    <div className="library-notice" role="status" aria-label="Getting your library ready">
      <div className="library-notice__text">
        <p className="library-notice__line">
          <strong>Getting your library ready.</strong> CuePoint is checking that your music files
          are where Rekordbox says, reading their cover art and drawing each track&apos;s
          waveform. You can browse and play while it works. Progress is in the status strip at the
          bottom; <strong>Activity</strong> shows each step.
        </p>
        <p className="library-notice__now">{nowLine(job)}</p>
      </div>
      <Button variant="secondary" onClick={dismiss} aria-label="Dismiss this note">
        Dismiss
      </Button>
    </div>
  );
}
