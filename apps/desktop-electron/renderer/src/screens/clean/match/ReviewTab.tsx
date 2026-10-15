/**
 * A review tab (**Review <name>**): one playlist's tracks, with what Beatport matched each with.
 *
 * The plain table (`ReviewTable.tsx`): a tick per track says whether its Beatport values will be
 * synced. Matched tracks start ticked and tracks with no match are not; **unticking leaves a track
 * out**. The tick is kept by the engine as the person's decision, so it stays after leaving the tab.
 * Clicking a row opens its side panel (`CandidatePanel.tsx`) straight on the candidates, where
 * another one is chosen or the track is left out. The green **Sync <name> to files…** at the top
 * opens the Sync window on the ticked tracks (`SyncPlaylistDialog.tsx`). Nothing is written to a
 * value or a file before Sync.
 *
 * Up and Down move along the table (the panel follows) and Esc closes the panel, handing the
 * keyboard back to the row. Every tick and choice is said in a live region. What each status is,
 * what differs, what is ticked and the counts are the engine's (`match_review.py`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { Button, useToast } from "../../../components";
import { queryShown } from "../../../components/shell/pageActive";
import { reportUnexpected } from "../../../reporting/reporting";
import { CandidatePanel } from "./CandidatePanel";
import { ReviewTable } from "./ReviewTable";
import { SyncPlaylistDialog } from "./SyncPlaylistDialog";
import { matchCommand } from "./matchKeyboard";
import { allTickedLine, leftOutWords, reviewCandidateOf, summaryWords, syncLabel, tickedLine } from "./reviewList";
import { useMatchReview, type ReviewSource } from "./useMatchReview";
import { useReviewTicks } from "./useReviewTicks";

interface ReviewTabProps {
  /** What is reviewed: one playlist, one past search, or (with neither) every matched track. */
  source: ReviewSource;
  /** The name over the table and on the Sync button: the playlist, "Whole library". */
  name: string;
  /** Bumped when a match ended or something else changed the tracks, so the table is read again. */
  version: number;
  /** A match runs: searching waits, and says why. */
  matching: boolean;
  /** ‹ Playlists: leave this review. */
  onBack: () => void;
  /** A tick or a sync changed what the page counts. */
  onChanged: () => void;
  /** A track to open the panel on once the table is read (the Inspector's link). */
  initialTrackId?: number;
  /** Whether the panel is open, so a match that ends does not replace what is being read. */
  onPanelChange?: (open: boolean) => void;
}

export function ReviewTab({
  source,
  name,
  version,
  matching,
  onBack,
  onChanged,
  initialTrackId,
  onPanelChange,
}: ReviewTabProps) {
  const { push } = useToast();
  const [reads, setReads] = useState(0);
  const { review, loading, error, hasMore, loadMore, patchTrack } = useMatchReview(source, version + reads);
  const [panel, setPanel] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [said, setSaid] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const tableArea = useRef<HTMLDivElement>(null);
  const reread = useCallback(() => setReads((count) => count + 1), []);
  const ticks = useReviewTicks(source, patchTrack, reread);
  const [choosing, setChoosing] = useState(false);

  const rows = useMemo(() => review?.tracks ?? [], [review]);
  const counts = review?.counts ?? { matched: 0, to_check: 0, not_found: 0, search_failed: 0 };
  const total = review?.total ?? 0;
  const ticked = review?.ticked ?? 0;
  const tickable = counts.matched + counts.to_check;

  // The row the panel is open on. A re-read that no longer holds it must not close the panel or
  // empty what is being read: the last row seen stands in for it until the panel is closed.
  const seen = useRef<ReviewTrack | null>(null);
  const found = panel !== null ? rows.find((row) => row.track_id === panel) : undefined;
  if (found) seen.current = found;
  const panelRow = panel !== null ? (found ?? (seen.current?.track_id === panel ? seen.current : null)) : null;
  useEffect(() => {
    onPanelChange?.(panel !== null);
  }, [onPanelChange, panel]);

  // Closing the panel hands the keyboard back to the row that opened it.
  const wasOpen = useRef<number | null>(null);
  useEffect(() => {
    if (panel === null && wasOpen.current !== null) {
      const row = tableArea.current?.querySelector<HTMLElement>(`[data-track-id="${wasOpen.current}"]`);
      row?.focus({ preventScroll: true });
    }
    wasOpen.current = panel;
  }, [panel]);

  const open = useCallback((row: ReviewTrack) => {
    setCurrent(row.track_id);
    setPanel(row.track_id);
  }, []);

  // Opened on a track (the Inspector's link): its panel, once the table has it.
  const focused = useRef(false);
  useEffect(() => {
    if (initialTrackId === undefined || focused.current || !review) return;
    focused.current = true;
    const row = rows.find((entry) => entry.track_id === initialTrackId);
    if (row) open(row);
  }, [initialTrackId, open, review, rows]);

  // ----------------------------------------------------------- moving along the table

  const move = useCallback(
    (step: -1 | 1) => {
      if (rows.length === 0) return;
      // With nothing chosen yet the cursor is on the first row, the one in the tab order.
      const from = panel ?? current ?? rows[0]!.track_id;
      const at = rows.findIndex((row) => row.track_id === from);
      const target = at === -1 ? rows[step === 1 ? 0 : rows.length - 1]! : rows[Math.max(0, Math.min(rows.length - 1, at + step))]!;
      setCurrent(target.track_id);
      if (panel !== null) setPanel(target.track_id);
      else setFocusToken((token) => token + 1);
      // The end of what is loaded: read the next page, so the arrows do not stop at a seam.
      if (hasMore && target.track_id === rows[rows.length - 1]?.track_id) loadMore();
    },
    [current, hasMore, loadMore, panel, rows],
  );

  // A layout effect would be too early for a key pressed as the table appears; a window listener
  // with the shared rules (not in a field, a dialog or a menu, never a modified key) is enough.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (queryShown('[role="dialog"], dialog[open], [role="menu"]')) return;
      const which = matchCommand(event);
      if (which === null) return;
      if (which === "close") {
        if (panel === null) return;
        event.preventDefault();
        setPanel(null);
        return;
      }
      event.preventDefault();
      move(which === "next-track" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, panel]);

  // ----------------------------------------------------------- ticking and choosing

  const tick = useCallback(
    async (row: ReviewTrack, wanted: boolean) => {
      const changed = await ticks.setTicked([row], wanted);
      if (changed === null) return;
      setSaid(tickedLine(wanted, row.title));
      onChanged();
    },
    [onChanged, ticks],
  );

  const tickAll = useCallback(
    async (wanted: boolean) => {
      const done = await ticks.setAll(wanted);
      if (done === null) return;
      const line = allTickedLine(wanted, done.changed);
      setSaid(line);
      // A header tick changes many rows at once: the toast offers to take the whole batch back.
      const batchId = done.batchId;
      push(
        line,
        "info",
        batchId
          ? {
              label: "Undo",
              onClick: () => {
                void ticks.undo(batchId).then((back) => {
                  if (back) {
                    setSaid("Took back the ticks.");
                    onChanged();
                  }
                });
              },
            }
          : undefined,
      );
      onChanged();
    },
    [onChanged, push, ticks],
  );

  /** Use this: accept that candidate for the track, which ticks it. The table reads again for what it now shows. */
  const chooseCandidate = useCallback(
    async (row: ReviewTrack, candidateId: number) => {
      const decide = window.cuepoint?.decideMatch;
      if (!decide) {
        push(NEEDS_DESKTOP, "warning");
        return;
      }
      setChoosing(true);
      try {
        await decide({ decision: "accept", track_id: row.track_id, candidate_id: candidateId });
        setSaid(`Using this match for “${row.title}”: it will be synced.`);
        reread();
        onChanged();
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
      } finally {
        setChoosing(false);
      }
    },
    [onChanged, push, reread],
  );

  // A hand search stored an attempt: the row takes what it found, in place, and the page's counts
  // follow. The table is read again so what it now shows is the engine's own words.
  const searched = useCallback(
    (trackId: number, answer: MatchSearchAnswer) => {
      const pointed = answer.candidates.find((entry) => entry.id === answer.state.candidate_id);
      if (answer.state.state === "needs_review" && pointed) {
        patchTrack(trackId, {
          status: "to_check",
          candidate: reviewCandidateOf(pointed),
          differing: pointed.differing ?? [],
          tickable: true,
        });
      } else if (answer.failure) {
        patchTrack(trackId, { status: "search_failed" });
      }
      reread();
      onChanged();
    },
    [onChanged, patchTrack, reread],
  );

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

  const position = panelRow ? Math.max(1, rows.findIndex((row) => row.track_id === panelRow.track_id) + 1) : 0;
  const leftOut = leftOutWords(counts);

  return (
    <section className="review" aria-label={`Review ${name}`}>
      <div className="review__bar" role="group" aria-label="Review">
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          Playlists
        </Button>
        <strong className="review__name" title={`${name} · ${summaryWords(total, ticked)}`}>
          {name} · {summaryWords(total, ticked)}
        </strong>
        {leftOut && <span className="review__left-out">{leftOut}</span>}
        <span className="review__spacer" />
        <Button
          className="review__sync"
          disabled={ticked === 0}
          title={ticked === 0 ? "Tick at least one track to sync." : undefined}
          onClick={() => setSyncOpen(true)}
        >
          {syncLabel(name)}
        </Button>
      </div>
      {/* Always there, so a screen reader hears each tick and choice as it is made. */}
      <p className="review__live" role="status" aria-live="polite">
        {said}
      </p>

      <div className={`review__body${panelRow ? " review__body--panel" : ""}`} ref={tableArea}>
        <ReviewTable
          rows={rows}
          current={current}
          focusToken={focusToken}
          hasMore={hasMore}
          remaining={total - rows.length}
          onLoadMore={loadMore}
          onOpen={open}
          onTick={(row, wanted) => void tick(row, wanted)}
          onTickAll={(wanted) => void tickAll(wanted)}
          busy={ticks.busy}
          allTicked={tickable > 0 && ticked >= tickable}
          someTicked={ticked > 0}
          tickable={tickable}
        />
        {panelRow && (
          <CandidatePanel
            row={panelRow}
            position={position}
            total={rows.length}
            version={version + reads}
            busy={ticks.busy || choosing}
            matching={matching}
            onClose={() => setPanel(null)}
            onUse={(candidateId) => void chooseCandidate(panelRow, candidateId)}
            onLeaveOut={() => void tick(panelRow, false)}
            onSearched={searched}
            onMessage={(text) => push(text, "info")}
          />
        )}
      </div>
      <SyncPlaylistDialog
        open={syncOpen}
        name={name}
        source={source}
        onClose={() => setSyncOpen(false)}
        onChanged={() => {
          reread();
          onChanged();
        }}
      />
    </section>
  );
}
