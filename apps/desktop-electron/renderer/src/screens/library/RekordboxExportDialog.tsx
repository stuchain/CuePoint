/**
 * "Export to Rekordbox…" (EXPORT-07, DEC-084, DEC-087).
 *
 * One dialog, reached two ways: the Library header opens it with nothing
 * ticked, a Collection's context menu with that node ticked. Both land here,
 * so there is one preview and one confirm path.
 *
 * It is built in the order DEC-084 set — choose, read a computed preview,
 * confirm. It leads with a one-line summary, and always shows what could
 * change the outcome: the destination, a refusal, staleness, and the warnings
 * that alter the file. The rest of what DEC-084 requires is stated behind
 * Details (DEC-247), in the specification's order: the source file, the
 * tracks and what changes in them, the playlists to tick, the notes, and last
 * the key notation with its consequence beside it. Every sentence comes from
 * `rekordboxExport.ts`, over the engine's own answer.
 *
 * **Nothing is written until confirm**, and confirm answers only the preview on
 * screen: changing a tick or the notation asks for a new preview, and the
 * button waits for it. A refusal — a source that is gone, a destination that
 * is the source, a library busy with an import — stands in the preview's
 * place and holds confirm disabled until it is dealt with. The rule is the
 * engine's; the dialog only says it.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  RekordboxExportPreview,
  RekordboxExportRefusal,
  RekordboxExportResult,
  RekordboxKeyFormat,
  RememberedRekordboxExport,
} from "../../api/cuepointBridge.types";
import { rekordboxExportBridge } from "../../api/rekordboxExportBridge";
import { exportHistory, useSharedRead } from "../../api/sharedReads";
import { Button, Modal, MoreAbout } from "../../components";
import { Select } from "../../components/Select";
import type { CollectionTreeNode } from "./collectionTree";
import { followJob, type FollowHandle } from "./followJob";
import { fileName, jobErrorMessage } from "./libraryFormat";
import {
  DEFAULT_EXPORT_KEY_FORMAT,
  EXPORT_KEY_FORMATS,
  OPEN_IN_REKORDBOX,
  canConfirm,
  changeLine,
  confirmBlocker,
  confirmLabel,
  copyLine,
  coveredByFolder,
  exportChoice,
  exportNodeLabel,
  exportSummaryLine,
  exportWarnings,
  fieldLines,
  keyFormatConsequence,
  playlistCount,
  playlistHeadline,
  playlistKindNote,
  refusalStep,
  refusalText,
  resultHeadline,
  sourceLine,
  stalenessWarning,
  trackCountLine,
  unknownTracksLine,
} from "./rekordboxExport";
import { reportUnexpected } from "../../reporting/reporting";
import "./cleanDialogs.css";
import "./rekordboxExport.css";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";

export interface RekordboxExportDialogProps {
  open: boolean;
  /** Ticked when it opens: nothing from the header, the node from its menu. */
  initialIds: readonly number[];
  /** CuePoint's own tree, to tick from. */
  tree: readonly CollectionTreeNode[];
  onClose: () => void;
  /**
   * "Refresh first" (DEC-082): the page closes this and starts a refresh. It
   * does not queue the export to run afterwards, because the refresh may
   * change what the user meant to export.
   */
  onRefreshFirst: () => void;
  /** "Import a Rekordbox file…", for a source that is gone. */
  onImport?: () => void;
  /** Clean's missing-file view, which DEC-088 links the count to. */
  onOpenMissingFiles?: () => void;
}

type Phase = "choosing" | "exporting" | "done";

/** How long ticking waits before asking, so three quick ticks are one preview. */
const PREVIEW_SETTLE_MS = 150;

/** The history read, switched off while the dialog is closed or cannot export. */
const NOT_OPEN = { ...exportHistory(1), available: () => false };

interface Answer {
  /** The request this answers, so a late answer to an old one is recognized. */
  key: string;
  preview: RekordboxExportPreview | null;
  refusal: RekordboxExportRefusal | null;
}

/** The tree flattened for ticking, each row with its depth. */
function rowsOf(tree: readonly CollectionTreeNode[]) {
  const rows: Array<{ node: CollectionTreeNode; depth: number }> = [];
  const walk = (nodes: readonly CollectionTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return rows;
}

export function RekordboxExportDialog({
  open,
  initialIds,
  tree,
  onClose,
  onRefreshFirst,
  onImport,
  onOpenMissingFiles,
}: RekordboxExportDialogProps) {
  const [ticked, setTicked] = useState<ReadonlySet<number>>(() => new Set());
  const [keyFormat, setKeyFormat] = useState<RekordboxKeyFormat>(DEFAULT_EXPORT_KEY_FORMAT);
  /** False until the remembered notation is known, so the first preview uses it. */
  const [ready, setReady] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [previewing, setPreviewing] = useState(false);
  /** Bumped to ask again for the same choices: a retry, a busy job ending. */
  const [asked, setAsked] = useState(0);
  const [destination, setDestination] = useState<string | null>(null);
  /** A refusal of the start, which stands until the destination changes. */
  const [startRefusal, setStartRefusal] = useState<RekordboxExportRefusal | null>(null);
  const [phase, setPhase] = useState<Phase>("choosing");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<RekordboxExportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** The notation last taken from what the engine remembers; null until this opening has one. */
  const seededFormat = useRef<RekordboxKeyFormat | null>(null);
  const alive = useRef(true);
  const following = useRef<FollowHandle[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const handle of following.current) handle.stop();
      following.current = [];
    };
  }, []);

  const bridge = open ? rekordboxExportBridge() : null;

  // A fresh opening is a fresh decision: nothing carried over from last time
  // but what the engine remembers — the folder and the notation (DEC-083).
  const initialKey = initialIds.join(",");
  useEffect(() => {
    if (!open) return;
    setTicked(new Set(initialKey ? initialKey.split(",").map(Number) : []));
    setKeyFormat(DEFAULT_EXPORT_KEY_FORMAT);
    setReady(false);
    seededFormat.current = null;
    setAnswer(null);
    setDestination(null);
    setStartRefusal(null);
    setPhase("choosing");
    setJobId(null);
    setResult(null);
    setProblem(null);
  }, [open, initialKey]);

  // What the engine remembers comes through the shared cache (C19d): an opening
  // finds the last answer at once, and the notation follows a newer one until
  // the person has chosen their own.
  const historyRead = useSharedRead(open && bridge ? exportHistory(1) : NOT_OPEN);
  const remembered: RememberedRekordboxExport | null = open ? (historyRead.value?.remembered ?? null) : null;
  const historySettled = historyRead.unavailable || !historyRead.loading;
  useEffect(() => {
    if (!open || !historySettled) return;
    // A failure is a convenience lost: the dialog works from the default.
    const next = remembered?.key_format ?? DEFAULT_EXPORT_KEY_FORMAT;
    if (seededFormat.current === null || keyFormat === seededFormat.current) {
      setKeyFormat(next);
      seededFormat.current = next;
    }
    setReady(true);
  }, [open, historySettled, remembered, keyFormat]);

  const choice = useMemo(() => exportChoice(tree, ticked), [tree, ticked]);
  const covered = useMemo(() => coveredByFolder(tree, ticked), [tree, ticked]);
  const requestKey = `${choice.join(",")}|${keyFormat}|${asked}`;

  // The preview answers the choices on screen. Asked again whenever they
  // change, after a short settle, and a late answer to an older question is
  // dropped rather than drawn.
  useEffect(() => {
    if (!open || !ready || phase !== "choosing") return;
    const preview = rekordboxExportBridge()?.previewRekordboxExport;
    if (!preview) return;
    let current = true;
    setPreviewing(true);
    // A new question retires a start's refusal about the source or a busy
    // library — the preview will say again if it still stands. A refusal of
    // the destination stands until a different file is chosen.
    setStartRefusal((previous) =>
      previous?.code === "REKORDBOX_EXPORT_DESTINATION_REFUSED" ? previous : null,
    );
    const timer = window.setTimeout(() => {
      preview({ collection_ids: choice, key_format: keyFormat })
        .then((outcome) => {
          if (!current || !alive.current) return;
          setProblem(null);
          setAnswer({ key: requestKey, preview: outcome.preview, refusal: outcome.refusal });
        })
        .catch((cause) => {
          reportUnexpected(cause);
          if (!current || !alive.current) return;
          setAnswer(null);
          setProblem(userMessage(cause));
        })
        .finally(() => {
          if (current && alive.current) setPreviewing(false);
        });
    }, PREVIEW_SETTLE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
      setPreviewing(false);
    };
  }, [open, ready, phase, requestKey, choice, keyFormat]);

  const refusal = startRefusal ?? answer?.refusal ?? null;

  // A busy library is waited for, not reported and left: when the job holding
  // it ends, the preview is asked again by itself.
  const busyJob = refusal?.code === "LIBRARY_BUSY" ? refusal.job_id : null;
  useEffect(() => {
    if (!open || !busyJob) return;
    const handle = followJob(busyJob);
    following.current.push(handle);
    void handle.finished.then(() => {
      following.current = following.current.filter((entry) => entry !== handle);
      if (!alive.current) return;
      setStartRefusal(null);
      setAsked((token) => token + 1);
    });
    return () => handle.stop();
  }, [open, busyJob]);

  const current = answer && answer.key === requestKey ? answer : null;
  const preview = current?.preview ?? null;
  const working = previewing || phase === "exporting";
  const confirmState = {
    preview: previewing ? null : preview,
    refusal,
    destination,
    working,
  };

  const choose = async () => {
    const pick = bridge?.chooseRekordboxExportDestination;
    if (!pick) return;
    try {
      const chosen = await pick({ currentPath: destination });
      if (!alive.current || chosen.canceled) return;
      setDestination(chosen.filePath);
      setStartRefusal(null);
    } catch (cause) {
      reportUnexpected(cause);
      if (alive.current) setProblem(userMessage(cause));
    }
  };

  const toggle = (id: number, on: boolean) => {
    setTicked((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const confirm = async () => {
    if (!bridge || !destination || !canConfirm(confirmState)) return;
    setProblem(null);
    setPhase("exporting");
    try {
      const outcome = await bridge.startRekordboxExport({
        collection_ids: choice,
        key_format: keyFormat,
        destination_path: destination,
      });
      if (!alive.current) return;
      if (outcome.refusal || !outcome.started) {
        setStartRefusal(outcome.refusal);
        setPhase("choosing");
        return;
      }
      const started = outcome.started.job_id;
      setJobId(started);
      const handle = followJob(started);
      following.current.push(handle);
      const finished = await handle.finished;
      following.current = following.current.filter((entry) => entry !== handle);
      if (!alive.current) return;
      const payload = await bridge.getJobResults(started).catch(() => null);
      if (!alive.current) return;
      const answered = (payload?.result as RekordboxExportResult | undefined) ?? null;
      setResult(answered);
      if (!answered) {
        setProblem(
          finished.state === "cancelled"
            ? "Stopped. Nothing was written."
            : finished.state === "failed"
              ? jobErrorMessage(finished.error)
              : "The export finished without saying what it wrote.",
        );
      }
      setPhase("done");
    } catch (cause) {
      reportUnexpected(cause);
      if (!alive.current) return;
      setProblem(userMessage(cause));
      setPhase("choosing");
    } finally {
      if (alive.current) setJobId(null);
    }
  };

  const stop = () => {
    if (jobId) void bridge?.cancelJob(jobId).catch(() => undefined);
  };

  const step = refusal ? refusalStep(refusal) : null;
  const blocker = phase === "choosing" ? confirmBlocker(confirmState) : null;
  const rows = rowsOf(tree);
  const consequence = keyFormatConsequence(keyFormat);
  const staleness = preview ? stalenessWarning(preview.source) : null;
  const warnings = preview ? exportWarnings(preview) : [];
  // What changes the file stays in view; what is only worth knowing sits behind Details.
  const loudWarnings = warnings.filter((warning) => warning.tone === "warning");
  const noteWarnings = warnings.filter((warning) => warning.tone === "note");
  const renderWarning = (warning: (typeof warnings)[number]) => (
    <li
      key={warning.key}
      data-warning={warning.key}
      className={
        warning.tone === "warning"
          ? "rekordbox-export__warning"
          : "rekordbox-export__warning rekordbox-export__warning--note"
      }
    >
      <span>{warning.text}</span>
      {warning.key === "missing" && onOpenMissingFiles && (
        <Button variant="secondary" onClick={onOpenMissingFiles}>
          Show missing files
        </Button>
      )}
    </li>
  );
  const show = window.cuepoint?.showItemInFolder;

  const primary =
    phase === "done"
      ? { label: "Done", onClick: onClose }
      : {
          label: confirmLabel(preview),
          onClick: () => void confirm(),
          disabled: !canConfirm(confirmState),
          loading: phase === "exporting",
        };

  return (
    <Modal
      open={open}
      title="Export to Rekordbox"
      onClose={phase === "exporting" ? () => undefined : onClose}
      size="wide"
      primaryAction={primary}
      secondaryAction={
        phase === "exporting"
          ? jobId
            ? { label: "Stop", onClick: stop }
            : undefined
          : phase === "done"
            ? undefined
            : { label: "Cancel", onClick: onClose }
      }
    >
      <div className="clean-dialog rekordbox-export">
        {!bridge && (
          <p className="clean-dialog__problem" role="alert">{NEEDS_DESKTOP}</p>
        )}

        {phase === "done" ? (
          <section className="clean-dialog__answer" aria-label="Export finished">
            {result && (
              <p className="clean-dialog__headline" role="status">
                {resultHeadline(result)}
              </p>
            )}
            {result?.outcome === "written" && (
              <>
                <p className="rekordbox-export__path" title={result.destination_path}>
                  {result.destination_path}
                </p>
                <p className="clean-dialog__note">{OPEN_IN_REKORDBOX}</p>
                {show && (
                  <div className="clean-dialog__actions">
                    <Button
                      variant="secondary"
                      onClick={() => void show(result.destination_path).catch(() => undefined)}
                    >
                      Show in folder
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            {/* 1. Where it goes. */}
            <section className="rekordbox-export__part" aria-label="Destination">
              <h3 className="rekordbox-export__heading">Save as</h3>
              <div className="rekordbox-export__destination">
                {destination ? (
                  <span className="rekordbox-export__path" title={destination}>
                    {destination}
                  </span>
                ) : (
                  <span className="clean-dialog__note">
                    Not chosen yet
                    {remembered?.folder && remembered.folder_exists
                      ? ` — the save dialog opens in ${remembered.folder}`
                      : ""}
                  </span>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void choose()}
                  disabled={!bridge || phase === "exporting"}
                >
                  {destination ? "Change…" : "Choose…"}
                </Button>
              </div>
            </section>

            {/* A refusal stands in the preview's place and says what to do. */}
            {refusal && (
              <section className="rekordbox-export__refusal" aria-label="Refused">
                <p role="alert">{refusalText(refusal)}</p>
                <div className="clean-dialog__actions">
                  {step === "import" && onImport && (
                    <Button variant="secondary" onClick={onImport}>
                      Import a Rekordbox file…
                    </Button>
                  )}
                  {step === "retry" && (
                    <Button variant="secondary" onClick={() => setAsked((token) => token + 1)}>
                      Try again
                    </Button>
                  )}
                  {step === "choose" && (
                    <Button variant="secondary" onClick={() => void choose()}>
                      Choose another file…
                    </Button>
                  )}
                </div>
              </section>
            )}

            {/* 2. The answer in one line, then what must be seen before anything is written. */}
            {preview && (
              <p className="rekordbox-export__summary" data-testid="export-summary" role="status">
                {exportSummaryLine(preview, keyFormat)}
              </p>
            )}

            {staleness && (
              <section className="rekordbox-export__part" aria-label="Source changed">
                <div className="rekordbox-export__stale" role="alert">
                  <p>{staleness}</p>
                  <Button variant="secondary" onClick={onRefreshFirst}>
                    Refresh first
                  </Button>
                </div>
              </section>
            )}

            {loudWarnings.length > 0 && (
              <section className="rekordbox-export__part" aria-label="Warnings">
                <h3 className="rekordbox-export__heading">Before you export</h3>
                <ul className="rekordbox-export__warnings">
                  {loudWarnings.map(renderWarning)}
                </ul>
              </section>
            )}

            {/* 3. Everything else DEC-084 asks to be stated, one click away (DEC-247). */}
            <MoreAbout label="Details">
              <div className="rekordbox-export__details">
                {preview && (
                  <section className="rekordbox-export__part" aria-label="Source">
                    <h3 className="rekordbox-export__heading">From</h3>
                    <p className="clean-dialog__note" title={preview.source.path}>
                      {sourceLine(preview.source)}
                    </p>
                    {unknownTracksLine(preview) && (
                      <p className="clean-dialog__note">{unknownTracksLine(preview)}</p>
                    )}
                  </section>
                )}

                {preview && (
                  <section className="rekordbox-export__part" aria-label="Tracks">
                    <h3 className="rekordbox-export__heading">Tracks</h3>
                    <p className="clean-dialog__headline" data-testid="export-track-count">
                      {trackCountLine(preview)}
                    </p>
                    <p>{changeLine(preview)}</p>
                    {fieldLines(preview).length > 0 && (
                      <ul className="clean-dialog__lines" aria-label="Changed fields">
                        {fieldLines(preview).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    {copyLine(preview) && (
                      <p className="clean-dialog__note">{copyLine(preview)}</p>
                    )}
                  </section>
                )}

                {/* The playlists: what to tick, and what that appends. */}
                <section className="rekordbox-export__part" aria-label="Playlists">
                  <h3 className="rekordbox-export__heading">Playlists</h3>
                  {rows.length === 0 ? (
                    <p className="clean-dialog__note">
                      You have no Collections or Sets yet, so no playlists are added. To send
                      tracks to Rekordbox as a playlist, add them to a Collection or a Set first.
                    </p>
                  ) : (
                    <fieldset
                      className="rekordbox-export__choose"
                      disabled={phase === "exporting"}
                    >
                      <legend>Collections and Sets to add as playlists</legend>
                      {rows.map(({ node, depth }) => {
                        const implied = covered.has(node.id);
                        return (
                          <label
                            key={node.id}
                            className="clean-dialog__check rekordbox-export__node"
                            style={{ paddingLeft: `calc(${depth} * var(--space-md))` }}
                            title={node.broken ? (node.problem ?? "Its rules cannot be run") : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={implied || ticked.has(node.id)}
                              disabled={implied || node.broken}
                              onChange={(event) => toggle(node.id, event.target.checked)}
                            />
                            <span>{node.name}</span>
                            <span className="rekordbox-export__kind">{exportNodeLabel(node)}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                  {preview && (
                    <>
                      <p data-testid="export-playlist-headline">
                        {playlistHeadline(preview, choice.length)}
                      </p>
                      {preview.playlists.length > 0 && (
                        <ul className="rekordbox-export__playlists" aria-label="Playlists to add">
                          {preview.playlists.map((playlist) => (
                            <li key={`${playlist.collection_id}-${playlist.path}`}>
                              <span className="rekordbox-export__playlist-path">{playlist.path}</span>
                              <span>
                                {playlistCount(playlist)}
                                {playlistKindNote(playlist) ? ` · ${playlistKindNote(playlist)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </section>

                {noteWarnings.length > 0 && (
                  <section className="rekordbox-export__part" aria-label="Notes">
                    <h3 className="rekordbox-export__heading">Good to know</h3>
                    <ul className="rekordbox-export__warnings">
                      {noteWarnings.map(renderWarning)}
                    </ul>
                  </section>
                )}

                {/* Last, the notation, with what choosing it costs (DEC-089). */}
                <section className="rekordbox-export__part" aria-label="Key notation">
                  <Select
                    label="Key notation"
                    value={keyFormat}
                    disabled={phase === "exporting"}
                    onChange={(event) => setKeyFormat(event.target.value as RekordboxKeyFormat)}
                    options={EXPORT_KEY_FORMATS.map((format) => ({ value: format.value, label: format.label }))}
                  />
                  {consequence && (
                    <p className="rekordbox-export__consequence" data-testid="export-key-consequence">
                      {consequence}
                    </p>
                  )}
                </section>
              </div>
            </MoreAbout>

            {previewing && phase === "choosing" && (
              <p className="clean-dialog__note" role="status">
                Working out what the export would write… nothing is written yet.
              </p>
            )}
            {phase === "exporting" && (
              <p className="clean-dialog__note" role="status">
                Exporting{destination ? ` to ${fileName(destination)}` : ""}… the file appears
                only once it is complete.
              </p>
            )}
            {blocker && !previewing && (
              <p className="clean-dialog__hint" data-testid="export-blocker">
                {blocker}
              </p>
            )}
          </>
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
