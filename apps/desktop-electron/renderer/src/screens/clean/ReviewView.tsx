/**
 * The review queue (CLEAN-12, DEC-072, DEC-041).
 *
 * A `TrackTable` over the Library's own windowed browse, scoped by match state
 * and by where in the library — no second query path and no in-memory source.
 * Selecting a row puts the track beside its candidates underneath; the
 * Inspector says everything else about it, as in the Library.
 *
 * **The keyboard reviews.** Up and down move through the queue, left and right
 * choose a candidate, A accepts, R rejects, N moves on. A decision takes the
 * track out of a "needs review" queue, so the cursor stays at the same place
 * and the next track moves into it — which is only right once the queue has
 * been read again, so the page waits for that answer before selecting.
 *
 * **Matching is a job the status strip follows**, like every job. The page
 * waits for it to end to read the queue again, and says what it started.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BatchSelection,
  LibraryHealth,
  LibraryTrackRow,
  MatchCandidate,
  MatchStarted,
  OverrideField,
  ReviewExportFormat,
} from "../../api/cuepointBridge.types";
import { Button, Modal, useToast } from "../../components";
import { Select } from "../../components/Select";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { useInspectorSlot } from "../../components/shell";
import { SelectionActions } from "../library/SelectionActions";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { batchSelection } from "../library/libraryBatch";
import { queryKey, type SortDirection } from "../library/libraryQuery";
import { copySummary, tracksAsText, writeClipboard } from "../library/trackClipboard";
import { EMPTY_SELECTION, onlySelectedId, selectAll } from "../library/trackSelection";
import { useTrackDetail } from "../library/useTrackDetail";
import { useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";
import { REVIEW_COLUMNS, REVIEW_TABLE_LAYOUT_KEY } from "./cleanColumns";
import { reviewEmptyState } from "./cleanEmpty";
import {
  appliedLine,
  decidedLine,
  exportedLine,
  matchStartedLine,
  resumableLine,
  trackCount,
} from "./cleanFormat";
import {
  DEFAULT_REVIEW_SCOPE,
  REVIEW_SCOPES,
  WHOLE_LIBRARY,
  cleanQuery,
  isReviewScope,
  reviewRules,
  type ReviewScope,
} from "./cleanRules";
import { ComparisonPanel } from "./ComparisonPanel";
import {
  APPLY_FIELD_LABELS,
  defaultChoice,
  stepChoice,
  visibleCandidates,
} from "./comparison";
import { revealTrack } from "./revealTrack";
import { reviewCommand, type ReviewCommand } from "./reviewKeyboard";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { useScopeOptions } from "./useScopeOptions";
import { useResumableMatches } from "./useResumableMatches";
import { useTrackMatches } from "./useTrackMatches";
import type { CleanOpening } from "./cleanLink";

const PLAIN = { shiftKey: false, ctrlKey: false, metaKey: false };

const EXPORT_FORMATS: Array<{ value: ReviewExportFormat; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel" },
  { value: "json", label: "JSON" },
];

/**
 * A row to select once the queue can show it.
 *
 * `from` is the question the queue was answering when the move was asked for.
 * After a decision the queue is read again, and the row at the cursor is only
 * the next track once that new answer has landed; until then it is the track
 * just decided. A move with nothing re-read waits only for its row to load.
 */
interface PendingMove {
  index: number;
  from: string | null;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface ReviewViewProps {
  health: LibraryHealth | null;
  onHealthChanged: () => void;
  /**
   * A track the Library asked to open (CLEAN-13). The queue is set to the
   * track's own state, and the comparison shows it until a row is chosen.
   */
  focus?: CleanOpening | null;
}

export function ReviewView({ health, onHealthChanged, focus = null }: ReviewViewProps) {
  const { push } = useToast();
  const [scope, setScope] = useState<ReviewScope>(DEFAULT_REVIEW_SCOPE);
  const [where, setWhere] = useState(WHOLE_LIBRARY);
  const [order, setOrder] = useState<{ sort: string; dir: SortDirection }>({
    sort: "artist",
    dir: "asc",
  });
  const [rematch, setRematch] = useState(false);
  const query = useMemo(() => cleanQuery(where, reviewRules(scope), order), [where, scope, order]);

  const scopes = useScopeOptions();
  const columns = useColumnLayout<LibraryTrackRow>(REVIEW_TABLE_LAYOUT_KEY, REVIEW_COLUMNS);
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const [focused, setFocused] = useState<number | null>(null);
  const trackId = selection.selection.lastId ?? focused;

  // Opened on one track: its own state's queue, the whole library, and the
  // track in the comparison until the reviewer picks a row.
  const focusToken = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focusToken.current === focus.token) return;
    focusToken.current = focus.token;
    setFocused(focus.trackId);
    const read = window.cuepoint?.getLibraryTrack;
    if (!read) return;
    let cancelled = false;
    read({ trackId: focus.trackId })
      .then(({ track }) => {
        if (cancelled) return;
        const state = track.match_disputed ? "disputed" : track.match_state;
        if (state && isReviewScope(state)) setScope(state);
        setWhere(WHOLE_LIBRARY);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [focus]);

  useEffect(() => {
    if (selection.selection.lastId != null) setFocused(null);
  }, [selection.selection.lastId]);
  const cursor = selection.selection.anchor;
  const matches = useTrackMatches(trackId);
  const detail = useTrackDetail(trackId);

  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReviewExportFormat>("csv");
  const [exporting, setExporting] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  // Read again whenever a match ends: a stopped one can be resumed.
  const [matchesEnded, setMatchesEnded] = useState(0);
  const resumable = useResumableMatches(matchesEnded);

  const state = matches.matches?.state ?? null;
  const cursorRow = cursor == null ? null : (window_.source.getRow(cursor) ?? null);
  // The row the panel describes: the one under the cursor while it is still the
  // selected track, and the Inspector's copy of it while the queue is re-read.
  const row =
    trackId == null
      ? null
      : cursorRow?.id === trackId
        ? cursorRow
        : detail.detail?.track.id === trackId
          ? detail.detail.track
          : null;

  // A reviewer's choice survives the candidates being read again — a match
  // ending, Health changing — as long as it is still one of them. Resetting it
  // on every read let a background reload put the choice back to #1 between
  // Right and A, so A accepted a candidate nobody chose (CLEAN-14). A new
  // track or another attempt — the candidates of a different attempt — starts
  // from the default again.
  const choiceAttempt = useRef<number | null>(null);
  useEffect(() => {
    const sameAttempt = choiceAttempt.current === matches.attemptId;
    choiceAttempt.current = matches.attemptId;
    setChosenId((current) =>
      sameAttempt &&
      current != null &&
      matches.candidates.some((candidate) => candidate.id === current)
        ? current
        : defaultChoice(state, matches.candidates),
    );
  }, [matches.attemptId, matches.candidates, state]);

  useEffect(() => {
    setShowAll(false);
  }, [trackId]);

  useEffect(() => {
    setStatus(null);
  }, [scope, where]);

  const shown = useMemo(
    () => visibleCandidates(matches.candidates, showAll, chosenId),
    [chosenId, matches.candidates, showAll],
  );

  // Select the row a move or a decision asked for, once the queue can show it.
  useEffect(() => {
    if (!pending) return;
    if (pending.from !== null && (pending.from === window_.identity || !window_.answered)) return;
    if (pending.from === null && window_.loading) return;
    if (window_.total === 0) {
      selection.clear();
      setPending(null);
      return;
    }
    const index = Math.min(pending.index, window_.total - 1);
    const next = window_.source.getRow(index);
    if (!next) {
      window_.source.requestWindow?.(index, index);
      return;
    }
    selection.onRowClick(next, index, PLAIN);
    setScrollTo(index);
    setPending(null);
  }, [pending, selection, window_]);

  const moveTo = useCallback(
    (index: number) => {
      if (window_.total === 0) return;
      const target = Math.max(0, Math.min(window_.total - 1, index));
      setScrollTo(target);
      const next = window_.source.getRow(target);
      if (next) {
        selection.onRowClick(next, target, PLAIN);
      } else {
        window_.source.requestWindow?.(target, target);
        setPending({ index: target, from: null });
      }
    },
    [selection, window_],
  );

  /** Everything a change to one track makes stale, and the cursor kept in place. */
  const afterChange = useCallback(() => {
    setPending({ index: cursor ?? 0, from: window_.identity });
    window_.reload();
    matches.reload();
    detail.reload();
    onHealthChanged();
  }, [cursor, detail, matches, onHealthChanged, window_]);

  const decide = useCallback(
    async (decision: "accept" | "reject" | "clear", candidate?: MatchCandidate) => {
      if (trackId == null) return;
      const bridge = window.cuepoint?.decideMatch;
      if (!bridge) {
        push("Deciding a match needs the desktop app with the engine connected.", "warning");
        return;
      }
      const title = row?.title ?? "this track";
      setBusy(true);
      try {
        await bridge(
          decision === "accept" && candidate
            ? { decision, track_id: trackId, candidate_id: candidate.id }
            : { decision, track_id: trackId },
        );
      } catch (cause) {
        setBusy(false);
        push(messageOf(cause), "warning");
        return;
      }
      setBusy(false);
      setStatus(decidedLine(decision, title));
      afterChange();
    },
    [afterChange, push, row, trackId],
  );

  const apply = useCallback(
    async (fields: OverrideField[]) => {
      if (trackId == null || fields.length === 0) return;
      const bridge = window.cuepoint?.applyMatch;
      if (!bridge) {
        push("Applying needs the desktop app with the engine connected.", "warning");
        return;
      }
      const title = row?.title ?? "this track";
      setBusy(true);
      try {
        await bridge({ fields, track_id: trackId });
      } catch (cause) {
        setBusy(false);
        push(messageOf(cause), "warning");
        return;
      }
      setBusy(false);
      setStatus(appliedLine(fields.map((field) => APPLY_FIELD_LABELS[field]), title));
      afterChange();
    },
    [afterChange, push, row, trackId],
  );

  const followMatch = useCallback(
    (key: string, start: () => Promise<MatchStarted>) => {
      void jobs.run<MatchStarted>(key, start, {
        started: matchStartedLine,
        succeeded: "Matching finished.",
        onEnded: () => {
          window_.reload();
          matches.reload();
          detail.reload();
          onHealthChanged();
          setMatchesEnded((count) => count + 1);
        },
      });
    },
    [detail, jobs, matches, onHealthChanged, window_],
  );

  const startMatch = useCallback(
    (key: string, target: BatchSelection, again: boolean) => {
      const bridge = window.cuepoint?.startCleanMatch;
      if (!bridge) {
        push("Matching needs the desktop app with the engine connected.", "warning");
        return;
      }
      followMatch(key, () => bridge({ selection: target, rematch: again }));
    },
    [followMatch, push],
  );

  // A match that stopped keeps its plan; resuming asks only about what it had
  // not reached (DEC-065).
  const resumeMatch = useCallback(
    (jobId: string) => {
      const bridge = window.cuepoint?.resumeCleanMatch;
      if (!bridge) return;
      followMatch("resume", () => bridge({ job_id: jobId }));
    },
    [followMatch],
  );

  const everything = useMemo(
    () => batchSelection(selectAll(EMPTY_SELECTION), query),
    [query],
  );

  const command = useCallback(
    (which: ReviewCommand) => {
      switch (which) {
        case "previous-track":
          moveTo((cursor ?? 0) - 1);
          return;
        case "next-track":
        case "skip":
          moveTo(cursor == null ? 0 : cursor + 1);
          return;
        case "previous-candidate":
          setChosenId(stepChoice(shown, chosenId, -1));
          return;
        case "next-candidate":
          setChosenId(stepChoice(shown, chosenId, 1));
          return;
        case "accept": {
          const candidate = shown.find((entry) => entry.id === chosenId);
          if (candidate && !busy) void decide("accept", candidate);
          return;
        }
        case "reject":
          if (trackId != null && !busy) void decide("reject");
          return;
      }
    },
    [busy, chosenId, cursor, decide, moveTo, shown, trackId],
  );

  const dialogOpen = exportOpen || columnsOpen;
  useEffect(() => {
    if (dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const which = reviewCommand(event);
      if (!which) return;
      event.preventDefault();
      command(which);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [command, dialogOpen]);

  const copy = useCallback(async () => {
    setCopying(true);
    try {
      const rows = await selection.gatherRows();
      const text = tracksAsText(columns.visible, rows);
      const wrote = text === "" ? false : await writeClipboard(text);
      push(
        wrote ? copySummary(rows.length, selection.count) : "Could not copy to the clipboard",
        wrote ? "success" : "warning",
      );
    } finally {
      setCopying(false);
    }
  }, [columns.visible, push, selection]);

  const reveal = useCallback(
    (id: number | null) => {
      if (id == null) return;
      void revealTrack(id).then((outcome) => {
        if (outcome) push(outcome.message, outcome.tone);
      });
    },
    [push],
  );

  const exportList = useCallback(async () => {
    const save = window.cuepoint?.saveExportFileDialog;
    const write = window.cuepoint?.exportReviewList;
    if (!save || !write) {
      push("Exporting needs the desktop app with the engine connected.", "warning");
      return;
    }
    const extension = exportFormat === "excel" ? "xlsx" : exportFormat;
    setExporting(true);
    try {
      const picked = await save({ defaultPath: `review-list.${extension}`, format: extension });
      if (picked.canceled) return;
      // The save dialog has already asked about replacing a file that is
      // there, so the engine is told the answer rather than asking again.
      const written = await write({
        selection: selection.count > 0 ? batchSelection(selection.selection, query) : everything,
        format: exportFormat,
        file_path: picked.filePath,
        overwrite: true,
      });
      setExportOpen(false);
      push(exportedLine(written.count, written.file_path), "success");
    } catch (cause) {
      push(messageOf(cause), "warning");
    } finally {
      setExporting(false);
    }
  }, [everything, exportFormat, push, query, selection]);

  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={selection.count}
      onSelectPlaylist={(playlist) => setWhere(`playlist:${playlist.id}`)}
      onSelectCollection={(collection) =>
        setWhere(`${collection.kind === "smart" ? "smart" : "collection"}:${collection.id}`)
      }
      onReveal={() => reveal(trackId)}
      onError={(text) => push(text, "warning")}
      onMessage={(text) => push(text, "success")}
      onTrackChanged={() => {
        window_.reload();
        matches.reload();
        detail.reload();
        onHealthChanged();
      }}
    />,
  );

  const selectedKeys = useMemo(() => {
    const keys = new Set<number>();
    for (let index = 0; index < window_.total; index += 1) {
      const entry = window_.source.getRow(index);
      if (!entry?.id) continue;
      if (selection.selection.all) {
        if (!selection.selection.excluded.has(entry.id)) keys.add(entry.id);
      } else if (selection.selection.ids.has(entry.id)) {
        keys.add(entry.id);
      }
    }
    return keys;
  }, [selection.selection, window_.source, window_.total]);

  const empty = reviewEmptyState({
    scope,
    scoped: where !== WHOLE_LIBRARY,
    health,
    error: window_.error,
  });
  const emptyState = (
    <div className="clean-empty">
      <p className="clean-empty__headline">{empty.headline}</p>
      {empty.hint && <p className="clean-empty__hint">{empty.hint}</p>}
      {empty.offer === "show_not_matched" && (
        <Button variant="secondary" onClick={() => setScope("not_matched")}>
          Show what is not matched
        </Button>
      )}
    </div>
  );

  const revealPath =
    trackId != null && onlySelectedId(selection.selection, window_.total) === trackId && row
      ? row.file_path
      : null;
  const matching = jobs.running !== null;

  return (
    <div className="clean-review">
      <div className="clean-review__head">
        <div className="clean-toolbar" role="toolbar" aria-label="Review queue">
          <Select
            label="Show"
            id="clean-review-scope"
            value={scope}
            onChange={(event) => {
              if (isReviewScope(event.target.value)) setScope(event.target.value);
            }}
            options={REVIEW_SCOPES.map((option) => ({ value: option.id, label: option.label }))}
          />
          <Select
            label="In"
            id="clean-review-where"
            value={where}
            onChange={(event) => setWhere(event.target.value)}
            options={scopes}
          />
          <span className="clean-toolbar__spacer" />
          <label className="clean-toolbar__check">
            <input
              type="checkbox"
              checked={rematch}
              onChange={(event) => setRematch(event.target.checked)}
            />
            Match again what is already matched
          </label>
          <Button
            variant="secondary"
            disabled={selection.count === 0 || matching}
            loading={jobs.running === "match-selection"}
            onClick={() =>
              startMatch("match-selection", batchSelection(selection.selection, query), rematch)
            }
          >
            Match selection
          </Button>
          <Button
            variant="secondary"
            disabled={window_.total === 0 || matching}
            loading={jobs.running === "match-all"}
            onClick={() => startMatch("match-all", everything, rematch)}
          >
            {`Match all ${window_.total.toLocaleString()}`}
          </Button>
          <Button
            variant="secondary"
            disabled={window_.total === 0}
            onClick={() => setExportOpen(true)}
          >
            Export review list…
          </Button>
        </div>
        {resumable.jobs[0] && !matching && Boolean(window.cuepoint?.resumeCleanMatch) && (
          <div className="clean-note clean-note--resume" role="region" aria-label="Resume a match">
            <p className="clean-note__text">{resumableLine(resumable.jobs[0], resumable.total)}</p>
            <div>
              <Button variant="secondary" onClick={() => resumeMatch(resumable.jobs[0]!.job_id)}>
                Resume
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="clean-review__table">
        <TrackTable<LibraryTrackRow>
          columns={columns.visible}
          source={window_.source}
          widths={columns.widths}
          onWidthsChange={columns.setWidths}
          onColumnMove={columns.move}
          sort={{ key: order.sort, direction: order.dir }}
          onSortChange={(next) => setOrder({ sort: next.key, dir: next.direction })}
          selectedKeys={selectedKeys}
          getRowKey={(entry) => entry.id ?? -1}
          onSelect={selection.onRowClick}
          activeIndex={cursor}
          scrollToIndex={scrollTo}
          emptyState={emptyState}
          resetKey={queryKey(query)}
          ariaLabel="Review queue"
        />
      </div>

      <div className="clean-review__selection">
        <SelectionActions
          count={selection.count}
          describedByQuery={selection.selection.all}
          revealPath={revealPath}
          total={window_.total}
          busy={copying}
          onCopy={() => void copy()}
          onReveal={() => reveal(trackId)}
          onClear={selection.clear}
          onSelectAll={selection.selectAllMatching}
        />
        <Button variant="secondary" onClick={() => setColumnsOpen(true)}>
          Columns…
        </Button>
      </div>

      <ComparisonPanel
        row={row}
        matches={matches}
        shown={shown}
        chosenId={chosenId}
        onChoose={setChosenId}
        showAll={showAll}
        onShowAll={setShowAll}
        busy={busy}
        status={status}
        onAccept={(candidate) => void decide("accept", candidate)}
        onReject={() => void decide("reject")}
        onClear={() => void decide("clear")}
        onApply={(fields) => void apply(fields)}
        onRematch={() => trackId != null && startMatch("rematch", { track_ids: [trackId] }, true)}
        onNext={() => command("skip")}
      />

      <ColumnPicker
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={REVIEW_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />

      <Modal
        open={exportOpen}
        title="Export review list"
        onClose={() => setExportOpen(false)}
        primaryAction={{
          label: "Choose where to save…",
          onClick: () => void exportList(),
          loading: exporting,
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setExportOpen(false) }}
      >
        <p>
          {selection.count > 0
            ? `The ${trackCount(selection.count)} selected`
            : `All ${trackCount(window_.total)} shown`}
          , each with where it stands and the match it points at.
        </p>
        <Select
          label="Format"
          id="clean-export-format"
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as ReviewExportFormat)}
          options={EXPORT_FORMATS}
        />
      </Modal>
    </div>
  );
}
