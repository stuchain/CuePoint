/**
 * The Match area (C14, C22, D13).
 *
 * One row at the top: the sub-tabs **Playlists** (the default, where Match opens: tick playlists
 * and match them) and **Past searches** (every match run; opening one opens its review), the
 * page's search at the left, where the Library's sits (C223), and the caption that says which of the
 * three steps this is ("Step 1 of 3 · Tick playlists"). There is no tab for a review: a review is a view inside Playlists.
 * While one is shown the Playlists sub-tab stays selected and a quiet **‹ Playlists** button sits
 * left of the caption; it returns to the list, which kept its scroll and its ticks (its pane is
 * hidden, not unmounted).
 *
 * A match that finishes opens the review of the first playlist it was started on, and so do
 * Review on a row, Open on a past search and the Inspector's link. What a review shows is a
 * playlist, a run (its resumes included) or, from the Inspector's link, every matched track. A tick
 * is the person's decision to sync a track; nothing is written to a value or a file until Sync.
 */
import { Activity, useCallback, useEffect, useRef, useState } from "react";

import type { CleanPlaylistStatus, MatchRun } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { SearchField } from "../../../components/SearchField";
import { Tabs, panelId, tabId } from "../../../components/Tabs";
import { usePageSearch } from "../../../components/usePageSearch";
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
import { loadMatchTab, saveMatchTab, stepCaption, type MatchTab, type MatchView } from "./matchTab";
import "./match.css";

export type { MatchTab, MatchView };

/** One playlist (or, with null, the whole library) to open a review for. */
export interface ReviewTarget {
  playlistId: number | null;
  name: string;
}

/**
 * Reviews opened from outside the area (a match that finished, the toast's Review). Only the first
 * target is shown, since a review is one view; the others are one Review button away on their
 * rows. Applied once per `token`, as a track the Library opens is.
 */
export interface ReviewOpening {
  token: string;
  targets: ReviewTarget[];
}

/** The review being shown. */
interface Reviewing {
  /** Which opening this is, so a review opened again starts clean. */
  key: string;
  source: ReviewSource;
  name: string;
  /** A track to open the panel on once the table is read (the Inspector's link). */
  trackId?: number;
  /** Open with "To check only" on: Match opens on the tracks that wait (D17). */
  toCheckOnly?: boolean;
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
  /** What is showing, and whether a review's panel is open, said up so a match that ends knows where it may land. */
  onViewChange?: (view: { tab: MatchView; panelOpen: boolean }) => void;
  /**
   * How many tracks wait for a decision, once Health is read (null before). Above zero, Match opens
   * on that list, with "To check only" on, instead of on the playlists (D17, M507).
   */
  toCheck?: number | null;
}

export function MatchArea({
  onHealthChanged,
  focus = null,
  match,
  playlists,
  onMatch,
  reviewOpening = null,
  onReviewOpened,
  onViewChange,
  toCheck = null,
}: MatchAreaProps) {
  const [tab, setTab] = useState<MatchTab>(loadMatchTab);
  const [review, setReview] = useState<Reviewing | null>(null);
  const openings = useRef(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // The one search of the row filters the list shown; each list keeps its own text.
  const [filter, setFilter] = useState("");
  const [pastText, setPastText] = useState("");
  // How many past matches there are (null until read): the search waits for one (M150).
  const [pastCount, setPastCount] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Panes already opened stay mounted (hidden) when another is shown, so coming back finds the
  // same scroll and ticks. A pane never opened is not drawn.
  const [opened, setOpened] = useState<ReadonlySet<MatchTab>>(new Set());
  if (!opened.has(tab)) setOpened(new Set([...opened, tab]));
  const view: MatchView = review ? "review" : tab;
  useEffect(() => {
    onViewChange?.({ tab: view, panelOpen: view === "review" && panelOpen });
  }, [onViewChange, panelOpen, view]);
  usePageSearch(review ? undefined : searchRef);

  // Where the Playlists step draws its action: the area's one toolbar (D17).
  const [actionHost, setActionHost] = useState<HTMLElement | null>(null);

  // Once Health says tracks wait, Match opens on them, unless something else already opened or the
  // person has chosen a tab. Decided once per visit, so going back to the playlists stays there.
  const decided = useRef(false);

  const closeReview = useCallback(() => {
    setReview(null);
    setPanelOpen(false);
  }, []);

  /** A sub-tab: also the way out of a review, which belongs to Playlists. */
  const chooseTab = useCallback(
    (id: string) => {
      decided.current = true;
      const next: MatchTab = id === "past" ? "past" : "playlists";
      setTab(next);
      saveMatchTab(next);
      closeReview();
    },
    [closeReview],
  );

  /** Show this review, replacing any other. */
  const showReview = useCallback((entry: { source: ReviewSource; name: string; trackId?: number; toCheckOnly?: boolean }) => {
    decided.current = true;
    openings.current += 1;
    setReview({ ...entry, key: String(openings.current) });
    setPanelOpen(false);
  }, []);

  useEffect(() => {
    if (decided.current || toCheck === null) return;
    decided.current = true;
    if (toCheck > 0 && tab === "playlists" && !focus && !reviewOpening) {
      showReview({ source: {}, name: WHOLE_LIBRARY_NAME, toCheckOnly: true });
    }
  }, [focus, reviewOpening, showReview, tab, toCheck]);

  // The Inspector's link: the library's review, on that track.
  const focusToken = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focusToken.current === focus.token) return;
    focusToken.current = focus.token;
    showReview({ source: {}, name: WHOLE_LIBRARY_NAME, trackId: focus.trackId });
  }, [focus, showReview]);

  // Reviews opened from the page: a match that finished, or the toast's Review.
  const openingToken = useRef<string | null>(null);
  useEffect(() => {
    if (!reviewOpening || openingToken.current === reviewOpening.token) return;
    openingToken.current = reviewOpening.token;
    const first = reviewOpening.targets[0];
    if (first) {
      showReview({ source: first.playlistId === null ? {} : { playlistId: first.playlistId }, name: first.name });
    }
    onReviewOpened?.();
  }, [onReviewOpened, reviewOpening, showReview]);

  /** Review, on a row: that playlist's tracks; null is the whole library. */
  const reviewPlaylist = useCallback(
    (picked: CleanPlaylistStatus | null) => {
      showReview(
        picked ? { source: { playlistId: picked.id }, name: picked.name } : { source: {}, name: WHOLE_LIBRARY_NAME },
      );
    },
    [showReview],
  );

  /** Open, from Past searches: that run's tracks, all of them. */
  const openRun = useCallback(
    (picked: MatchRun) => {
      showReview({ source: { jobId: picked.job_id }, name: picked.label ?? whatLine(picked) });
    },
    [showReview],
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
    { id: "past", label: "Past matches" },
  ];
  const caption = stepCaption(view, match.matching, review?.name);
  const shown = (visible: boolean) => (visible ? "visible" : "hidden");

  return (
    <div className="match-area">
      {/* One toolbar (D13, M147): the sub-tabs, the search, the step's action and the step caption at
          its right; a review adds a back line. The search follows the sub-tabs at the left, where
          the Library's search sits (C223). */}
      <div className="cp-toolbar match-area__row">
        <Tabs
          tabs={tabs}
          activeId={review ? "playlists" : tab}
          onChange={chooseTab}
          variant="sub"
          idPrefix="match"
          label="Match views"
        />
        {!review && (tab !== "past" || pastCount !== 0) && (
          <SearchField
            ref={searchRef}
            thing={tab === "past" ? "past matches" : "playlists"}
            label={tab === "past" ? "Search past matches" : "Filter playlists"}
            className="match-area__search"
            value={tab === "past" ? pastText : filter}
            onValueChange={tab === "past" ? setPastText : setFilter}
          />
        )}
        <div className="match-area__actions" ref={setActionHost} />
        {caption && <span className="match-area__caption">{caption}</span>}
      </div>
      {/* The way back is a quiet line of its own under the row, as the D13 mockup draws it. */}
      {review && (
        <div className="match-area__back">
          <Button variant="quiet" size="sm" icon="chevron-left" onClick={() => chooseTab("playlists")}>
            Playlists
          </Button>
        </div>
      )}

      <div
        className="match-area__body"
        role="tabpanel"
        id={panelId("match", review ? "playlists" : tab)}
        aria-labelledby={tabId("match", review ? "playlists" : tab)}
      >
        {opened.has("playlists") && (
          <Activity mode={shown(!review && tab === "playlists")}>
            <PlaylistsView
              data={playlists.data}
              error={playlists.error}
              onRetry={playlists.reload}
              loading={playlists.loading}
              filter={filter}
              matching={match.matching}
              onMatch={onMatch}
              onReview={reviewPlaylist}
              secondsLeft={match.secondsLeft}
              progress={match.progress}
              onStop={match.stop}
              actionHost={actionHost}
              active={!review && tab === "playlists"}
              onSynced={() => {
                playlists.reload();
                onHealthChanged();
              }}
            />
          </Activity>
        )}
        {review && (
          <ReviewTab
            key={review.key}
            source={review.source}
            name={review.name}
            version={match.ended + match.started}
            matching={match.matching}
            onPanelChange={setPanelOpen}
            onChanged={onHealthChanged}
            initialTrackId={review.trackId}
            startOnToCheck={review.toCheckOnly}
          />
        )}
        {opened.has("past") && (
          <Activity mode={shown(!review && tab === "past")}>
            <PastSearches
              search={pastText}
              version={match.ended + match.started}
              matching={match.matching}
              openId={review?.source.jobId ?? null}
              onOpen={openRun}
              onResume={resumeRun}
              onMatchAgain={matchAgain}
              onGoToPlaylists={() => chooseTab("playlists")}
              onCount={setPastCount}
            />
          </Activity>
        )}
      </div>
    </div>
  );
}
