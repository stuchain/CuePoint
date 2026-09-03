/**
 * The Library page (LIBRARY-11) — the first user-facing library surface.
 *
 * What it is: what the library holds, where it came from, and the two things a
 * user does with it — import a collection, and refresh it through DEC-032's
 * preview.
 *
 * What it is deliberately **not**: a track table. Phase 4 builds browsing,
 * filtering and the Universal Track Table. Counts and controls belong here;
 * rows do not, and the pull to start listing tracks is the phase boundary being
 * crossed.
 *
 * It draws no progress bar either. SHELL-07's status strip already reports
 * every running job with a live percentage, and a second display would be a
 * second thing to keep in step with the job payload for nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Panel, useToast } from "../../components";
import type {
  LibrarySummary,
  RefreshApplied,
  RefreshDiff,
} from "../../api/cuepointBridge.types";
import { followJob } from "./followJob";
import {
  appliedLine,
  fileName,
  formatWhen,
  jobErrorMessage,
  pluralize,
  sourceState,
  sourceStateMessage,
} from "./libraryFormat";
import { RefreshPreviewDialog } from "./RefreshPreviewDialog";
import "../screens.css";
import "./library.css";

/** What the page is doing, when it is doing something. */
type Busy = null | "importing" | "checking" | "applying";

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  importing: "Importing…",
  checking: "Checking…",
  applying: "Refreshing…",
};

export interface LibraryScreenProps {
  /** Opens the "how do I export from Rekordbox" dialog the shell owns. */
  onOpenRekordboxInstructions?: () => void;
}

export function LibraryScreen({ onOpenRekordboxInstructions }: LibraryScreenProps) {
  const { push } = useToast();
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [diff, setDiff] = useState<RefreshDiff | null>(null);
  const [lastApplied, setLastApplied] = useState<RefreshApplied | null>(null);

  // Every job this screen is waiting on, so leaving the page stops the wait
  // rather than resolving into a component that is gone.
  const watching = useRef<{ stop: () => void }[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const handle of watching.current) handle.stop();
      watching.current = [];
    };
  }, []);

  const loadSummary = useCallback(async () => {
    const bridge = window.cuepoint;
    if (!bridge?.getLibrarySummary) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const payload = await bridge.getLibrarySummary();
      if (mounted.current) setSummary(payload);
    } catch (error) {
      if (mounted.current) {
        push(error instanceof Error ? error.message : "Could not read the library", "warning");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  /** Run a job to completion, keeping the page's busy state honest. */
  const run = useCallback(
    async (
      state: Exclude<Busy, null>,
      start: () => Promise<{ job_id: string }>,
    ): Promise<{ jobId: string } | null> => {
      setBusy(state);
      let jobId: string;
      try {
        jobId = (await start()).job_id;
      } catch (error) {
        if (mounted.current) setBusy(null);
        // The engine refuses several things before a job exists — a missing
        // file, a stale diff, another library job already running — and those
        // messages are the useful ones, so they are shown as they arrive.
        push(error instanceof Error ? error.message : "The engine refused that", "warning");
        return null;
      }

      const handle = followJob(jobId);
      watching.current.push(handle);
      const outcome = await handle.finished;
      watching.current = watching.current.filter((entry) => entry !== handle);
      if (!mounted.current) return null;
      setBusy(null);

      if (outcome.state !== "succeeded") {
        push(jobErrorMessage(outcome.error), "warning");
        return null;
      }
      return { jobId };
    },
    [push],
  );

  const pickFile = useCallback(async (): Promise<string | null> => {
    const open = window.cuepoint?.openXmlFileDialog;
    if (!open) {
      push("Choosing a file needs the desktop app.", "warning");
      return null;
    }
    const picked = await open();
    return picked.canceled ? null : picked.filePath;
  }, [push]);

  const handleImport = useCallback(async () => {
    const start = window.cuepoint?.startLibraryImport;
    if (!start) {
      push("Importing needs the desktop app with the engine connected.", "warning");
      return;
    }
    const xmlPath = await pickFile();
    if (!xmlPath) return;

    setLastApplied(null);
    const done = await run("importing", () => start({ xml_path: xmlPath }));
    if (!done) return;
    await loadSummary();
    push("Collection imported.", "success");
  }, [loadSummary, pickFile, push, run]);

  const handleCheck = useCallback(async () => {
    const start = window.cuepoint?.startLibraryRefreshPreview;
    const results = window.cuepoint?.getJobResults;
    if (!start || !results) {
      push("Refreshing needs the desktop app with the engine connected.", "warning");
      return;
    }

    setLastApplied(null);
    const done = await run("checking", () => start({}));
    if (!done) return;

    try {
      const payload = await results(done.jobId);
      const previewed = payload.result as RefreshDiff | undefined;
      if (!previewed) {
        push("The check finished without a result.", "warning");
        return;
      }
      if (mounted.current) setDiff(previewed);
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not read the preview", "warning");
    }
  }, [push, run]);

  const handleApply = useCallback(
    async ({ confirmReferences }: { confirmReferences: boolean }) => {
      const start = window.cuepoint?.startLibraryRefreshApply;
      const results = window.cuepoint?.getJobResults;
      if (!start || !results || !diff) return;

      const done = await run("applying", () =>
        start({ diff_id: diff.diff_id, confirm_references: confirmReferences }),
      );
      // The dialog closes either way. A refusal is already a toast, and leaving
      // a preview open over a library that may have moved on would invite a
      // second press against numbers that no longer hold.
      if (mounted.current) setDiff(null);
      if (!done) return;

      try {
        const payload = await results(done.jobId);
        if (mounted.current) setLastApplied((payload.result as RefreshApplied) ?? null);
      } catch {
        // The refresh succeeded; not being able to read its receipt is not a
        // failure worth reporting as one.
      }
      await loadSummary();
      push("Library refreshed.", "success");
    },
    [diff, loadSummary, push, run],
  );

  const source = summary?.source ?? null;
  const state = source ? sourceState(source) : null;
  const disabled = busy !== null;

  return (
    <div className="screen screen--stack screen--scroll library-screen">
      <header className="library-screen__header">
        <h1 className="screen__title">Library</h1>
        <p className="screen__subtitle">
          Your Rekordbox collection, as CuePoint sees it.
        </p>
      </header>

      {loading ? (
        <p className="library-screen__loading">Reading your library…</p>
      ) : source === null ? (
        <Panel title="No collection imported yet">
          <p className="library-screen__empty">
            CuePoint works from a Rekordbox XML export. Import one and it will
            remember where it came from, so refreshing later takes one click.
          </p>
          <div className="library-screen__actions">
            <Button variant="primary" onClick={() => void handleImport()} disabled={disabled}>
              {busy === "importing" ? BUSY_LABEL.importing : "Import a collection…"}
            </Button>
            {onOpenRekordboxInstructions && (
              <Button variant="secondary" onClick={onOpenRekordboxInstructions}>
                How do I export one?
              </Button>
            )}
          </div>
        </Panel>
      ) : (
        <>
          <Panel
            title="What CuePoint holds"
            badge={
              state === "changed" || state === "missing" ? (
                <Badge variant="warning">Out of date</Badge>
              ) : state === "unknown" ? (
                <Badge variant="default">Unverified</Badge>
              ) : (
                <Badge variant="success">Up to date</Badge>
              )
            }
          >
            <dl className="stats-grid library-screen__stats">
              <div>
                <dt>Tracks</dt>
                <dd data-testid="library-track-count">
                  {pluralize(summary!.track_count, "track")}
                </dd>
              </div>
              <div>
                <dt>Playlists</dt>
                <dd>{pluralize(summary!.playlist_count, "playlist")}</dd>
              </div>
              <div>
                <dt>Playlist entries</dt>
                <dd>
                  {pluralize(summary!.playlist_entry_count, "entry", "entries")}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Where it came from">
            <p className="library-screen__source" title={source.xml_path}>
              <strong>{fileName(source.xml_path)}</strong>
              <span className="library-screen__path">{source.xml_path}</span>
            </p>
            <p className="library-screen__imported">
              Imported {formatWhen(source.imported_at)}
            </p>
            <p
              className={
                state === "unchanged"
                  ? "library-screen__state"
                  : "library-screen__state library-screen__state--attention"
              }
              role={state === "unchanged" ? undefined : "status"}
            >
              {sourceStateMessage(state!)}
            </p>
            <div className="library-screen__actions">
              <Button variant="primary" onClick={() => void handleCheck()} disabled={disabled}>
                {busy === "checking" || busy === "applying"
                  ? BUSY_LABEL[busy]
                  : "Check for changes"}
              </Button>
              <Button variant="secondary" onClick={() => void handleImport()} disabled={disabled}>
                {busy === "importing" ? BUSY_LABEL.importing : "Import a different collection…"}
              </Button>
            </div>
            {lastApplied && (
              <p className="library-screen__applied" role="status">
                {appliedLine(lastApplied)}
              </p>
            )}
          </Panel>
        </>
      )}

      <RefreshPreviewDialog
        open={diff !== null}
        diff={diff}
        applying={busy === "applying"}
        onCancel={() => setDiff(null)}
        onApply={(options) => void handleApply(options)}
      />
    </div>
  );
}
