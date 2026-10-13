/**
 * "Save N tracks to your files" (G4 step 4, DEC-262, mockup option S1).
 *
 * The one control in the app that writes outside CuePoint's database. It still
 * follows DEC-070's order, but the preview no longer waits for a button: on opening
 * it reads the files once, with every field on, and that one preview carries the
 * count for every row. A tick, the Keep choice and the key style then change those
 * counts at once with no call; only the footer total, a count of files that holds
 * whichever rows are ticked, is asked of the engine (debounced).
 *
 * A preview or a save large enough to be a job is followed like every job: it shows
 * "Reading 412 of 1,200 files…" and waits for its answer. After a save the window
 * offers Restore, which puts every value back, and Done.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  BatchSelection,
  EngineJobSummary,
  TagRestoreResult,
  TagWritePreview,
  TagWriteResult,
} from "../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../api/bridgeError";
import { announceLibraryChange } from "../../api/libraryChanges";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";
import { reportUnexpected } from "../../reporting/reporting";
import { jobResult } from "./jobResult";
import { RELOAD_TAG_REMINDER, restoreHeadline, writeHeadline } from "./tagWriting";
import { NO_VALUE } from "../../words";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Select } from "../Select";
import {
  KEY_STYLES,
  SAVE_FIELDS,
  changeRows,
  fieldCount,
  fileWords,
  loadSaveChoices,
  noneTicked,
  previewOptions,
  rememberSaveChoices,
  savedNothing,
  saveState,
  saveTitle,
  tagOptionsFor,
  trackWords,
  type KeyStyle,
  type SaveChoices,
  type SaveFieldId,
} from "./saveChoices";
import "./SaveToFilesDialog.css";

/** How long a change waits for the next before the footer total is asked for. */
const COUNT_DELAY_MS = 150;
/** The engine's code for a preview it no longer holds: a preview is used once. */
const PREVIEW_GONE = "TAG_WRITE_PREVIEW_NOT_FOUND";
/** How often a job's progress is read when the bridge has no subscription. */
const PROGRESS_POLL_MS = 400;

interface SaveToFilesDialogProps {
  open: boolean;
  selection: BatchSelection | null;
  /** The tracks the selection holds, for the title. */
  count: number;
  /** "changes" opens on the list of what would change, as the bar's See changes does. */
  initialView?: "choices" | "changes";
  /**
   * The window was opened for tracks the save bar counted. When no file would change,
   * Save then becomes "Mark N tracks as saved", which records them as already in the files.
   */
  canMarkSaved?: boolean;
  onClose: () => void;
  /** Called after a save or a restore touched files. */
  onChanged?: () => void;
}

type Phase = "reading" | "failed" | "ready" | "saving" | "saved" | "restoring" | "restored";

/** A running job's progress, from its events or, with no subscription, by asking. */
function useJobProgress(jobId: string | null): { done: number; total: number } | null {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => {
    setProgress(null);
    if (!jobId) return;
    const bridge = window.cuepoint;
    const take = (status: Partial<EngineJobSummary> | null | undefined) => {
      const known = status?.progress;
      if (known && typeof known.total_tracks === "number" && known.total_tracks > 0) {
        setProgress({ done: known.completed_tracks ?? 0, total: known.total_tracks });
      }
    };
    let stop: (() => void) | undefined;
    let timer: number | undefined;
    if (bridge?.subscribeJobEvents) {
      stop = bridge.subscribeJobEvents(jobId, (event) => take(event as Partial<EngineJobSummary>));
    } else if (bridge?.getJob) {
      const read = bridge.getJob;
      timer = window.setInterval(() => void read(jobId).then(take, () => undefined), PROGRESS_POLL_MS);
    }
    return () => {
      stop?.();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [jobId]);
  return progress;
}

export function SaveToFilesDialog({
  open,
  selection,
  count,
  initialView = "choices",
  canMarkSaved = false,
  onClose,
  onChanged,
}: SaveToFilesDialogProps) {
  const [choices, setChoices] = useState<SaveChoices>(() => loadSaveChoices());
  const [phase, setPhase] = useState<Phase>("reading");
  const [view, setView] = useState<"choices" | "changes">(initialView);
  const [preview, setPreview] = useState<TagWritePreview | null>(null);
  /** Files a save would change for the ticked rows; null until the engine has counted. */
  const [total, setTotal] = useState<number | null>(null);
  const [written, setWritten] = useState<TagWriteResult | null>(null);
  const [restored, setRestored] = useState<TagRestoreResult | null>(null);
  /** The footer total could not be counted; Try again counts it again. */
  const [countError, setCountError] = useState(false);
  const [countTry, setCountTry] = useState(0);
  /** Which reading of the files the preview is from, so a second reading is counted afresh. */
  const [reads, setReads] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  /** The save this window started, kept even when it did not finish. */
  const [writeJobId, setWriteJobId] = useState<string | null>(null);
  const alive = useRef(true);
  const previewRun = useRef(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const progress = useJobProgress(jobId);
  const backRef = useRef<HTMLButtonElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLParagraphElement>(null);
  const restoredRef = useRef<HTMLParagraphElement>(null);
  const cameFromList = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const readFiles = async (forChoices: SaveChoices) => {
    const bridge = window.cuepoint?.previewTagWrite;
    const chosen = selectionRef.current;
    const run = ++previewRun.current;
    const current = () => alive.current && run === previewRun.current;
    setPhase("reading");
    setPreview(null);
    setTotal(null);
    setCountError(false);
    if (!bridge || !chosen) {
      setProblem(NEEDS_DESKTOP);
      setPhase("failed");
      return;
    }
    try {
      const outcome = await bridge({ selection: chosen, options: previewOptions(forChoices) });
      let answer: TagWritePreview;
      if (outcome.preview) {
        answer = outcome.preview;
      } else {
        const id = outcome.job_id ?? outcome.id;
        if (!id) throw new Error("CuePoint answered with neither a preview nor a task to follow.");
        if (current()) setJobId(id);
        answer = await jobResult<TagWritePreview>(id);
      }
      if (!current()) return;
      setJobId(null);
      if (answer.cancelled) {
        // A preview that stopped early did not read every file, so none of its counts can be used.
        setProblem("The preview was stopped before it read every file.");
        setPhase("failed");
        return;
      }
      setProblem(null);
      setPreview(answer);
      setReads((n) => n + 1);
      setPhase("ready");
    } catch (cause) {
      reportUnexpected(cause);
      if (!current()) return;
      setJobId(null);
      setProblem(userMessage(cause));
      setPhase("failed");
    }
  };

  useEffect(() => {
    if (!open) {
      previewRun.current += 1;
      return;
    }
    const remembered = loadSaveChoices();
    setChoices(remembered);
    setView(initialView);
    setWritten(null);
    setRestored(null);
    setProblem(null);
    setJobId(null);
    setWriteJobId(null);
    void readFiles(remembered);
    // Opening is the only thing that reads the files again; what is chosen after does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The footer total: a count of files, which no row's count can give, so it is asked of the
  // engine a moment after the last change.
  const ticked = useMemo(() => JSON.stringify(tagOptionsFor(choices)), [choices]);
  useEffect(() => {
    if (phase !== "ready" || !preview) return;
    setTotal(null);
    setCountError(false);
    if (noneTicked(choices)) return;
    const ask = window.cuepoint?.countTagPreview;
    if (!ask) {
      setTotal(preview.files);
      return;
    }
    let stale = false;
    const timer = window.setTimeout(() => {
      ask({ preview_id: preview.preview_id, options: tagOptionsFor(choices) }).then(
        (answer) => {
          if (!stale) setTotal(answer.files);
        },
        (cause) => {
          reportUnexpected(cause);
          if (stale) return;
          if (bridgeErrorFields(cause).code === PREVIEW_GONE) {
            void readFiles(choices);
            return;
          }
          setProblem(userMessage(cause));
          setCountError(true);
        },
      );
    }, COUNT_DELAY_MS);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // `ticked` stands for the options in `choices` that the count depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, preview, ticked, countTry, reads]);

  const change = (patch: Partial<SaveChoices>) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    setProblem(null);
  };
  const tick = (id: SaveFieldId, on: boolean) => change({ fields: { ...choices.fields, [id]: on } });

  const state = preview
    ? saveState({ choices, preview, total, count, canMarkSaved })
    : { label: "Save to files", enabled: false, reason: null, mark: false };

  const runSave = async () => {
    const bridge = window.cuepoint?.startTagWrite;
    if (!bridge || !preview || !state.enabled) return;
    setProblem(null);
    rememberSaveChoices(choices);
    setPhase("saving");
    let started: string | null = null;
    try {
      started = (await bridge({ preview_id: preview.preview_id, options: tagOptionsFor(choices) })).job_id;
      setJobId(started);
      setWriteJobId(started);
      const result = await jobResult<TagWriteResult>(started);
      if (!alive.current) return;
      setWritten(result);
      setPhase("saved");
    } catch (cause) {
      reportUnexpected(cause);
      if (!alive.current) return;
      setProblem(userMessage(cause));
      // A save that started and then failed may have written files, so it is offered for
      // restoring. One refused before it started wrote nothing. When the refusal is that the
      // engine no longer holds the preview (it uses one once), a fresh one is read; any other
      // refusal leaves the preview as it was, to try again.
      if (started) {
        setPhase("saved");
      } else if (bridgeErrorFields(cause).code === PREVIEW_GONE) {
        void readFiles(choices);
      } else {
        setPhase("ready");
      }
    } finally {
      if (alive.current) setJobId(null);
      if (started) {
        onChanged?.();
        announceLibraryChange();
      }
    }
  };

  const runRestore = async () => {
    const bridge = window.cuepoint?.startTagRestore;
    if (!bridge || !writeJobId) return;
    setProblem(null);
    setPhase("restoring");
    try {
      const started = await bridge({ job_id: writeJobId });
      setJobId(started.job_id);
      const result = await jobResult<TagRestoreResult>(started.job_id);
      if (!alive.current) return;
      setRestored(result);
      setPhase("restored");
    } catch (cause) {
      reportUnexpected(cause);
      if (!alive.current) return;
      setProblem(userMessage(cause));
      setPhase("saved");
    } finally {
      if (alive.current) setJobId(null);
      onChanged?.();
      announceLibraryChange();
    }
  };

  const requestClose = () => {
    // Closing while a job-sized preview is still reading stops that job, then closes.
    if (phase === "reading" && jobId) void window.cuepoint?.cancelJob(jobId).catch(() => undefined);
    onClose();
  };

  const stop = () => {
    if (jobId) void window.cuepoint?.cancelJob(jobId).catch(() => undefined);
  };

  const finished = phase === "saved" || phase === "restoring" || phase === "restored";
  const busy = phase === "saving" || phase === "restoring";
  const reading = phase === "reading";
  const choosing = reading || phase === "ready" || phase === "failed";
  /** The list of changes is shown while reading or once ready; a failed read goes back to the rows. */
  const list = view === "changes" && (reading || phase === "ready");
  const marked = written !== null && savedNothing(written);

  // Focus follows the view: Back on entering the list, See changes on leaving it, and the result
  // once a save or a restore has answered.
  useEffect(() => {
    if (!open) return;
    if (list) {
      cameFromList.current = true;
      backRef.current?.focus();
    } else if (cameFromList.current) {
      cameFromList.current = false;
      footerRef.current?.querySelector<HTMLButtonElement>('[data-role="see-changes"]')?.focus();
    }
  }, [open, list]);
  useEffect(() => {
    const target = phase === "saved" ? headlineRef.current : phase === "restored" ? restoredRef.current : null;
    if (phase !== "saved" && phase !== "restored") return;
    (target ?? footerRef.current?.querySelector<HTMLButtonElement>('[data-role="done"]'))?.focus();
  }, [phase]);
  const rows = useMemo(() => (preview ? changeRows(preview, choices) : []), [preview, choices]);
  const sampled = preview ? preview.changes.length < preview.files : false;
  const more = preview && sampled ? Math.max(0, (total ?? preview.files) - rows.length) : 0;

  return (
    <Modal
      open={open}
      title={saveTitle(count)}
      onClose={busy ? () => undefined : requestClose}
      size={list ? "wide" : "default"}
    >
      <div className="save-dialog">
        {choosing && !list && (
          <>
            <ul className="save-dialog__rows">
              {SAVE_FIELDS.map(({ id, label }) => (
                <li key={id} className="save-dialog__row" data-ticked={choices.fields[id]}>
                  <label className="save-dialog__tick">
                    <input
                      type="checkbox"
                      aria-describedby={`save-count-${id}`}
                      checked={choices.fields[id]}
                      onChange={(event) => tick(id, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                  {id === "key" && (
                    <Select
                      label="Key style"
                      className="save-dialog__style"
                      value={choices.key_format}
                      options={KEY_STYLES.map(({ value, label: example }) => ({ value, label: example }))}
                      onChange={(event) => change({ key_format: event.target.value as KeyStyle })}
                    />
                  )}
                  <span id={`save-count-${id}`} className="save-dialog__count cp-data">
                    {preview ? fileWords(fieldCount(id, choices, preview.field_choices)) : "…"}
                  </span>
                </li>
              ))}
            </ul>
            <label className="save-dialog__tick save-dialog__keep">
              <input
                type="checkbox"
                checked={choices.keep_existing}
                onChange={(event) => change({ keep_existing: event.target.checked })}
              />
              <span>Keep values already in the files</span>
            </label>
          </>
        )}

        {list && (
          <>
            <button
              ref={backRef}
              type="button"
              className="cp-link save-dialog__back"
              onClick={() => setView("choices")}
            >
              ‹ Back
            </button>
            {preview && rows.length > 0 && (
              <table className="save-dialog__changes">
                <thead>
                  <tr>
                    <th scope="col">Track</th>
                    <th scope="col">What changes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.file}</td>
                      <td>
                        {row.what.map((entry, index) => (
                          <span key={entry.name} className="save-dialog__what">
                            {index > 0 && " · "}
                            <span className="save-dialog__field">{entry.name}</span>
                            {": "}
                            {entry.from === null ? (
                              entry.name === "Artwork" ? null : (
                                <>
                                  <span>{NO_VALUE}</span>
                                  {" → "}
                                </>
                              )
                            ) : (
                              <>
                                <s>{entry.from}</s>
                                {" → "}
                              </>
                            )}
                            <span>{entry.to}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview && rows.length === 0 && (
              <p className="save-dialog__note">Nothing to show for the values ticked.</p>
            )}
            {more > 0 && <p className="save-dialog__note">+{more.toLocaleString()} more</p>}
          </>
        )}

        {reading && (
          <p className="save-dialog__note" role="status">
            {progress
              ? `Reading ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} files…`
              : "Reading the files… nothing is being changed."}
          </p>
        )}

        {phase === "saving" && (
          <p className="save-dialog__note" role="status">
            {progress
              ? `Saving ${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} files…`
              : "Saving… each value is recorded before its file is touched."}
          </p>
        )}

        {writeJobId && finished && (
          <section className="save-dialog__answer" aria-label="Saved">
            <p ref={headlineRef} tabIndex={-1} className="save-dialog__headline" role="status">
              {written
                ? marked
                  ? `${trackWords(count)} ${count === 1 ? "is" : "are"} marked as saved.`
                  : writeHeadline(written)
                : "The write did not finish. Some files may have been written; restoring puts them back."}
            </p>
            {written && written.problems.length > 0 && (
              <ul className="save-dialog__lines">
                {written.problems.slice(0, 10).map((entry, index) => (
                  <li key={`${entry.file_path}-${index}`}>
                    {entry.file_path.split(/[\\/]/).pop()}: {entry.message}
                  </li>
                ))}
              </ul>
            )}
            {!marked && <p className="save-dialog__note">{RELOAD_TAG_REMINDER}</p>}
            {!marked && phase !== "restored" && (
              <div className="save-dialog__restore">
                <Button variant="secondary" loading={phase === "restoring"} onClick={() => void runRestore()}>
                  Restore these files
                </Button>
                <span className="save-dialog__note">
                  Puts back every value this save replaced. It is also offered in Activity.
                </span>
              </div>
            )}
          </section>
        )}

        {restored && phase === "restored" && (
          <p ref={restoredRef} tabIndex={-1} className="save-dialog__headline" role="status">
            {restoreHeadline(restored)}
          </p>
        )}

        {problem && (
          <p className="save-dialog__problem" role="alert">
            {problem}
          </p>
        )}

        <footer ref={footerRef} className="save-dialog__footer">
          <div className="save-dialog__buttons">
            {finished ? (
              <Button variant="primary" data-role="done" onClick={onClose} disabled={phase === "restoring"}>
                Done
              </Button>
            ) : (
              <>
                {phase === "ready" && !list && (
                  <Button variant="secondary" data-role="see-changes" onClick={() => setView("changes")}>
                    See changes
                  </Button>
                )}
                {(reading || phase === "saving") && jobId ? (
                  <Button variant="secondary" onClick={stop}>
                    Stop
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={requestClose}>
                    Cancel
                  </Button>
                )}
                {phase === "failed" || countError ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (phase === "failed") {
                        void readFiles(choices);
                      } else {
                        setProblem(null);
                        setCountTry((n) => n + 1);
                      }
                    }}
                  >
                    Try again
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    loading={phase === "saving"}
                    disabled={phase !== "ready" || !state.enabled}
                    onClick={() => void runSave()}
                  >
                    {state.label}
                  </Button>
                )}
              </>
            )}
          </div>
          <p className="save-dialog__reason" role="status" aria-live="polite">
            {phase === "ready" ? state.reason : null}
          </p>
        </footer>
      </div>
    </Modal>
  );
}
