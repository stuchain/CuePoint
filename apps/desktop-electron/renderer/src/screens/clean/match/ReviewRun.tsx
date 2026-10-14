/**
 * Review a run (the Review tab): every track of one search, with what was found for it.
 *
 * Where a match lands when it finishes, and where Past searches opens a run. One list of **all**
 * the run's tracks, not only the ones that need a yes or no: **Status** (To check, Not found,
 * Search failed, Matched, Done), **Your track**, the **Beatport match**, **Differs** (which part
 * differs), a preview, and the quick decision each status offers. The chips with their counts
 * filter it (the engine does the filtering, so they hold for a run bigger than the page), the
 * coloured bar shows the same counts, and **Confirm all N matched** clears the sure ones in one
 * press, after saying which values it will copy. A decided row dims and moves to the bottom.
 *
 * **Clicking a row, or Enter on it, opens Details**, a panel beside the list
 * (`ReviewPanel.tsx`); **Search ›** opens it as a search. The list stays on the left so the place
 * is never lost; deciding in the panel moves to the next undecided track. Rows are ticked to
 * **Correct** a selection at once. When every row is decided the list gives way to "hJ is
 * reviewed" with **Save N to files…**; nothing is written to the files before Save.
 *
 * It is drawn for thousands of rows: only the rows in view exist (a fixed row height, a spacer
 * above and below), one row is in the tab order and the arrows move it. A decision is patched
 * into the row (`useMatchReview`) instead of reading the whole list again, and said in a live
 * region with an **Undo**. What each status is, what differs and the counts are the engine's
 * (`match_review.py`); this draws them and sends each decision (`useReviewDecisions.ts`).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { EntityKind, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { Button, useToast } from "../../../components";
import { PixelIcon } from "../../../components/PixelIcon";
import { useBeatportPreview } from "../../../components/preview/useBeatportPreview";
import { queryShown } from "../../../components/shell/pageActive";
import { matchCommand } from "./matchKeyboard";
import { useMatchTicks } from "./useMatchTicks";
import { ReviewDone } from "./ReviewDone";
import { ReviewPanel, type PanelMode } from "./ReviewPanel";
import {
  acceptAllLabel,
  acceptQuestion,
  bandSegments,
  candidateLine,
  chipsOf,
  decisionLine,
  differsText,
  filterRows,
  isReviewed,
  nextUndecided,
  orderRows,
  reviewCandidateOf,
  reviewedWords,
  statusLabel,
  type ReviewFilter,
} from "./reviewList";
import { useMatchReview, type ReviewSource } from "./useMatchReview";
import { useReviewDecisions } from "./useReviewDecisions";

/** The row height before it has been measured, and the rows drawn beyond the ones in view. */
const ROW_HEIGHT = 42;
const OVERSCAN = 8;
/** A view not yet measured is taken to be this tall, so the first draw holds a screenful. */
const FALLBACK_VIEW = 800;

interface ReviewRunProps {
  /** What is reviewed: one run, one playlist, or (with neither) every matched track. */
  source: ReviewSource;
  /** The name over the list: the playlist, "Whole library". */
  name: string;
  /** Bumped when a match ended or something else changed the tracks, so the list is read again. */
  version: number;
  /** A match runs: Match again and Search again wait, and say why. */
  matching: boolean;
  /** Values ready to go into the files, for Save N to files… when the review is done; unknown (undefined) until the page has counted a run's own. */
  saveCount?: number;
  onSave?: () => void;
  /** ‹ Playlists, and Back to playlists. */
  onBack: () => void;
  /** A decision was made: the page reads its counts again. */
  onChanged: () => void;
  /** Search this one track again (Match again, Search again). */
  onSearchAgain: (track: { id: number; title: string }) => void;
  /** The chip the list opens on: "Not found" from See them ›. */
  initialFilter?: ReviewFilter;
  /** A track to open the details of once the list is read (the Inspector's link). */
  initialTrackId?: number;
  /** Every track is decided: whatever remembered this run for the row can forget it. */
  onReviewed?: () => void;
  /** Whether the details panel is open, so a match that ends does not replace what is being read. */
  onPanelChange?: (open: boolean) => void;
  /** An artist or label page, from the credits in the details. */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
}

/** The panel a row opens: a search for one Beatport had no answer for, else its details. */
function modeFor(row: ReviewTrack): PanelMode {
  return row.status === "not_found" || row.status === "search_failed" ? "search" : "details";
}

/** Whether a row can be ticked: it has a match to correct. */
function selectable(row: ReviewTrack): boolean {
  return row.candidate !== null && (row.status === "to_check" || row.status === "matched");
}

function RowPreview({ row }: { row: ReviewTrack }) {
  const preview = useBeatportPreview(row.candidate ? { kind: "candidate", id: row.candidate.id } : null);
  if (!row.candidate) return null;
  const playing = preview.state === "playing";
  return (
    <button
      type="button"
      className="review-preview"
      aria-label={playing ? `Stop the preview of ${row.title}` : `Play the Beatport preview of ${row.title}`}
      aria-pressed={playing}
      disabled={!preview.canPreview || preview.state === "none" || preview.state === "loading"}
      onClick={preview.toggle}
    >
      <span aria-hidden>{playing ? "■" : "▶"}</span>
    </button>
  );
}

/** What was just done, for the live region: the words, and what Undo takes back. */
interface Said {
  text: string;
  /** The track Undo takes back, and its title for the words; null when there is nothing to undo here. */
  trackId: number | null;
  title: string;
}

export function ReviewRun({
  source,
  name,
  version,
  matching,
  saveCount,
  onSave,
  onBack,
  onChanged,
  onSearchAgain,
  initialFilter = "all",
  initialTrackId,
  onReviewed,
  onPanelChange,
  onOpenEntity,
}: ReviewRunProps) {
  const { push } = useToast();
  const [reads, setReads] = useState(0);
  const [filter, setFilter] = useState<ReviewFilter>(initialFilter);
  const { review, loading, error, hasMore, loadMore, patchTrack } = useMatchReview(source, version + reads, filter);
  const { ticks, toggle } = useMatchTicks();
  const [panel, setPanel] = useState<{ trackId: number; mode: PanelMode } | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [listShown, setListShown] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [confirm, setConfirm] = useState<{ kind: "matched" | "selected" } | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
  const keyMoved = useRef(false);

  const decisions = useReviewDecisions(ticks, () => setReads((count) => count + 1));
  const busy = decisions.busy;

  const rows = useMemo(() => review?.tracks ?? [], [review]);
  const counts = review?.counts ?? { to_check: 0, not_found: 0, search_failed: 0, matched: 0, done: 0 };
  const total = review?.total ?? 0;
  const shown = useMemo(() => orderRows(filterRows(rows, filter)), [rows, filter]);
  const chips = chipsOf(counts, total, { rejected: review?.rejected, disputed: review?.disputed });
  const segments = bandSegments(counts, total);
  const acceptAll = acceptAllLabel(counts.matched);
  const reviewed = isReviewed(counts, total);

  // A chip with nothing left in it (the last one decided) gives way to All.
  useEffect(() => {
    if (filter !== "all" && review && !chips.some((chip) => chip.id === filter)) setFilter("all");
  }, [chips, filter, review]);

  // A tick on a track that has since been decided, or is gone from the list, is not a tick.
  const ticked = useMemo(
    () => new Set(rows.filter((row) => selected.has(row.track_id) && selectable(row)).map((row) => row.track_id)),
    [rows, selected],
  );
  useEffect(() => {
    if (ticked.size !== selected.size) setSelected(ticked);
  }, [selected, ticked]);

  // The row the panel is open on. A re-read that no longer holds it (a filter on Not found, and a
  // search just made it To check) must not close the panel or empty the results the person is
  // reading: the last row seen stands in for it until the panel is closed.
  const seen = useRef<ReviewTrack | null>(null);
  const found = panel ? rows.find((row) => row.track_id === panel.trackId) : undefined;
  if (found) seen.current = found;
  const panelRow = panel ? (found ?? (seen.current?.track_id === panel.trackId ? seen.current : null)) : null;
  useEffect(() => {
    onPanelChange?.(panel !== null);
  }, [onPanelChange, panel]);

  // Closing the panel hands the keyboard back to the row that opened it.
  const wasOpen = useRef<number | null>(null);
  useEffect(() => {
    if (panel === null && wasOpen.current !== null) {
      const row = tableRef.current?.querySelector<HTMLElement>(`[data-track-id="${wasOpen.current}"]`);
      row?.focus({ preventScroll: true });
    }
    wasOpen.current = panel?.trackId ?? null;
  }, [panel]);

  const open = useCallback((row: ReviewTrack, mode: PanelMode = modeFor(row)) => {
    setCurrent(row.track_id);
    setPanel({ trackId: row.track_id, mode });
  }, []);

  // Opened on a track (the Inspector's link): its details, once the list has it.
  const focused = useRef(false);
  useEffect(() => {
    if (initialTrackId === undefined || focused.current || !review) return;
    focused.current = true;
    const row = rows.find((entry) => entry.track_id === initialTrackId);
    if (row) open(row);
  }, [initialTrackId, open, review, rows]);

  // Every track decided: said once, so the run is not offered to the row again.
  const reviewedSaid = useRef(false);
  useEffect(() => {
    if (!review || !isReviewed(review.counts, review.total) || reviewedSaid.current) return;
    reviewedSaid.current = true;
    onReviewed?.();
  }, [onReviewed, review]);

  // ----------------------------------------------------------- the rows in view

  const listRead = review !== null;
  const measure = useCallback(() => {
    const node = tableRef.current;
    if (!node) return;
    setViewHeight(node.clientHeight);
    const first = node.querySelector<HTMLElement>("tbody tr[data-track-id]");
    const height = first?.getBoundingClientRect().height ?? 0;
    if (height > 0) setRowHeight(height);
  }, []);
  useLayoutEffect(() => {
    measure();
    const node = tableRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, listRead]);

  const high = viewHeight > 0 ? viewHeight : FALLBACK_VIEW;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(shown.length, Math.ceil((scrollTop + high) / rowHeight) + OVERSCAN);
  const windowRows = shown.slice(start, end);

  // The row the cursor is on stays in view as the arrows move it.
  useEffect(() => {
    const node = tableRef.current;
    if (current === null || !node) return;
    const index = shown.findIndex((row) => row.track_id === current);
    if (index < 0) return;
    const top = index * rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + rowHeight > node.scrollTop + high) node.scrollTop = top + rowHeight - high;
  }, [current, high, rowHeight, shown]);

  // A key that moved the cursor moves the keyboard with it, once the row is drawn.
  useEffect(() => {
    if (!keyMoved.current || current === null || panel) return;
    const row = tableRef.current?.querySelector<HTMLElement>(`[data-track-id="${current}"]`);
    if (row) {
      keyMoved.current = false;
      row.focus({ preventScroll: true });
    }
  });

  const rowAt = useCallback(
    (trackId: number | null, step: -1 | 1): ReviewTrack | null => {
      if (shown.length === 0) return null;
      const at = shown.findIndex((row) => row.track_id === trackId);
      if (at === -1) return shown[step === 1 ? 0 : shown.length - 1]!;
      return shown[Math.max(0, Math.min(shown.length - 1, at + step))]!;
    },
    [shown],
  );

  const move = useCallback(
    (step: -1 | 1) => {
      // With nothing chosen yet the cursor is on the first row, the one in the tab order.
      const target = rowAt(panel?.trackId ?? current ?? shown[0]?.track_id ?? null, step);
      if (!target) return;
      setCurrent(target.track_id);
      if (panel) setPanel({ trackId: target.track_id, mode: modeFor(target) });
      else keyMoved.current = true;
      // The end of what is loaded: read the next page, so the arrows do not stop at a seam.
      if (hasMore && target.track_id === shown[shown.length - 1]?.track_id) loadMore();
    },
    [current, hasMore, loadMore, panel, rowAt, shown],
  );

  // After a decision or a skip in the panel: straight on to the next undecided track.
  const advance = useCallback(
    (fromTrackId: number) => {
      const nextId = nextUndecided(shown, fromTrackId);
      const next = nextId === null || nextId === fromTrackId ? null : rows.find((row) => row.track_id === nextId);
      if (next) open(next);
      else setPanel(null);
    },
    [open, rows, shown],
  );

  // ----------------------------------------------------------- deciding

  const done = useCallback(
    (row: ReviewTrack, kind: "correct" | "not-this" | "leave") => {
      setSaid({ text: decisionLine(kind, row.title), trackId: row.track_id, title: row.title });
      onChanged();
    },
    [onChanged],
  );

  const correct = useCallback(
    async (row: ReviewTrack, candidateId?: number) => {
      const id = candidateId ?? row.candidate?.id;
      if (id === undefined) return;
      const from = row.track_id;
      const result = await decisions.correct(from, id);
      if (!result) return;
      patchTrack(from, { status: "done", decision: "accepted", disputed: false, undo_batch: result.batchId });
      done(row, "correct");
      if (panel?.trackId === from) advance(from);
    },
    [advance, decisions, done, panel, patchTrack],
  );

  const refuse = useCallback(
    async (row: ReviewTrack, kind: "not-this" | "leave" = "not-this") => {
      const from = row.track_id;
      if (!(await decisions.reject(from))) return;
      patchTrack(from, { status: "done", decision: "rejected", disputed: false, undo_batch: null });
      done(row, kind);
      if (panel?.trackId === from) advance(from);
    },
    [advance, decisions, done, panel, patchTrack],
  );

  const undo = useCallback(
    async (trackId: number, title: string) => {
      const row = rows.find((entry) => entry.track_id === trackId);
      // The engine names the batch behind the decision, so Undo takes the values back too.
      if (await decisions.undo(trackId, row?.undo_batch ?? null)) {
        setSaid({ text: decisionLine("undo", title), trackId: null, title });
        onChanged();
      }
    },
    [decisions, onChanged, rows],
  );

  /** Confirm all, or Correct on the ticked rows: after the question, for every id it names. */
  const goConfirmed = useCallback(async () => {
    const asked = confirm;
    if (!asked) return;
    setConfirm(null);
    let ids: number[] = [];
    if (asked.kind === "selected") ids = [...ticked];
    else {
      const read = window.cuepoint?.getMatchReview;
      const answer = read
        ? await read({
            ...(source.jobId ? { jobId: source.jobId } : {}),
            ...(source.playlistId !== undefined ? { playlistId: source.playlistId } : {}),
            filter: "matched",
            idsOnly: true,
          }).catch(() => null)
        : null;
      // Not the rows loaded: they may be a part. Without the engine's answer, nothing is sent.
      if (!answer?.ids) {
        push("CuePoint could not read which tracks are matched. Nothing was confirmed; try again.", "warning");
        return;
      }
      ids = answer.ids;
    }
    if (ids.length === 0) return;
    if (await decisions.acceptMany(ids)) {
      setSelected(new Set());
      setSaid({ text: `Corrected ${ids.length.toLocaleString()} ${ids.length === 1 ? "track" : "tracks"}.`, trackId: null, title: "" });
      onChanged();
    }
  }, [confirm, decisions, onChanged, push, source, ticked]);

  // ----------------------------------------------------------- keys with no panel open

  // With no panel open, ↑ and ↓ still move along the list. A layout effect, as the panel's own is.
  useLayoutEffect(() => {
    if (panel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (queryShown('[role="dialog"], dialog[open], [role="menu"]')) return;
      const which = matchCommand(event);
      if (which !== "previous-track" && which !== "next-track") return;
      event.preventDefault();
      move(which === "next-track" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, panel]);

  // A hand search stored an attempt: the row takes what it found, in place, and the page's counts
  // follow. The list is not read again (under a filter that would drop the row and the panel).
  const searched = useCallback(
    (trackId: number, answer: MatchSearchAnswer) => {
      const pointed = answer.candidates.find((entry) => entry.id === answer.state.candidate_id);
      if (answer.state.state === "needs_review" && pointed) {
        patchTrack(trackId, {
          status: "to_check",
          candidate: reviewCandidateOf(pointed),
          differing: pointed.differing ?? [],
        });
      } else if (answer.failure) {
        patchTrack(trackId, { status: "search_failed" });
      }
      onChanged();
    },
    [onChanged, patchTrack],
  );

  const searchAgain = (row: ReviewTrack) => onSearchAgain({ id: row.track_id, title: row.title });

  if (error && !review) {
    return (
      <section className="review" aria-label={`Review ${name}`}>
        <p className="review__problem" role="alert">
          {error}
        </p>
      </section>
    );
  }
  if (!review) {
    return (
      <section className="review" aria-label={`Review ${name}`}>
        <p className="review__hint">{loading ? "Reading the tracks…" : ""}</p>
      </section>
    );
  }

  if (reviewed && !listShown && filter === "all") {
    return (
      <section className="review" aria-label={`Review ${name}`}>
        <ReviewDone
          {...reviewedWords(name, rows)}
          saveCount={saveCount ?? 0}
          onSave={onSave}
          onBack={onBack}
          onAgain={() => setListShown(true)}
          againLabel="Look through them again"
        />
      </section>
    );
  }

  const matchAgainWhy = matching ? "One match at a time: wait for the one that is running." : undefined;
  const quick = (row: ReviewTrack) => {
    const title = row.title;
    const decide = (
      <>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          aria-label={`Not this: ${title}`}
          onClick={() => void refuse(row)}
        >
          <PixelIcon name="close" /> Not this
        </Button>
        <Button size="sm" variant="secondary" aria-label={`Details of ${title}`} onClick={() => open(row, "details")}>
          Details ›
        </Button>
      </>
    );
    switch (row.status) {
      case "to_check":
        return (
          <>
            <Button
              size="sm"
              className="match-action match-action--correct"
              disabled={busy || !row.candidate}
              aria-label={`Correct: ${title}`}
              onClick={() => void correct(row)}
            >
              <PixelIcon name="clean" /> Correct
            </Button>
            {decide}
          </>
        );
      case "matched":
        return decide;
      case "not_found":
        return (
          <>
            <Button size="sm" variant="secondary" aria-label={`Search for ${title}`} onClick={() => open(row, "search")}>
              Search ›
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              aria-label={`Leave unmatched: ${title}`}
              onClick={() => void refuse(row, "leave")}
            >
              Leave unmatched
            </Button>
          </>
        );
      case "search_failed":
        return (
          <>
            <Button size="sm" variant="secondary" aria-label={`Search for ${title}`} onClick={() => open(row, "search")}>
              Search ›
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || matching}
              title={matchAgainWhy}
              aria-label={`Match again: ${title}`}
              onClick={() => searchAgain(row)}
            >
              Match again
            </Button>
          </>
        );
      case "done":
        return (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            aria-label={`Undo: ${title}`}
            onClick={() => void undo(row.track_id, title)}
          >
            Undo
          </Button>
        );
    }
  };

  const panelPosition = panelRow ? Math.max(1, shown.findIndex((row) => row.track_id === panelRow.track_id) + 1) : 0;
  // One row is in the tab order: the one the cursor is on, or, with it scrolled out of the
  // rows drawn, the first drawn, so the list can always be tabbed into.
  const wanted = current ?? shown[0]?.track_id ?? null;
  const tabStop = windowRows.some((row) => row.track_id === wanted) ? wanted : (windowRows[0]?.track_id ?? null);
  const selectableShown = shown.filter(selectable);
  const allTicked = selectableShown.length > 0 && selectableShown.every((row) => selected.has(row.track_id));
  const columns = panelRow ? 5 : 7;
  const confirmCount = confirm?.kind === "selected" ? ticked.size : counts.matched;

  return (
    <section className="review" aria-label={`Review ${name}`}>
      <div className="review__bar" role="group" aria-label="Review">
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          Playlists
        </Button>
        <strong className="review__name">
          {name} · {total.toLocaleString()} {total === 1 ? "track" : "tracks"}
        </strong>
        <div className="review__chips" role="group" aria-label="Show">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`review-chip review-chip--${chip.id}`}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label} {chip.count.toLocaleString()}
            </button>
          ))}
        </div>
        <span className="review__spacer" />
        {ticked.size > 0 && (
          <Button disabled={busy} onClick={() => setConfirm({ kind: "selected" })}>
            {`Correct ${ticked.size.toLocaleString()} selected`}
          </Button>
        )}
        {acceptAll && (
          <Button
            className="match-action match-action--correct"
            disabled={busy}
            onClick={() => setConfirm({ kind: "matched" })}
          >
            {acceptAll}
          </Button>
        )}
      </div>
      {confirm && (
        <div className="review__confirm" role="group" aria-label="Confirm">
          <span>{acceptQuestion(confirmCount, ticks, confirm.kind === "selected" ? "Correct" : "Confirm")}</span>
          <Button disabled={busy} onClick={() => void goConfirmed()}>
            {confirm.kind === "selected" ? "Correct" : "Confirm"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      )}
      <div
        className="review-band"
        role="img"
        aria-label={segments.map((segment) => `${segment.count.toLocaleString()} ${statusLabel(segment.status).toLowerCase()}`).join(", ")}
      >
        {segments.map((segment) => (
          <span
            key={segment.status}
            className={`review-band__segment review-band__segment--${segment.status}`}
            style={{ width: `${segment.percent}%` }}
          />
        ))}
      </div>
      {/* Always there, so a screen reader hears each decision as it is made. */}
      <p className="review__live" role="status" aria-live="polite">
        {said && (
          <>
            {said.text}
            {said.trackId !== null && (
              <>
                {" "}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void undo(said.trackId!, said.title)}
                >
                  Undo
                </Button>
              </>
            )}
          </>
        )}
      </p>

      <div className={`review__body${panelRow ? " review__body--panel" : ""}`}>
        <div
          className="review__table"
          ref={tableRef}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <table className="review-table" aria-rowcount={shown.length + 1}>
            <caption className="match-visually-hidden">Every track of this search and where it stands</caption>
            <thead>
              <tr aria-rowindex={1}>
                <th scope="col" className="review-col--check">
                  <input
                    type="checkbox"
                    aria-label="Tick every track with a match"
                    checked={allTicked}
                    disabled={selectableShown.length === 0}
                    onChange={() =>
                      setSelected(allTicked ? new Set() : new Set(selectableShown.map((row) => row.track_id)))
                    }
                  />
                </th>
                <th scope="col" className="review-col--status">
                  Status
                </th>
                <th scope="col">Your track</th>
                <th scope="col">Beatport match</th>
                {!panelRow && (
                  <th scope="col" className="review-col--differs">
                    Differs
                  </th>
                )}
                <th scope="col" className="review-col--preview">
                  <span className="match-visually-hidden">Preview</span>
                </th>
                {!panelRow && (
                  <th scope="col" className="review-col--quick">
                    Quick decision
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {start > 0 && (
                <tr role="presentation" aria-hidden style={{ height: start * rowHeight }}>
                  <td colSpan={columns} />
                </tr>
              )}
              {windowRows.map((row, offset) => {
                const differs = differsText(row);
                return (
                  <tr
                    key={row.track_id}
                    data-track-id={row.track_id}
                    data-status={row.status}
                    aria-rowindex={start + offset + 2}
                    className={`review-row${row.status === "done" ? " review-row--done" : ""}${
                      current === row.track_id ? " review-row--current" : ""
                    }`}
                    aria-selected={current === row.track_id || undefined}
                    // One row is in the tab order; the arrows move it.
                    tabIndex={row.track_id === tabStop ? 0 : -1}
                    onClick={(event) => {
                      // A click on a button, a tick or a link inside the row is that control's own.
                      if ((event.target as HTMLElement).closest("button, input, a")) return;
                      open(row);
                    }}
                    onKeyDown={(event) => {
                      // Enter on the row itself opens it; on a button inside it, the button's own.
                      if (event.key === "Enter" && event.target === event.currentTarget && !event.repeat) {
                        event.preventDefault();
                        open(row);
                      }
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Tick ${row.title}`}
                        checked={ticked.has(row.track_id)}
                        disabled={!selectable(row)}
                        onChange={() =>
                          setSelected((now) => {
                            const next = new Set(now);
                            if (next.has(row.track_id)) next.delete(row.track_id);
                            else next.add(row.track_id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <span className={`review-status review-status--${row.status}`}>{statusLabel(row.status)}</span>
                    </td>
                    <td className="review-row__yours">
                      {row.title} · {row.artist}
                    </td>
                    <td className="review-row__theirs">{candidateLine(row.candidate)}</td>
                    {!panelRow && (
                      <td className={`review-row__differs review-row__differs--${differs.tone}`}>{differs.text}</td>
                    )}
                    {/* The preview stays when the panel opens, so a sample keeps playing. */}
                    <td className="review-row__preview">
                      <RowPreview row={row} />
                    </td>
                    {!panelRow && <td className="review-row__quick">{quick(row)}</td>}
                  </tr>
                );
              })}
              {end < shown.length && (
                <tr role="presentation" aria-hidden style={{ height: (shown.length - end) * rowHeight }}>
                  <td colSpan={columns} />
                </tr>
              )}
            </tbody>
          </table>
          {shown.length === 0 && <p className="review__hint">Nothing here.</p>}
          {hasMore && (
            <div className="review__more">
              <Button variant="secondary" onClick={loadMore}>
                {`Show more (${(review.matching - rows.length).toLocaleString()} more)`}
              </Button>
            </div>
          )}
        </div>
        {panelRow && panel && (
          <ReviewPanel
            row={panelRow}
            mode={panel.mode}
            position={panelPosition}
            total={shown.length}
            version={version + reads}
            busy={busy}
            matching={matching}
            ticks={ticks}
            onToggleTick={toggle}
            onClose={() => setPanel(null)}
            onPrevious={() => move(-1)}
            onNext={() => move(1)}
            onSkip={() => advance(panelRow.track_id)}
            onCorrect={(candidateId) => void correct(panelRow, candidateId)}
            onNotThis={() => void refuse(panelRow, panel.mode === "search" ? "leave" : "not-this")}
            onSearchAgain={() => searchAgain(panelRow)}
            onMessage={(text) => push(text, "info")}
            onOpenEntity={onOpenEntity}
            onSearched={searched}
          />
        )}
      </div>
    </section>
  );
}
