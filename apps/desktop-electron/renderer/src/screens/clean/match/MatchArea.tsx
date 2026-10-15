/**
 * The Match area (C14, C22).
 *
 * Tabs: **Playlists** (the default, where Match opens: tick playlists and match them), one
 * **Review <name>** tab for each playlist matched or reviewed (several playlists, several tabs; the
 * whole library, only its own: `ReviewTab.tsx`) and **Past searches** (every match run; opening one
 * opens its review). A review stays until ‹ Playlists closes it.
 *
 * A match that finishes opens a review tab for each playlist it was started on, and so do Review
 * on a row, Open on a past search and the Inspector's link. What a tab reviews is a playlist, a run
 * (its resumes included) or, from the Inspector's link, every matched track. A tick is the
 * person's decision to sync a track; nothing is written to a value or a file until Sync.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { CleanPlaylistStatus, MatchRun } from "../../../api/cuepointBridge.types";
import { Tabs } from "../../../components/Tabs";
import type { CleanOpening } from "../cleanLink";
import type { CleanMatch } from "../useCleanMatch";
import { PastSearches } from "./PastSearches";
import { PlaylistsView } from "./PlaylistsView";
import { ReviewTab } from "./ReviewTab";
import type { MatchChoice } from "./matchPlaylists";
import { runSelection } from "./matchScope";
import { whatLine } from "./pastSearchWords";
import type { CleanPlaylistsState } from "./useCleanPlaylists";
import { WHOLE_LIBRARY_NAME } from "./useCleanPlaylists";
import type { ReviewSource } from "./useMatchReview";
import { loadMatchTab, saveMatchTab, type MatchTab } from "./matchTab";
import "./match.css";

export type { MatchTab };

/** One playlist (or, with null, the whole library) to open a review tab for. */
export interface ReviewTarget {
  playlistId: number | null;
  name: string;
}

/**
 * Reviews opened from outside the area (a match that finished, the toast's Review): a tab for each
 * target. Applied once per `token`, as a track the Library opens is.
 */
export interface ReviewOpening {
  token: string;
  targets: ReviewTarget[];
}

/** One open review tab. */
interface Reviewing {
  /** Which opening this is, so a review opened again starts clean; also its tab's id. */
  key: string;
  source: ReviewSource;
  name: string;
  /** A track to open the panel on once the table is read (the Inspector's link). */
  trackId?: number;
}

interface MatchAreaProps {
  onHealthChanged: () => void;
  /** A track the Library asked to open (CLEAN-13): the library's review, on that track. */
  focus?: CleanOpening | null;
  /** The page's matching: running state, how many ended, and resuming. */
  match: CleanMatch;
  /** The Playlists view's rows. */
  playlists: CleanPlaylistsState;
  /** Match what is ticked; the page starts the run. */
  onMatch: (choice: MatchChoice) => void;
  /** Reviews opened from the page (a match that finished, the toast's Review). */
  reviewOpening?: ReviewOpening | null;
  /** The opening has been used, so coming back to this tab does not apply it again. */
  onReviewOpened?: () => void;
  /** Which sub-tab is open, and whether a review's panel is open, said up so a match that ends knows where it may land. */
  onViewChange?: (view: { tab: MatchTab; panelOpen: boolean }) => void;
}

const sourceKey = (source: ReviewSource) => `${source.jobId ?? ""}|${source.playlistId ?? ""}`;
const reviewTabId = (key: string) => `review:${key}`;

export function MatchArea({
  onHealthChanged,
  focus = null,
  match,
  playlists,
  onMatch,
  reviewOpening = null,
  onReviewOpened,
  onViewChange,
}: MatchAreaProps) {
  const [tab, setTab] = useState<string>(loadMatchTab);
  const [reviews, setReviews] = useState<Reviewing[]>([]);
  const openings = useRef(0);
  const reviewsRef = useRef<Reviewing[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const active = tab.startsWith("review:") && !reviews.some((entry) => reviewTabId(entry.key) === tab) ? "playlists" : tab;
  const view: MatchTab = active.startsWith("review:") ? "review" : (active as MatchTab);
  useEffect(() => {
    onViewChange?.({ tab: view, panelOpen: view === "review" && panelOpen });
  }, [onViewChange, panelOpen, view]);

  const chooseTab = useCallback((id: string) => {
    setTab(id);
    if (id === "playlists" || id === "past") saveMatchTab(id);
  }, []);

  /** Open a review tab for each of these, or bring the one already open for the same tracks forward. */
  const showReviews = useCallback((next: Array<{ source: ReviewSource; name: string; trackId?: number }>) => {
    let list = reviewsRef.current;
    let first: string | null = null;
    next.forEach((entry, index) => {
      const same = list.find((open) => sourceKey(open.source) === sourceKey(entry.source));
      // The same tracks again: that tab stays, and starts clean only when a track is asked for.
      if (same && entry.trackId === undefined) {
        if (index === 0) first = same.key;
        return;
      }
      openings.current += 1;
      const made = { ...entry, key: String(openings.current) };
      list = [...list.filter((open) => open !== same), made];
      if (index === 0) first = made.key;
    });
    reviewsRef.current = list;
    setReviews(list);
    if (first !== null) setTab(reviewTabId(first));
  }, []);

  /** ‹ Playlists: close this review and go back to the rows. */
  const closeReview = useCallback((key: string) => {
    reviewsRef.current = reviewsRef.current.filter((entry) => entry.key !== key);
    setReviews(reviewsRef.current);
    setTab("playlists");
    saveMatchTab("playlists");
    setPanelOpen(false);
  }, []);

  // The Inspector's link: the library's review, on that track.
  const focusToken = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focusToken.current === focus.token) return;
    focusToken.current = focus.token;
    showReviews([{ source: {}, name: WHOLE_LIBRARY_NAME, trackId: focus.trackId }]);
  }, [focus, showReviews]);

  // Reviews opened from the page: a match that finished, or the toast's Review.
  const openingToken = useRef<string | null>(null);
  useEffect(() => {
    if (!reviewOpening || openingToken.current === reviewOpening.token) return;
    openingToken.current = reviewOpening.token;
    showReviews(
      reviewOpening.targets.map((target) => ({
        source: target.playlistId === null ? {} : { playlistId: target.playlistId },
        name: target.name,
      })),
    );
    onReviewOpened?.();
  }, [onReviewOpened, reviewOpening, showReviews]);

  /** Review, on a row: that playlist's tracks; null is the whole library. */
  const reviewPlaylist = useCallback(
    (picked: CleanPlaylistStatus | null) => {
      showReviews([
        picked
          ? { source: { playlistId: picked.id }, name: picked.name }
          : { source: {}, name: WHOLE_LIBRARY_NAME },
      ]);
    },
    [showReviews],
  );

  /** Open, from Past searches: that run's tracks, all of them. */
  const openRun = useCallback(
    (picked: MatchRun) => {
      showReviews([{ source: { jobId: picked.job_id }, name: picked.label ?? whatLine(picked) }]);
    },
    [showReviews],
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

  const tabs = [
    { id: "playlists", label: "Playlists" },
    ...reviews.map((entry) => ({ id: reviewTabId(entry.key), label: `Review ${entry.name}` })),
    { id: "past", label: "Past searches" },
  ];
  const current = reviews.find((entry) => reviewTabId(entry.key) === active) ?? null;

  return (
    <div className="match-area">
      <Tabs tabs={tabs} activeId={active} onChange={chooseTab} variant="sub" />

      <div className="match-area__body">
        {active === "playlists" && (
          <PlaylistsView
            data={playlists.data}
            error={playlists.error}
            loading={playlists.loading}
            matching={match.matching}
            onMatch={onMatch}
            onReview={reviewPlaylist}
          />
        )}
        {current && (
          <ReviewTab
            key={current.key}
            source={current.source}
            name={current.name}
            version={match.ended + match.started}
            matching={match.matching}
            onPanelChange={setPanelOpen}
            onBack={() => closeReview(current.key)}
            onChanged={onHealthChanged}
            initialTrackId={current.trackId}
          />
        )}
        {active === "past" && (
          <PastSearches
            version={match.ended + match.started}
            matching={match.matching}
            openId={reviews.find((entry) => entry.source.jobId !== undefined)?.source.jobId ?? null}
            onOpen={openRun}
            onResume={resumeRun}
            onMatchAgain={matchAgain}
          />
        )}
      </div>
    </div>
  );
}
