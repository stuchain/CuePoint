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
import { countNoun } from "../../format/counts";
import { displayPath, displayPathNameFirst } from "../../format/paths";
import { Notice } from "../../components/Notice";
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
import { RETRY, SYNC_TO_FILES } from "../../format/words";
import "./cleanDialogs.css";
import "./rekordboxExport.css";
import { needsDesktopApp, userMessage } from "../../api/userMessage";
import { Hint } from "../../components/Hint";

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

/** The Collections and Sets last exported, kept so the next opening starts with them ticked (M513). */
const TICKED_KEY = "cuepoint-export-ticked";

function rememberedTicks(): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TICKED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function rememberTicks(ids: readonly number[]): void {
  try {
    window.localStorage.setItem(TICKED_KEY, JSON.stringify(ids));
  } catch {
    // A convenience: not remembered means ticking again.
  }
}

/** The one name every export uses (M512), shown before the folder is chosen. */
const EXPORT_FILE_NAME = "CuePoint Export.xml";

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
  // Focus starts on Choose file, the step the dialog is for, not on the brightest button (M258).
  const chooseRef = useRef<HTMLButtonElement>(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;

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
    // From a Collection's menu that node alone; from the header what was ticked last time, for those still there (M513).
    const known = new Set(rowsOf(treeRef.current).map(({ node }) => node.id));
    setTicked(
      new Set(initialKey ? initialKey.split(",").map(Number) : rememberedTicks().filter((id) => known.has(id))),
    );
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
  // M513: "N playlists · Change" opens the details on the tick list; each press is a new opening.
  const [detailsAsked, setDetailsAsked] = useState(0);
  const playlistsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) setDetailsAsked(0);
  }, [open]);
  useEffect(() => {
    if (detailsAsked === 0) return;
    const part = playlistsRef.current;
    part?.scrollIntoView?.({ block: "nearest" });
    part?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
  }, [detailsAsked]);
  const covered = useMemo(() => coveredByFolder(tree, ticked), [tree, ticked]);
  const choiceKey = choice.join(",");
  const requestKey = `${choiceKey}|${keyFormat}|${asked}`;

  // The preview answers the choices on screen. Asked again whenever they
  // change, after a short settle, and a late answer to an older question is
  // dropped rather than drawn. Keyed by what is asked, not by the tree's
  // identity: a background re-read of the same tree is not a new question, and
  // asking again would grey Export for the settle and swallow a click on it.
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
      const ids = choiceKey ? choiceKey.split(",").map(Number) : [];
      preview({ collection_ids: ids, key_format: keyFormat })
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
  }, [open, ready, phase, requestKey, choiceKey, keyFormat]);

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
    working,
  };

  /** The native save dialog; the file chosen, or null when it was cancelled or could not open. */
  const choose = async (): Promise<string | null> => {
    const pick = bridge?.chooseRekordboxExportDestination;
    if (!pick) return null;
    try {
      const chosen = await pick({ currentPath: destination });
      if (!alive.current || chosen.canceled) return null;
      setDestination(chosen.filePath);
      setStartRefusal(null);
      return chosen.filePath;
    } catch (cause) {
      reportUnexpected(cause);
      if (alive.current) setProblem(userMessage(cause));
      return null;
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
    if (!bridge || !canConfirm(confirmState)) return;
    // Export opens the save dialog itself when no file is chosen yet, and goes on with the one chosen (M258).
    const file = destination ?? (await choose());
    if (!file || !alive.current) return;
    setProblem(null);
    setPhase("exporting");
    rememberTicks(Array.from(ticked));
    try {
      const outcome = await bridge.startRekordboxExport({
        collection_ids: choice,
        key_format: keyFormat,
        destination_path: file,
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
  const suggested = remembered?.folder && remembered.folder_exists ? displayPathNameFirst(`${remembered.folder}/${EXPORT_FILE_NAME}`) : EXPORT_FILE_NAME;
  const rows = rowsOf(tree);
  const consequence = keyFormatConsequence(keyFormat);
  const staleness = preview ? stalenessWarning(preview.source) : null;
  const warnings = preview ? exportWarnings(preview) : [];
  // What changes the file stays in view; what is only worth knowing sits behind Details.
  const loudWarnings = warnings.filter((warning) => warning.tone === "warning");
  const noteWarnings = warnings.filter((warning) => warning.tone === "note");
  const renderWarning = (warning: (typeof warnings)[number]) => (
    <Notice
      key={warning.key}
      data-warning={warning.key}
      kind={warning.tone === "warning" ? "warning" : "info"}
      action={
        warning.key === "missing" && onOpenMissingFiles ? (
          <Button variant="secondary" onClick={onOpenMissingFiles}>
            Show missing files
          </Button>
        ) : undefined
      }
    >
      {warning.text}
    </Notice>
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
          variant: "write" as const,
        };

  return (
    <Modal
      open={open}
      title="Export to Rekordbox"
      onClose={onClose}
      size="medium"
      // The × and Escape wait for the export, and the × says why (C112).
      closeDisabled={phase === "exporting"}
      closeReason="Press Stop first"
      // Why Export is greyed: one line above the footer.
      reason={blocker && !previewing ? blocker : undefined}
      initialFocus={chooseRef}
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
        {!bridge && <Notice kind="danger">{needsDesktopApp()}</Notice>}

        {phase === "done" ? (
          <section className="clean-dialog__answer" aria-label="Export finished">
            {result && (
              <p className="clean-dialog__headline" role="status">
                {resultHeadline(result)}
              </p>
            )}
            {result?.outcome === "written" && (
              <>
                <Hint text={displayPath(result.destination_path, { keepHome: true })}>
                  <p className="rekordbox-export__path">{displayPathNameFirst(result.destination_path)}</p>
                </Hint>
                {result.backup_path && (
                  <p className="clean-dialog__note">
                    The file it replaced is kept as {displayPathNameFirst(result.backup_path)}.
                  </p>
                )}
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
            {/* 1. Where it goes: one row, the name and where it will be, then Choose file… / Change…. */}
            <section className="rekordbox-export__part" aria-label="Destination">
              <h3 className="rekordbox-export__heading cp-text-label">Save as</h3>
              {/* M514: what this is, beside Sync to files (the plan's "Save to files" is a retired
                  word, D3: the shared one is used). */}
              <p className="cp-modal__lead">
                {`Makes the file Rekordbox imports. It does not change your music files; ${SYNC_TO_FILES} writes tags into them.`}
              </p>
              <div className="rekordbox-export__destination">
                <Hint text={destination ? displayPath(destination, { keepHome: true }) : undefined} inline>
                  <span className="rekordbox-export__path">
                    {destination ? displayPathNameFirst(destination) : suggested}
                  </span>
                </Hint>
                <Button
                  ref={chooseRef}
                  variant="secondary"
                  onClick={() => void choose()}
                  disabled={!bridge || phase === "exporting"}
                >
                  {destination ? "Change…" : "Choose file…"}
                </Button>
              </div>
            </section>

            {/* A refusal stands in the preview's place and says what to do. */}
            {refusal && (
              <section aria-label="Refused">
                <Notice
                  kind="danger"
                  action={
                    <>
                      {step === "import" && onImport && (
                        <Button variant="secondary" onClick={onImport}>
                          Import a Rekordbox file…
                        </Button>
                      )}
                      {step === "retry" && (
                        <Button variant="secondary" onClick={() => setAsked((token) => token + 1)}>
                          {RETRY}
                        </Button>
                      )}
                      {step === "choose" && (
                        <Button variant="secondary" onClick={() => void choose()}>
                          Choose another file…
                        </Button>
                      )}
                    </>
                  }
                >
                  {refusalText(refusal)}
                </Notice>
              </section>
            )}

            {/* 2. The answer in one line, then what must be seen before anything is written. */}
            {preview && (
              <p className="cp-prose cp-prose--body rekordbox-export__summary" data-testid="export-summary" role="status">
                {exportSummaryLine(preview, keyFormat)}
              </p>
            )}

            {/* M513: the playlists chosen, in one line, with the way to the tick list. */}
            {rows.length > 0 && (
              <p className="rekordbox-export__chosen" data-testid="export-chosen">
                {choice.length === 0 ? "No playlists" : countNoun(choice.length, "playlist")}
                {" · "}
                <button
                  type="button"
                  className="cp-link"
                  disabled={phase === "exporting"}
                  onClick={() => setDetailsAsked((asked) => asked + 1)}
                >
                  Change
                </button>
              </p>
            )}

            {staleness && (
              <section aria-label="Source changed">
                <Notice
                  kind="warning"
                  action={
                    <Button variant="secondary" onClick={onRefreshFirst}>
                      Refresh first
                    </Button>
                  }
                >
                  {staleness}
                </Notice>
              </section>
            )}

            {loudWarnings.length > 0 && (
              <section className="rekordbox-export__part" aria-label="Warnings">
                <h3 className="rekordbox-export__heading cp-text-label">Before you export</h3>
                <div className="rekordbox-export__warnings">{loudWarnings.map(renderWarning)}</div>
              </section>
            )}

            {/* 3. Everything else DEC-084 asks to be stated, one click away (DEC-247). */}
            <MoreAbout key={detailsAsked} label="What goes in the file" defaultOpen={detailsAsked > 0}>
              <div className="rekordbox-export__details">
                {preview && (
                  <section className="rekordbox-export__part" aria-label="Source">
                    <h3 className="rekordbox-export__heading cp-text-label">From</h3>
                    <Hint text={preview.source.path}>
                      <p className="clean-dialog__note">{sourceLine(preview.source)}</p>
                    </Hint>
                    {unknownTracksLine(preview) && (
                      <p className="clean-dialog__note">{unknownTracksLine(preview)}</p>
                    )}
                  </section>
                )}

                {preview && (
                  <section className="rekordbox-export__part" aria-label="Tracks">
                    <h3 className="rekordbox-export__heading cp-text-label">Tracks</h3>
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
                <section ref={playlistsRef} className="rekordbox-export__part" aria-label="Playlists">
                  <h3 className="rekordbox-export__heading cp-text-label">Playlists</h3>
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
                        // Why a row cannot be ticked: a hint on the row, and the same words
                        // beside its name so they are not for the pointer alone (C114).
                        const why = node.broken
                          ? (node.problem ?? "Its rules cannot be run")
                          : implied
                            ? "Added with its folder"
                            : undefined;
                        return (
                          <Hint key={node.id} text={why}>
                            <label
                              className="cp-check clean-dialog__check rekordbox-export__node"
                              style={{ paddingLeft: `calc(${depth} * var(--space-md))` }}
                            >
                              <input
                                type="checkbox"
                                checked={implied || ticked.has(node.id)}
                                disabled={implied || node.broken}
                                onChange={(event) => toggle(node.id, event.target.checked)}
                              />
                              <span>{node.name}</span>
                              {why && <span className="rekordbox-export__reason">{why}</span>}
                              <span className="rekordbox-export__kind">{exportNodeLabel(node)}</span>
                            </label>
                          </Hint>
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
                    <h3 className="rekordbox-export__heading cp-text-label">Good to know</h3>
                    <div className="rekordbox-export__warnings">{noteWarnings.map(renderWarning)}</div>
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
          </>
        )}

        {problem && <Notice kind="danger">{problem}</Notice>}
      </div>
    </Modal>
  );
}
