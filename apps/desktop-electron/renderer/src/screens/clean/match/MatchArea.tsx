/**
 * The Match area (C14, C22, DEC-072 amended).
 *
 * Tabs: **Playlists** (the default, where Match opens: your playlists and how far each is),
 * **Review <name>** (only while a run is open: every track of one search, with what was found for
 * it and a quick decision on each: `ReviewRun.tsx`) and **Past searches** (every match run;
 * opening one opens its Review). There is no separate Table: the review list is that job.
 *
 * A match that finishes lands on its Review, and Review N › on a playlist, See them › on one whose
 * search found nothing, Open on a past search and the Inspector's link each open one too. What is
 * reviewed is a run (its resumes included), a playlist, or, from the Inspector's link, every
 * matched track. **Correct accepts the match and copies the ticked values as one act**, one batch
 * under one id, and Undo reverts that batch (DEC-004: nothing is written to the files until Save).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { CleanPlaylistStatus, EntityKind, MatchRun } from "../../../api/cuepointBridge.types";
import { Tabs } from "../../../components/Tabs";
import type { CleanOpening } from "../cleanLink";
import type { CleanMatch } from "../useCleanMatch";
import { PastSearches } from "./PastSearches";
import { PlaylistsView } from "./PlaylistsView";
import { ReviewRun } from "./ReviewRun";
import type { ReviewFilter } from "./reviewList";
import { runSelection } from "./matchScope";
import { whatLine } from "./pastSearchWords";
import type { CleanPlaylistsState } from "./useCleanPlaylists";
import type { ReviewSource } from "./useMatchReview";
import { loadMatchTab, saveMatchTab, type MatchTab } from "./matchTab";
import "./match.css";

export type { MatchTab };

/**
 * A review opened from outside the area (a match that finished, the toast's Review): the run, and
 * the playlist it was started from. Applied once per `token`, as a track the Library opens is.
 */
export interface ReviewOpening {
  token: string;
  run: MatchRun;
  playlistId: number | null;
  name: string;
  /** The chip to open on; "Not found" or "Search failed" for a run that found nothing. */
  filter?: ReviewFilter;
}

/** What the Review tab is open on. */
interface Reviewing {
  source: ReviewSource;
  name: string;
  /** The playlist's id, or null for the whole library (Save N to files…). */
  playlistId: number | null;
  filter: ReviewFilter;
  /** A track to open the details of once the list is read (the Inspector's link). */
  trackId?: number;
  /** Which opening this is, so a review opened again starts clean. */
  key: string;
}

interface MatchAreaProps {
  onHealthChanged: () => void;
  /** A track the Library asked to open (CLEAN-13): the library's review, on that track's details. */
  focus?: CleanOpening | null;
  /** The page's matching: running state, how many ended, and resuming. */
  match: CleanMatch;
  /** The Playlists view's rows. */
  playlists: CleanPlaylistsState;
  /** A playlist's Match button (null is the whole library); the page starts the run. */
  onMatchPlaylist: (playlist: CleanPlaylistStatus | null) => void;
  /** The run a row's last Match started in this session, so Review opens on that run (C22). */
  runFor?: (playlist: CleanPlaylistStatus | null) => string | undefined;
  /** A row's run has been reviewed to its end, or no longer matches what the row waits on: forget it. */
  onRunSpent?: (playlistId: number | null) => void;
  /** A review opened from the page (a match that finished, the toast's Review). */
  reviewOpening?: ReviewOpening | null;
  /** The opening has been used, so coming back to this tab does not apply it again. */
  onReviewOpened?: () => void;
  /** Which sub-tab is open, and whether a review's details are open, said up so a match that ends knows where it may land. */
  onViewChange?: (view: { tab: MatchTab; panelOpen: boolean }) => void;
  /** A row's "Save N to files…": the window on that playlist, or the library for its row (C22, C23). */
  onSavePlaylist?: (playlist: CleanPlaylistStatus | null) => void;
  /** Save N to files… from a past search's review: the window on that run's tracks. */
  onSaveRun?: (jobId: string) => void;
  /** How many of a run's tracks hold values the files do not (for the Save button on its done screen). */
  countRunUnsaved?: (jobId: string) => Promise<number>;
  /** An artist or label page, from the credits in a review's details. */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
}

export function MatchArea({
  onHealthChanged,
  focus = null,
  match,
  playlists,
  onMatchPlaylist,
  runFor,
  onRunSpent,
  reviewOpening = null,
  onReviewOpened,
  onViewChange,
  onSavePlaylist,
  onSaveRun,
  countRunUnsaved,
  onOpenEntity,
}: MatchAreaProps) {
  const [tab, setTab] = useState<MatchTab>(loadMatchTab);
  const [reviewing, setReviewing] = useState<Reviewing | null>(null);
  const openings = useRef(0);

  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    onViewChange?.({ tab, panelOpen: tab === "review" && panelOpen });
  }, [onViewChange, panelOpen, tab]);

  const chooseTab = useCallback((id: string) => {
    const next = (["playlists", "review", "past"] as const).find((entry) => entry === id);
    if (!next) return;
    setTab(next);
    saveMatchTab(next);
  }, []);

  const showReview = useCallback((next: Omit<Reviewing, "key" | "filter"> & { filter?: ReviewFilter }) => {
    openings.current += 1;
    setReviewing({ ...next, filter: next.filter ?? "all", key: String(openings.current) });
    setTab("review");
  }, []);

  /** ‹ Playlists: leave the review and go back to the rows. */
  const leaveReview = useCallback(() => {
    setReviewing(null);
    setTab("playlists");
    saveMatchTab("playlists");
  }, []);

  // The Inspector's link: the library's review, on that track.
  const focusToken = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focusToken.current === focus.token) return;
    focusToken.current = focus.token;
    showReview({ source: {}, name: "Whole library", playlistId: null, trackId: focus.trackId });
  }, [focus, showReview]);

  // A review opened from the page: a match that finished, or the toast's Review.
  const openingToken = useRef<string | null>(null);
  useEffect(() => {
    if (!reviewOpening || openingToken.current === reviewOpening.token) return;
    openingToken.current = reviewOpening.token;
    showReview({
      source: { jobId: reviewOpening.run.job_id },
      name: reviewOpening.name,
      playlistId: reviewOpening.playlistId,
      filter: reviewOpening.filter,
    });
    onReviewOpened?.();
  }, [onReviewOpened, reviewOpening, showReview]);

  /** Open, from Past searches: that run's tracks, all of them. */
  const openRun = useCallback(
    (picked: MatchRun) => {
      showReview({ source: { jobId: picked.job_id }, name: picked.label ?? whatLine(picked), playlistId: null });
    },
    [showReview],
  );

  /**
   * Review N › and See them ›: the tracks of the run the row's last Match started, when that run
   * holds what the row waits on, else the playlist's own (earlier runs left some, or decisions a
   * newer match disagrees with). The row counts across runs, so the run is only right when it
   * holds at least that many.
   */
  const reviewPlaylist = useCallback(
    (picked: CleanPlaylistStatus | null, filter: ReviewFilter, holds: "waiting" | "no_match") => {
      const counts = picked ?? playlists.data?.whole_library;
      const name = picked ? picked.name : "Whole library";
      const open = (found: MatchRun | null) => {
        const want = holds === "waiting" ? (counts?.waiting ?? 0) : (counts?.no_match ?? 0);
        const have = found ? (holds === "waiting" ? found.waiting : found.not_found) : 0;
        const byRun = found !== null && have > 0 && have >= want;
        if (found && !byRun) onRunSpent?.(picked ? picked.id : null);
        showReview({
          source: byRun ? { jobId: found.job_id } : picked ? { playlistId: picked.id } : {},
          name,
          playlistId: picked ? picked.id : null,
          filter,
        });
      };
      const jobId = runFor?.(picked);
      const read = window.cuepoint?.getMatchJobs;
      if (!jobId || !read) {
        open(null);
        return;
      }
      void read({ limit: 20 })
        .then((answer) => open(answer.jobs.find((entry) => entry.job_id === jobId) ?? null))
        .catch(() => open(null));
    },
    [onRunSpent, playlists.data, runFor, showReview],
  );

  const resumeRun = useCallback(
    (picked: MatchRun) => {
      if (picked.resume_job_id) match.resume(picked.resume_job_id);
    },
    [match],
  );

  const matchAgain = useCallback(
    (picked: MatchRun) => {
      match.start("rematch-run", runSelection(picked.job_id), true, picked.label ?? undefined);
    },
    [match],
  );

  const searchAgain = useCallback(
    (track: { id: number; title: string }) => {
      match.start("rematch", { track_ids: [track.id] }, true, `1 track: "${track.title}"`);
    },
    [match],
  );

  const reviewRow = reviewing
    ? reviewing.playlistId === null
      ? null
      : (playlists.data?.playlists.find((entry) => entry.id === reviewing.playlistId) ?? null)
    : null;
  const reviewCounts = reviewing
    ? reviewing.playlistId === null
      ? (playlists.data?.whole_library ?? null)
      : reviewRow
    : null;

  // A past search is saved by its own tracks: count them as the Save window will, again after each change.
  const [changes, setChanges] = useState(0);
  const [runUnsaved, setRunUnsaved] = useState<number | undefined>(undefined);
  const countedRun = reviewing !== null && reviewing.playlistId === null ? (reviewing.source.jobId ?? null) : null;
  useEffect(() => {
    if (countedRun === null || !countRunUnsaved) {
      setRunUnsaved(undefined);
      return;
    }
    let cancelled = false;
    void countRunUnsaved(countedRun)
      .then((count) => {
        if (!cancelled) setRunUnsaved(count);
      })
      .catch(() => {
        if (!cancelled) setRunUnsaved(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [changes, countRunUnsaved, countedRun, match.ended]);
  const reviewChanged = useCallback(() => {
    setChanges((count) => count + 1);
    onHealthChanged();
  }, [onHealthChanged]);

  const byRun = reviewing !== null && reviewing.playlistId === null && reviewing.source.jobId !== undefined;
  const tabs = [
    { id: "playlists", label: "Playlists" },
    ...(reviewing ? [{ id: "review", label: `Review ${reviewing.name}` }] : []),
    { id: "past", label: "Past searches" },
  ];
  const active = tab === "review" && !reviewing ? "playlists" : tab;

  return (
    <div className="match-area">
      <Tabs tabs={tabs} activeId={active} onChange={chooseTab} />

      <div className="match-area__body">
        {active === "playlists" && (
          <PlaylistsView
            data={playlists.data}
            error={playlists.error}
            loading={playlists.loading}
            matching={match.matching}
            onMatch={onMatchPlaylist}
            onStop={match.stop}
            onReview={(picked) => reviewPlaylist(picked, "all", "waiting")}
            onSee={(picked) => reviewPlaylist(picked, "not_found", "no_match")}
            onSave={onSavePlaylist}
          />
        )}
        {active === "review" && reviewing && (
          <ReviewRun
            key={reviewing.key}
            source={reviewing.source}
            name={reviewing.name}
            version={match.ended + match.started}
            matching={match.matching}
            // A past search is saved by its own tracks; a playlist's review by the playlist.
            saveCount={byRun ? runUnsaved : (reviewCounts?.unsaved ?? 0)}
            onSave={
              byRun
                ? onSaveRun
                  ? () => onSaveRun(reviewing.source.jobId!)
                  : undefined
                : onSavePlaylist
                  ? () => onSavePlaylist(reviewRow)
                  : undefined
            }
            onPanelChange={setPanelOpen}
            onOpenEntity={onOpenEntity}
            onBack={leaveReview}
            onChanged={reviewChanged}
            onSearchAgain={searchAgain}
            initialFilter={reviewing.filter}
            initialTrackId={reviewing.trackId}
            onReviewed={reviewing.source.jobId ? () => onRunSpent?.(reviewing.playlistId) : undefined}
          />
        )}
        {active === "past" && (
          <PastSearches
            version={match.ended + match.started}
            matching={match.matching}
            openId={reviewing?.source.jobId ?? null}
            onOpen={openRun}
            onResume={resumeRun}
            onMatchAgain={matchAgain}
          />
        )}
      </div>
    </div>
  );
}
