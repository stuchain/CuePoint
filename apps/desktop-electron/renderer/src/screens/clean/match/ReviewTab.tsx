/**
 * A review (step 3, inside Playlists): one playlist's tracks, with what Beatport matched each with.
 *
 * The plain table (`ReviewTable.tsx`): a tick per track says whether its Beatport values will be
 * synced. Confirmed tracks start ticked and tracks with no match are not; **unticking leaves a track
 * out**. The tick is kept by the engine as the person's decision, so it stays after leaving the
 * review. Clicking a row opens its side panel (`CandidatePanel.tsx`) straight on the candidates,
 * where another one is chosen or the track is left out. The selection bar sits above the list
 * (C215); the step's one main action, **Sync to files…**, is at the bottom right (C216), with the
 * facts of the review on the left (C235): it opens the Sync window on the ticked tracks
 * (`SyncPlaylistDialog.tsx`). Nothing is written to a value or a file before Sync. The way back is
 * the area's **‹ Playlists** button.
 *
 * The keys are the Library's (C190, C191): Up and Down move along the table and select (Shift
 * extends; the panel follows), Enter plays the track, Space ticks it, Ctrl+A selects every track
 * and Esc closes the panel and then clears the selection, handing the keyboard back to the row.
 * Every tick and choice is said in a live region. What each status is, what differs, what is
 * ticked and the counts are the engine's (`match_review.py`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LibraryTrackRow, MatchSearchAnswer, ReviewTrack } from "../../../api/cuepointBridge.types";
import { needsDesktopApp, userMessage } from "../../../api/userMessage";
import { Button, Hint, Kbd, Notice, useToast } from "../../../components";
import { SkeletonTable } from "../SkeletonTable";
import { SelectionBar } from "../../../components/SelectionBar";
import { TrackContextMenu, type TrackContextMenuItem } from "../../../components/TrackContextMenu";
import { countNoun } from "../../../format/counts";
import { RETRY, SYNC, UNDO, couldNot } from "../../../format/words";
import { toQueueItem, queuedMessage } from "../../library/useLibraryPlayback";
import { writeClipboard } from "../../library/trackClipboard";
import { revealTrack } from "../revealTrack";
import { queryShown } from "../../../components/shell/pageActive";
import { reportUnexpected } from "../../../reporting/reporting";
import { usePresence } from "../../../tokens/usePresence";
import { CandidatePanel } from "./CandidatePanel";
import { ReviewTable } from "./ReviewTable";
import { SyncPlaylistDialog } from "./SyncPlaylistDialog";
import { NEXT_TO_CHECK_KEY, isSelectAll, matchCommand } from "./matchKeyboard";
import { reviewMenuItems } from "./reviewMenu";
import { allTickedLine, barFacts, nextToCheck, reviewCandidateOf, tickedLine, toCheckOnlyLabel } from "./reviewList";
import { useMatchReview, type ReviewSource } from "./useMatchReview";
import { useReviewTicks } from "./useReviewTicks";

interface ReviewTabProps {
  /** What is reviewed: one playlist, one past search, or (with neither) every matched track. */
  source: ReviewSource;
  /** The name of what is reviewed: the playlist, "Whole library". */
  name: string;
  /** Bumped when a match ended or something else changed the tracks, so the table is read again. */
  version: number;
  /** A match runs: searching waits, and says why. */
  matching: boolean;
  /** A tick or a sync changed what the page counts. */
  onChanged: () => void;
  /** A track to open the panel on once the table is read (the Inspector's link). */
  initialTrackId?: number;
  /** Whether the panel is open, so a match that ends does not replace what is being read. */
  onPanelChange?: (open: boolean) => void;
  /** Open with "To check only" on (D17): Match opens on the tracks that wait for a decision. */
  startOnToCheck?: boolean;
}

/** The most tracks one Play, Play next or Add to queue reads from the Library at once. */
const QUEUE_CAP = 200;

export function ReviewTab({
  source,
  name,
  version,
  matching,
  onChanged,
  initialTrackId,
  onPanelChange,
  startOnToCheck = false,
}: ReviewTabProps) {
  const { push } = useToast();
  const [reads, setReads] = useState(0);
  const { review, loading, error, hasMore, loadMore, loadAll, patchTrack } = useMatchReview(source, version + reads);
  const [panel, setPanel] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [said, setSaid] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const tableArea = useRef<HTMLDivElement>(null);
  const reread = useCallback(() => setReads((count) => count + 1), []);
  const ticks = useReviewTicks(source, patchTrack, reread);
  const [choosing, setChoosing] = useState(false);

  // "To check only" (M508): the tracks that wait for a decision, out of however many were matched.
  const [onlyToCheck, setOnlyToCheck] = useState(startOnToCheck);
  const rows = useMemo(
    () => (review?.tracks ?? []).filter((row) => !onlyToCheck || row.status === "to_check"),
    [review, onlyToCheck],
  );
  const counts = review?.counts ?? { matched: 0, to_check: 0, not_found: 0, search_failed: 0 };
  const total = review?.total ?? 0;
  const ticked = review?.ticked ?? 0;
  const tickable = counts.matched + counts.to_check;

  // A filter looks at every track: the pages still to come are read, so none that waits is missed.
  useEffect(() => {
    if (onlyToCheck && hasMore) loadAll();
  }, [hasMore, loadAll, onlyToCheck]);

  // The row the panel is open on. A re-read that no longer holds it must not close the panel or
  // empty what is being read: the last row seen stands in for it until the panel is closed.
  const seen = useRef<ReviewTrack | null>(null);
  const found = panel !== null ? rows.find((row) => row.track_id === panel) : undefined;
  if (found) seen.current = found;
  const panelRow = panel !== null ? (found ?? (seen.current?.track_id === panel ? seen.current : null)) : null;
  // A closed panel plays its exit (M380): the row it last showed stays drawn while it leaves.
  const panelPresence = usePresence<HTMLElement>(panelRow !== null);
  const leftRow = useRef<ReviewTrack | null>(null);
  if (panelRow) leftRow.current = panelRow;
  const panelShown = panelRow ?? (panelPresence.present ? leftRow.current : null);
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

  // The selection: Ctrl/Command toggles, Shift extends from the anchor, Ctrl+A takes all, Esc clears.
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef<number | null>(null);
  // Rows leave as the list changes (a filter, a tick that drops one, a re-read): the selection
  // keeps only tracks still shown, so a count or a bulk action never covers a track out of sight.
  useEffect(() => {
    setSelected((now) => {
      if (now.size === 0) return now;
      const shown = new Set(rows.map((row) => row.track_id));
      const kept = [...now].filter((id) => shown.has(id));
      return kept.length === now.size ? now : new Set(kept);
    });
  }, [rows]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: TrackContextMenuItem[] } | null>(null);

  const open = useCallback((row: ReviewTrack) => {
    setCurrent(row.track_id);
    setPanel(row.track_id);
    setSelected(new Set([row.track_id]));
    anchor.current = row.track_id;
  }, []);

  const select = useCallback(
    (row: ReviewTrack, how: { shift: boolean; toggle: boolean }) => {
      setCurrent(row.track_id);
      if (how.shift && anchor.current !== null) {
        const from = rows.findIndex((entry) => entry.track_id === anchor.current);
        const to = rows.findIndex((entry) => entry.track_id === row.track_id);
        if (from >= 0 && to >= 0) {
          const [low, high] = from < to ? [from, to] : [to, from];
          const range = rows.slice(low, high + 1).map((entry) => entry.track_id);
          setSelected((now) => new Set(how.toggle ? [...now, ...range] : range));
          return;
        }
      }
      anchor.current = row.track_id;
      setSelected((now) => {
        if (!how.toggle) return new Set([row.track_id]);
        const next = new Set(now);
        if (next.has(row.track_id)) next.delete(row.track_id);
        else next.add(row.track_id);
        return next;
      });
    },
    [rows],
  );

  // Opened on a track (the Inspector's link): its panel, once the table has it.
  const focused = useRef(false);
  useEffect(() => {
    if (initialTrackId === undefined || focused.current || !review) return;
    focused.current = true;
    const row = rows.find((entry) => entry.track_id === initialTrackId);
    if (row) open(row);
  }, [initialTrackId, open, review, rows]);

  // ----------------------------------------------------------- moving along the table

  /**
   * An arrow is the click on the next row (the Library's rule): the cursor and the selection move
   * to it, the panel follows, and Shift extends the selection from its anchor.
   */
  const move = useCallback(
    (step: -1 | 1 | "first" | "last", extend: boolean) => {
      if (rows.length === 0) return;
      // With nothing chosen yet the cursor is on the first row, the one in the tab order.
      // The cursor is where the last key left it; the panel only follows it.
      const from = current ?? panel ?? rows[0]!.track_id;
      const at = rows.findIndex((row) => row.track_id === from);
      const target =
        step === "first"
          ? rows[0]!
          : step === "last"
            ? rows[rows.length - 1]!
            : at === -1
              ? rows[step === 1 ? 0 : rows.length - 1]!
              : rows[Math.max(0, Math.min(rows.length - 1, at + step))]!;
      if (extend) {
        select(target, { shift: true, toggle: false });
      } else {
        setCurrent(target.track_id);
        setSelected(new Set([target.track_id]));
        anchor.current = target.track_id;
        if (panel !== null) setPanel(target.track_id);
      }
      if (panel === null) setFocusToken((token) => token + 1);
      // The end of what is loaded: read the next page, so the arrows do not stop at a seam.
      if (hasMore && target.track_id === rows[rows.length - 1]?.track_id) loadMore();
    },
    [current, hasMore, loadMore, panel, rows, select],
  );

  /**
   * Go to the next track still to check (M508): the cursor, the selection and the panel (when it is
   * open) move to it. `from` is the track to count on from; with none, the cursor's.
   */
  const goToNextToCheck = useCallback(
    (from: number | null = null) => {
      const target = nextToCheck(rows, from ?? current ?? panel);
      if (!target) return false;
      setCurrent(target.track_id);
      setSelected(new Set([target.track_id]));
      anchor.current = target.track_id;
      if (panel !== null) setPanel(target.track_id);
      else setFocusToken((token) => token + 1);
      return true;
    },
    [current, panel, rows],
  );

  // A layout effect would be too early for a key pressed as the table appears; a window listener
  // with the shared rules (not in a field, a dialog or a menu, never a modified key) is enough.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (queryShown('[role="dialog"], dialog[open], [role="menu"]')) return;
      if (isSelectAll(event)) {
        if (rows.length === 0) return;
        event.preventDefault();
        setSelected(new Set(rows.map((row) => row.track_id)));
        return;
      }
      const which = matchCommand(event);
      if (which === null) return;
      if (which === "close") {
        // Esc closes the panel first, then clears the selection; with neither it is left alone.
        if (panel !== null) {
          event.preventDefault();
          setPanel(null);
        } else if (selected.size > 0) {
          event.preventDefault();
          setSelected(new Set());
        }
        return;
      }
      if (which === "next-to-check") {
        if (goToNextToCheck()) event.preventDefault();
        return;
      }
      event.preventDefault();
      move(
        which === "next-track" ? 1 : which === "previous-track" ? -1 : which === "first-track" ? "first" : "last",
        event.shiftKey,
      );
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToNextToCheck, move, panel, rows, selected.size]);

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
              label: UNDO,
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

  /** Use this match: accept that candidate for the track, which ticks it. The table reads again for what it now shows. */
  const chooseCandidate = useCallback(
    async (row: ReviewTrack, candidateId: number, stay = false) => {
      const decide = window.cuepoint?.decideMatch;
      if (!decide) {
        push(needsDesktopApp(), "warning");
        return;
      }
      setChoosing(true);
      try {
        await decide({ decision: "accept", track_id: row.track_id, candidate_id: candidateId });
        setSaid(`Using this match for “${row.title}”: it will be synced.`);
        reread();
        onChanged();
        // The decision is made: the panel moves on to the next track that waits (Shift stays on this one).
        if (!stay && panel !== null) goToNextToCheck(row.track_id);
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
      } finally {
        setChoosing(false);
      }
    },
    [goToNextToCheck, onChanged, panel, push, reread],
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

  // ------------------------------------------------- the selection and its right-click menu

  /** The library's rows for these tracks, read one by one (the queue wants whole rows). */
  const libraryRows = useCallback(async (ids: readonly number[]): Promise<LibraryTrackRow[]> => {
    // A cap, said out loud by the caller (`queueRows`), never applied silently.
    const read = window.cuepoint?.getLibraryTrack;
    if (!read) return [];
    const answers = await Promise.all(
      ids.slice(0, QUEUE_CAP).map((id) =>
        read({ trackId: id })
          .then(({ track }) => track)
          .catch(() => null),
      ),
    );
    return answers.filter((track): track is LibraryTrackRow => track !== null);
  }, []);

  const queueRows = useCallback(
    async (ids: readonly number[], how: "play" | "next" | "end") => {
      const player = window.cuepoint?.player;
      const tracks = await libraryRows(ids);
      if (!player || tracks.length === 0) return;
      const items = tracks.map(toQueueItem);
      if (ids.length > QUEUE_CAP) {
        push(`Only the first ${countNoun(QUEUE_CAP, "track")} of ${countNoun(ids.length, "selected track")} were queued`, "warning");
      }
      if (how === "play") {
        const result = await player.playQueue?.(items, 0);
        if (result && !result.ok) push(result.error, "warning");
      } else if (how === "next") {
        await player.playNext?.(items);
        push(queuedMessage(items.length, "next"), "info");
      } else {
        await player.addToQueue?.(items);
        push(queuedMessage(items.length, "end"), "info");
      }
    },
    [libraryRows, push],
  );

  /** What the selection bar and the menu offer for these tracks: the ones that can be ticked, and the ones that can be left out. */
  const offers = useCallback(
    (chosen: readonly ReviewTrack[]) => ({
      toTick: chosen.filter((entry) => entry.tickable && !entry.ticked),
      toLeaveOut: chosen.filter((entry) => entry.ticked),
    }),
    [],
  );

  /** Tick or untick these tracks and say how many changed. */
  const tickThese = useCallback(
    async (chosen: readonly ReviewTrack[], wanted: boolean) => {
      const changed = await ticks.setTicked(chosen, wanted);
      if (changed === null) return;
      setSaid(
        wanted
          ? `Ticked ${countNoun(changed, "track")}: they will be synced.`
          : `Unticked ${countNoun(changed, "track")}: they will be left out.`,
      );
      onChanged();
    },
    [onChanged, ticks],
  );

  /** Right-click: the selection is already the row (or holds it), then the menu opens on the selection. */
  const openMenu = useCallback(
    (row: ReviewTrack, at: { x: number; y: number }) => {
      // A right-click on a row outside the selection selects it first; the menu acts on the result.
      const ids = selected.has(row.track_id) ? [...selected] : [row.track_id];
      if (!selected.has(row.track_id)) {
        setSelected(new Set(ids));
        anchor.current = row.track_id;
      }
      setCurrent(row.track_id);
      const chosen = rows.filter((entry) => ids.includes(entry.track_id));
      const { toTick, toLeaveOut } = offers(chosen);
      const items = reviewMenuItems(
        { count: chosen.length, canTick: toTick.length > 0, canLeaveOut: toLeaveOut.length > 0 },
        {
          onPlay: () => void queueRows(ids, "play"),
          onPlayNext: () => void queueRows(ids, "next"),
          onAddToQueue: () => void queueRows(ids, "end"),
          onCopy: () => {
            const text = chosen.map((entry) => `${entry.artist} - ${entry.title}`).join("\n");
            void writeClipboard(text).then((wrote) =>
              push(
                wrote ? `Copied ${countNoun(chosen.length, "track")}` : couldNot("copy to the clipboard"),
                wrote ? "success" : "warning",
              ),
            );
          },
          onReveal:
            chosen.length === 1
              ? () => {
                  void revealTrack(chosen[0]!.track_id).then((outcome) => {
                    if (outcome) push(outcome.message, outcome.tone);
                  });
                }
              : null,
          onTick: () => void tickThese(toTick, true),
          onLeaveOut: () => void tickThese(toLeaveOut, false),
          onChoose: () => open(chosen[0]!),
        },
      );
      setMenu({ ...at, items });
    },
    [offers, open, push, queueRows, rows, selected, tickThese],
  );

  /** Play one track from its row (Enter or a double-click). */
  const play = useCallback((row: ReviewTrack) => void queueRows([row.track_id], "play"), [queueRows]);

  if (error && !review) {
    return (
      <section className="review" aria-label={`Review ${name}`}>
        <Notice
          kind="danger"
          action={
            error === needsDesktopApp() ? undefined : (
              <Button variant="secondary" onClick={reread}>
                {RETRY}
              </Button>
            )
          }
        >
          {error}
        </Notice>
      </section>
    );
  }
  if (!review) {
    return (
      <section className="review" aria-label={`Review ${name}`}>
        {/* The table's shape while it loads, not a spinner (M373). */}
        {loading && <SkeletonTable what="the tracks" columns={["", "Status", "Your track", "Beatport", ""]} />}
      </section>
    );
  }

  const position = panelShown ? Math.max(1, rows.findIndex((row) => row.track_id === panelShown.track_id) + 1) : 0;
  const chosen = rows.filter((entry) => selected.has(entry.track_id));
  const { toTick, toLeaveOut } = offers(chosen);

  return (
    <section className="review" aria-label={`Review ${name}`}>
      {/* Always there, so a screen reader hears each tick and choice as it is made. */}
      <p className="review__live" role="status" aria-live="polite">
        {said}
      </p>

      {/* The filter and the way to the next track that waits (M508). */}
      <div className="cp-toolbar review__filter" role="toolbar" aria-label="What to show">
        <label className="clean-toolbar__check">
          <input
            type="checkbox"
            checked={onlyToCheck}
            disabled={!onlyToCheck && counts.to_check === 0}
            onChange={(event) => setOnlyToCheck(event.target.checked)}
          />
          {toCheckOnlyLabel(counts.to_check)}
        </label>
        <Hint text={counts.to_check === 0 ? "Nothing is waiting to be checked" : undefined}>
          <Button
            variant="secondary"
            icon="chevron-right"
            disabled={counts.to_check === 0}
            onClick={() => goToNextToCheck()}
          >
            Next to check
          </Button>
        </Hint>
        <Kbd keys={NEXT_TO_CHECK_KEY} />
      </div>

      {/* The selection bar sits above the list (C215), in standard-height buttons (C8). */}
      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="secondary" disabled={ticks.busy || toTick.length === 0} onClick={() => void tickThese(toTick, true)}>
          Tick to sync
        </Button>
        <Button variant="secondary" disabled={ticks.busy || toLeaveOut.length === 0} onClick={() => void tickThese(toLeaveOut, false)}>
          Leave out
        </Button>
      </SelectionBar>

      <div className={`review__body${panelShown ? " review__body--panel" : ""}`} ref={tableArea}>
        <ReviewTable
          rows={rows}
          current={current}
          focusToken={focusToken}
          hasMore={hasMore}
          remaining={total - rows.length}
          onShowAll={loadAll}
          onOpen={open}
          onPlay={play}
          selectedIds={selected}
          onSelect={select}
          onContextMenu={openMenu}
          onTick={(row, wanted) => void tick(row, wanted)}
          onTickAll={(wanted) => void tickAll(wanted)}
          busy={ticks.busy}
          allTicked={tickable > 0 && ticked >= tickable}
          someTicked={ticked > 0}
          tickable={tickable}
        />
        {panelShown && (
          <CandidatePanel
            row={panelShown}
            leaving={panelRow === null}
            presenceRef={panelPresence.ref}
            position={position}
            total={rows.length}
            version={version + reads}
            busy={ticks.busy || choosing}
            matching={matching}
            onClose={() => setPanel(null)}
            onUse={(candidateId, stay) => void chooseCandidate(panelShown, candidateId, stay)}
            onMove={(step) => move(step, false)}
            onLeaveOut={() => void tick(panelShown, false)}
            onSearched={searched}
            onMessage={(text) => push(text, "info")}
          />
        )}
      </div>

      {/* The step's bottom bar: the facts of the review on the left, the main action on the right. */}
      <div className="cp-toolbar review__footer">
        <span className="cp-prose review__facts">{barFacts(total, ticked, counts)}</span>
        <Hint text={ticked === 0 ? "Tick at least one track to sync" : undefined}>
          <Button variant="write" className="review__sync" disabled={ticked === 0} onClick={() => setSyncOpen(true)}>
            {SYNC.opener}
          </Button>
        </Hint>
      </div>

      {menu && (
        <TrackContextMenu x={menu.x} y={menu.y} items={menu.items} label="Selected tracks" onClose={() => setMenu(null)} />
      )}
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
