/**
 * "Write tags to files…" (CLEAN-13, DEC-070).
 *
 * The one control in the app that writes outside CuePoint's database, so it is
 * built in the order DEC-070 set: choose what to write, preview it — a read
 * that changes nothing — read the answer, and only then write. Changing an
 * option after a preview throws the preview away, because Write acts on the
 * statement a person read and not on a new one. After a write the dialog
 * offers Restore, which puts every value back.
 *
 * A preview or a write large enough to be a job is followed like every job:
 * the status strip shows its progress, and this waits for its answer.
 */
import { useEffect, useRef, useState } from "react";

import type {
  BatchSelection,
  TagRestoreResult,
  TagWritePreview,
  TagWriteResult,
} from "../../api/cuepointBridge.types";
import { Button, Modal } from "../../components";
import { followJob } from "./followJob";
import { jobErrorMessage } from "./libraryFormat";
import {
  DEFAULT_TAG_OPTIONS,
  KEY_FORMATS,
  RELOAD_TAG_REMINDER,
  TAG_FIELDS,
  canWrite,
  fieldLines,
  fieldName,
  optionsProblem,
  previewHeadline,
  restoreHeadline,
  skippedLines,
  writeHeadline,
  type DialogTagOptions,
} from "./tagWriting";
import "./cleanDialogs.css";

export interface WriteTagsDialogProps {
  open: boolean;
  selection: BatchSelection | null;
  count: number;
  onClose: () => void;
  /** Called after a write or a restore touched files. */
  onChanged: () => void;
}

type Phase =
  | "choosing"
  | "previewing"
  | "previewed"
  | "writing"
  | "written"
  | "restoring"
  | "restored";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The result a finished job answered, or a sentence saying why there is none. */
async function jobResult<T>(jobId: string): Promise<T> {
  const handle = followJob(jobId);
  const finished = await handle.finished;
  if (finished.state === "failed") throw new Error(jobErrorMessage(finished.error));
  const read = window.cuepoint?.getJobResults;
  if (!read) throw new Error("The engine is not connected.");
  const payload = await read(jobId);
  if (payload.result == null) {
    throw new Error(
      finished.state === "cancelled" ? "Stopped before it had an answer." : "The job answered nothing.",
    );
  }
  return payload.result as T;
}

export function WriteTagsDialog({ open, selection, count, onClose, onChanged }: WriteTagsDialogProps) {
  const [options, setOptions] = useState<DialogTagOptions>(DEFAULT_TAG_OPTIONS);
  const [phase, setPhase] = useState<Phase>("choosing");
  const [preview, setPreview] = useState<TagWritePreview | null>(null);
  const [written, setWritten] = useState<TagWriteResult | null>(null);
  const [restored, setRestored] = useState<TagRestoreResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  /** The write this dialog started, kept even when it did not finish. */
  const [writeJobId, setWriteJobId] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setOptions(DEFAULT_TAG_OPTIONS);
    setPhase("choosing");
    setPreview(null);
    setWritten(null);
    setRestored(null);
    setProblem(null);
    setJobId(null);
    setWriteJobId(null);
  }, [open]);

  const busy = phase === "previewing" || phase === "writing" || phase === "restoring";

  const change = (patch: Partial<DialogTagOptions>) => {
    setOptions((previous) => ({ ...previous, ...patch }));
    // A preview answers for the options it was asked with, and no others.
    setPreview(null);
    setProblem(null);
    setPhase("choosing");
  };

  const runPreview = async () => {
    const bridge = window.cuepoint?.previewTagWrite;
    if (!bridge || !selection) {
      setProblem("Writing tags needs the desktop app with the engine connected.");
      return;
    }
    const invalid = optionsProblem(options);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    setPhase("previewing");
    try {
      const outcome = await bridge({ selection, options });
      let answer: TagWritePreview;
      if (outcome.preview) {
        answer = outcome.preview;
      } else {
        const id = outcome.job_id ?? outcome.id;
        if (!id) throw new Error("The engine answered without a preview and without a job.");
        setJobId(id);
        answer = await jobResult<TagWritePreview>(id);
      }
      if (!alive.current) return;
      setJobId(null);
      setPreview(answer);
      setPhase("previewed");
    } catch (cause) {
      if (!alive.current) return;
      setJobId(null);
      setProblem(messageOf(cause));
      setPhase("choosing");
    }
  };

  const runWrite = async () => {
    const bridge = window.cuepoint?.startTagWrite;
    if (!bridge || !canWrite(preview)) return;
    setProblem(null);
    setPhase("writing");
    let started: string | null = null;
    try {
      started = (await bridge({ preview_id: preview!.preview_id })).job_id;
      setJobId(started);
      setWriteJobId(started);
      const result = await jobResult<TagWriteResult>(started);
      if (!alive.current) return;
      setWritten(result);
      setPhase("written");
    } catch (cause) {
      if (!alive.current) return;
      setProblem(messageOf(cause));
      // A write that started and then failed may have written files, so it is
      // offered for restoring. One refused before it started wrote nothing,
      // and its preview is gone: the engine writes a preview once.
      if (started) {
        setPhase("written");
      } else {
        setPreview(null);
        setPhase("choosing");
      }
    } finally {
      if (alive.current) setJobId(null);
      if (started) onChanged();
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
      if (!alive.current) return;
      setProblem(messageOf(cause));
      setPhase("written");
    } finally {
      if (alive.current) setJobId(null);
      onChanged();
    }
  };

  const stop = () => {
    if (jobId) void window.cuepoint?.cancelJob(jobId).catch(() => undefined);
  };

  const many = `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;
  const primary =
    phase === "written" || phase === "restored" || phase === "restoring"
      ? { label: "Done", onClick: onClose, disabled: phase === "restoring" }
      : phase === "previewed" || phase === "writing"
        ? {
            label:
              preview && preview.files > 0
                ? `Write ${preview.files.toLocaleString()} ${preview.files === 1 ? "file" : "files"}`
                : "Write",
            onClick: () => void runWrite(),
            disabled: !canWrite(preview),
            loading: phase === "writing",
          }
        : {
            label: "Preview",
            onClick: () => void runPreview(),
            loading: phase === "previewing",
          };

  return (
    <Modal
      open={open}
      title="Write tags to files"
      onClose={busy ? () => undefined : onClose}
      size="wide"
      primaryAction={primary}
      secondaryAction={
        busy && jobId
          ? { label: "Stop", onClick: stop }
          : phase === "written" || phase === "restored"
            ? undefined
            : { label: "Cancel", onClick: onClose }
      }
    >
      <div className="clean-dialog">
        <p className="clean-dialog__lead">
          Writes your values for {many} into the files themselves. A preview comes first, and
          reads the files without changing them.
        </p>

        {(phase === "choosing" || phase === "previewing" || phase === "previewed") && (
          <div className="clean-dialog__options">
            <fieldset className="clean-dialog__group clean-dialog__group--grid" disabled={busy}>
              <legend>Write</legend>
              {TAG_FIELDS.map(({ toggle, label }) => (
                <label key={toggle} className="clean-dialog__check">
                  <input
                    type="checkbox"
                    checked={options[toggle]}
                    onChange={(event) => change({ [toggle]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
              {options.write_comment && (
                <label className="clean-dialog__inline">
                  Comment text
                  <input
                    className="clean-dialog__input"
                    value={options.comment_text}
                    maxLength={255}
                    onChange={(event) => change({ comment_text: event.target.value })}
                  />
                </label>
              )}
              <label className="clean-dialog__check">
                <input
                  type="checkbox"
                  checked={options.embed_missing_artwork}
                  onChange={(event) => change({ embed_missing_artwork: event.target.checked })}
                />
                Add Beatport&rsquo;s artwork to files that have none
              </label>
            </fieldset>
            <label className="clean-dialog__inline">
              Key notation
              <select
                className="clean-dialog__select"
                value={options.key_format}
                disabled={busy || !options.write_key}
                onChange={(event) =>
                  change({ key_format: event.target.value as DialogTagOptions["key_format"] })
                }
              >
                {KEY_FORMATS.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {phase === "previewing" && (
          <p className="clean-dialog__note" role="status">
            Reading the files… nothing is being written.
          </p>
        )}

        {preview && (phase === "previewed" || phase === "writing") && (
          <section className="clean-dialog__answer" aria-label="Preview">
            <p className="clean-dialog__headline" role="status">
              {previewHeadline(preview)}
            </p>
            <ul className="clean-dialog__lines">
              {fieldLines(preview.fields).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {skippedLines(preview.skipped).map((line) => (
                <li key={line} className="clean-dialog__skipped">
                  {line}
                </li>
              ))}
            </ul>
            {preview.changes.length > 0 && (
              <table className="clean-dialog__changes">
                <caption>
                  {preview.changes.length < preview.files
                    ? `The first ${preview.changes.length.toLocaleString()} files`
                    : "Every file"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((change_) => (
                    <tr key={`${change_.track_id}-${change_.file_path}`}>
                      <td title={change_.file_path}>
                        {change_.file_path.split(/[\\/]/).pop() ?? change_.file_path}
                      </td>
                      <td>
                        {Object.entries(change_.fields)
                          .map(([field, values]) => `${fieldName(field)}: ${values.from ?? "—"} → ${values.to}`)
                          .concat(change_.artwork ? ["Artwork added"] : [])
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {phase === "writing" && (
          <p className="clean-dialog__note" role="status">
            Writing… each value is recorded before its file is touched.
          </p>
        )}

        {writeJobId && (phase === "written" || phase === "restoring" || phase === "restored") && (
          <section className="clean-dialog__answer" aria-label="Written">
            <p className="clean-dialog__headline" role="status">
              {written
                ? writeHeadline(written)
                : "The write did not finish. Some files may have been written; restoring puts them back."}
            </p>
            {written && written.problems.length > 0 && (
              <ul className="clean-dialog__lines">
                {written.problems.slice(0, 10).map((entry, index) => (
                  <li key={`${entry.file_path}-${index}`} className="clean-dialog__skipped">
                    {entry.file_path.split(/[\\/]/).pop()}: {entry.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="clean-dialog__note">{RELOAD_TAG_REMINDER}</p>
            {phase !== "restored" && (
              <div className="clean-dialog__actions">
                <Button
                  variant="secondary"
                  loading={phase === "restoring"}
                  onClick={() => void runRestore()}
                >
                  Restore these files
                </Button>
                <span className="clean-dialog__hint">
                  Puts back every value this write replaced. It is also offered in Activity.
                </span>
              </div>
            )}
          </section>
        )}

        {restored && phase === "restored" && (
          <p className="clean-dialog__headline" role="status">
            {restoreHeadline(restored)}
          </p>
        )}

        {problem && (
          <p className="clean-dialog__problem" role="alert">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
