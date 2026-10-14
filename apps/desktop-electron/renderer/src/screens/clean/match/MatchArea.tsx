/**
 * The Match area (C14, C22, DEC-072 amended).
 *
 * Four sub-tabs: **Playlists** (the default, where Match opens: your playlists
 * and how far each is), then three over one shared list: **One at a time**
 * (one track per screen, beside the best match Beatport found), **Table**
 * (every track's before → after, to take many at once) and **Past searches**
 * (every match run). Review N on a playlist opens One at a time on that
 * playlist's waiting tracks. One at a time and the Table are two views of one list, so the
 * list is owned here: **Show** (where a track stands with Beatport) and
 * **From** (all searches, one run, or the playlist Review opened) make one `LibraryQuery`, read a window at
 * a time as the Library's browse is (DEC-040, DEC-041).
 *
 * **Correct accepts the match and copies the ticked values as one act**, one
 * batch under one id, and Undo reverts that batch. Auto-accept still applies
 * nothing (DEC-004). The page is the one place that sends a decision; the views
 * draw and report.
 *
 * **The cursor stays at the same place.** A decision usually takes the track
 * out of "Waiting for you", so the next one moves into its place — which is
 * only right once the list has been read again, so the page waits for that
 * answer before showing a track. If the track is still in the list (another
 * Show), the cursor moves on instead.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  EntityKind,
  CleanPlaylistStatus,
  LibraryHealth,
  LibraryTrackRow,
  MatchCandidate,
  MatchRun,
} from "../../../api/cuepointBridge.types";
import { Button, useToast } from "../../../components";
import { Select } from "../../../components/Select";
import { Tabs } from "../../../components/Tabs";
import { useInspectorSlot } from "../../../components/shell";
import { useReportSelectedTrack } from "../../../components/shell/useReportSelectedTrack";
import { reportUnexpected } from "../../../reporting/reporting";
import { TrackDetailPanel } from "../../library/TrackDetailPanel";
import { revealTrack } from "../revealTrack";
import { batchSelection } from "../../library/libraryBatch";
import { openOnBeatport } from "../../discover/openOnBeatport";
import { followJob } from "../../library/followJob";
import { useLibraryPlayback } from "../../library/useLibraryPlayback";
import type { SortDirection } from "../../library/libraryQuery";
import { useTrackDetail } from "../../library/useTrackDetail";
import { useTrackSelection } from "../../library/useTrackSelection";
import { useTrackWindow } from "../../library/useTrackWindow";
import type { CleanOpening } from "../cleanLink";
import { reviewEmptyState } from "../cleanEmpty";
import {
  correctedLine,
  correctedManyLine,
  notThisLine,
  nothingToCorrectLine,
  nothingToCorrectManyLine,
  trackCount,
  undidLine,
} from "../cleanFormat";
import { REVIEW_SCOPES } from "../cleanRules";
import type { CleanTracks } from "../cleanTracks";
import type { CleanMatch } from "../useCleanMatch";
import { reviewDoneWords, reviewHeaderWords, type ReviewTarget } from "./matchReview";
import { ReviewDone } from "./ReviewDone";
import { CARD_FIELDS, type CardField, type CorrectPlan } from "./matchCard";
import {
  ALL_SEARCHES,
  DEFAULT_MATCH_SCOPE,
  isMatchScope,
  matchQuery,
  matchScopeOptions,
  type MatchSource,
  runOptionLabel,
  runSelection,
  EVERYTHING,
  type MatchScope,
} from "./matchScope";
import { MatchTable } from "./MatchTable";
import { OneAtATime } from "./OneAtATime";
import { PastSearches } from "./PastSearches";
import { PlaylistsView } from "./PlaylistsView";
import { TakeMenu } from "./TakeMenu";
import type { CleanPlaylistsState } from "./useCleanPlaylists";
import type { MatchStatus } from "./StatusLine";
import { useMatchJobs } from "./useMatchJobs";
import { useMatchTicks } from "./useMatchTicks";
import "./match.css";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";

export type MatchTab = "playlists" | "one" | "table" | "past";

/**
 * Review N › opened from a toast, from another page (C22): the run that ended, and the playlist
 * it was started from. Applied once per `token`, as a track the Library opens is.
 */
export interface ReviewOpening {
  token: string;
  run: MatchRun;
  playlistId: number | null;
  name: string;
}

const MATCH_TABS: ReadonlyArray<{ id: MatchTab; label: string }> = [
  { id: "playlists", label: "Playlists" },
  { id: "one", label: "One at a time" },
  { id: "table", label: "Table" },
  { id: "past", label: "Past searches" },
];

/** The sub-tab last used, remembered the way the Clean page's own tab is. */
export const MATCH_TAB_STORAGE_KEY = "cuepoint-clean-match-tab";

export function loadMatchTab(): MatchTab {
  try {
    const stored = localStorage.getItem(MATCH_TAB_STORAGE_KEY);
    return MATCH_TABS.find((entry) => entry.id === stored)?.id ?? "playlists";
  } catch {
    return "playlists";
  }
}

function saveMatchTab(tab: MatchTab): void {
  try {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, tab);
  } catch {
    // Remembering is a convenience; the area works without it.
  }
}

/** A row to settle on once the list has been read again after a decision. */
interface PendingMove {
  /** The question the list was answering when the decision was made. */
  from: string;
  trackId: number | null;
}

interface MatchAreaProps {
  health: LibraryHealth | null;
  onHealthChanged: () => void;
  /**
   * A track the Library asked to open (CLEAN-13). The area opens on One at a
   * time, on the list that holds the track in its own state, at the track.
   */
  focus?: CleanOpening | null;
  /** Open an artist's or a label's page from the Inspector's credits (DISCOVER-11). */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
  /** The page's matching: running state, how many ended, and resuming. */
  match: CleanMatch;
  /** Open the match window: on the library (CLN-2's offer), or on the tracks given. */
  onMatchTracks: (tracks?: CleanTracks) => void;
  /** The Playlists view's rows. */
  playlists: CleanPlaylistsState;
  /** A playlist's Match button (null is the whole library); the page starts the run. */
  onMatchPlaylist: (playlist: CleanPlaylistStatus | null) => void;
  /** The run a row's last Match started in this session, so Review opens on that run (C22). */
  runFor?: (playlist: CleanPlaylistStatus | null) => string | undefined;
  /** A row's run has been reviewed to its end, or no longer matches what the row waits on: forget it. */
  onRunSpent?: (playlistId: number | null) => void;
  /** A Review N › opened from the end-of-run toast. */
  reviewOpening?: ReviewOpening | null;
  /** The opening has been used, so coming back to this tab does not apply it again. */
  onReviewOpened?: () => void;
  /** Which sub-tab is open, said up so the page knows whether the rows are in view (C22). */
  onTabChange?: (tab: MatchTab) => void;
  /** A row's "Save N to files…": the window on that playlist, or the library for its row (C22, C23). */
  onSavePlaylist?: (playlist: CleanPlaylistStatus | null) => void;
}

export function MatchArea({
  health,
  onHealthChanged,
  focus = null,
  onOpenEntity,
  match,
  onMatchTracks,
  playlists,
  onMatchPlaylist,
  runFor,
  onRunSpent,
  reviewOpening = null,
  onReviewOpened,
  onTabChange,
  onSavePlaylist,
}: MatchAreaProps) {
  const { push } = useToast();
  const [tab, setTab] = useState<MatchTab>(loadMatchTab);
  const [scope, setScope] = useState<MatchScope>(DEFAULT_MATCH_SCOPE);
  const [run, setRun] = useState<MatchRun | null>(null);
  const [order, setOrder] = useState<{ sort: string; dir: SortDirection }>({
    sort: "artist",
    dir: "asc",
  });
  // From can also hold a playlist, while Review N opened the list on one (C22).
  const [playlist, setPlaylist] = useState<{ id: number; name: string } | null>(null);
  // Review N just opened the list: if nothing waits in it as a new match, what waits is a decision
  // a newer match disagrees with, so it looks there once (the engine's "waiting" counts both).
  const [reviewing, setReviewing] = useState<number | null>(null);
  // What Review N › is reviewing, while it is: the header over the card and the screen after the last track.
  const [review, setReview] = useState<ReviewTarget | null>(null);
  // Tracks skipped in this review, so Skip on the last card can wrap round, and the review can end on them.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const [skipDone, setSkipDone] = useState(false);
  const runId = run?.job_id ?? null;
  const source = useMemo<MatchSource | null>(
    () =>
      playlist
        ? { kind: "playlist", id: playlist.id, name: playlist.name }
        : runId
          ? { kind: "run", id: runId }
          : null,
    [playlist, runId],
  );
  const query = useMemo(() => matchQuery(scope, source, order), [scope, source, order]);

  const list = useTrackWindow(query);
  const selection = useTrackSelection(query, list.total, list.source.getRow);
  const [cursor, setCursor] = useState(0);
  const at = list.total === 0 ? 0 : Math.min(cursor, list.total - 1);
  const liveRow = list.total === 0 ? null : (list.source.getRow(at) ?? null);

  const [pending, setPending] = useState<PendingMove | null>(null);
  // While the list is read again for a reason that does not change the track
  // under the cursor (a match ending, Health changing), the card keeps the
  // track it had, and with it the reviewer's choice of result (CLEAN-14). After
  // a decision the track is gone: the card waits for the next one instead.
  // It is the track at *this* index only: a cursor that moved to a row not yet
  // read (across a page edge) must not keep acting on the previous track.
  const lastRow = useRef<{ row: LibraryTrackRow; at: number } | null>(null);
  if (liveRow) lastRow.current = { row: liveRow, at };
  const kept = lastRow.current?.at === at ? lastRow.current.row : null;
  const row = liveRow ?? (pending === null && list.total > 0 ? kept : null);

  const { ticks, toggle } = useMatchTicks();
  const [checked, setChecked] = useState(0);
  // Tracks counted as checked that the list has not been read again to drop yet.
  const [unreflected, setUnreflected] = useState<{ from: string; count: number } | null>(null);
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The Inspector shows the track the area is about: One at a time's, or the
  // Table's last clicked row.
  const tableRow = row && row.id === selection.selection.lastId ? row : null;
  const shownRow = tab === "one" ? row : tab === "table" ? tableRow : null;
  const inspectedId = shownRow?.id ?? null;
  const detail = useTrackDetail(inspectedId);
  useReportSelectedTrack(
    shownRow?.id != null ? { id: shownRow.id, key: shownRow.effective_key ?? null } : null,
  );

  useEffect(() => {
    onTabChange?.(tab);
  }, [onTabChange, tab]);

  const chooseTab = useCallback((id: string) => {
    const next = MATCH_TABS.find((entry) => entry.id === id)?.id;
    if (!next) return;
    setTab(next);
    saveMatchTab(next);
  }, []);

  /** Show or From changed: a new question, so the count of checked tracks starts again. */
  const restart = useCallback(() => {
    setCursor(0);
    setChecked(0);
    setUnreflected(null);
    setStatus(null);
    setPending(null);
    setSkipped(new Set());
    setSkipDone(false);
  }, []);

  // ----------------------------------------------------------- the list

  // A match ending, wherever it was started, changes the list, the card and the counts.
  const endedSeen = useRef(match.ended);
  useEffect(() => {
    if (endedSeen.current === match.ended) return;
    endedSeen.current = match.ended;
    list.reload();
    detail.reload();
    setVersion((value) => value + 1);
    onHealthChanged();
  }, [detail, list, match.ended, onHealthChanged]);

  // The row under the cursor, asked for when it has not arrived.
  useEffect(() => {
    if (tab !== "one" || list.total === 0 || list.source.getRow(at)) return;
    list.source.requestWindow?.(at, at);
  }, [tab, at, list.source, list.total]);

  // After a decision: once the list has been read again, settle on the next track.
  useEffect(() => {
    if (!pending) return;
    if (!list.answered || list.identity === pending.from) return;
    if (list.total === 0) {
      setPending(null);
      return;
    }
    const index = Math.min(cursor, list.total - 1);
    const here = list.source.getRow(index);
    if (!here) {
      list.source.requestWindow?.(index, index);
      return;
    }
    // Still in this list (another Show): move on rather than stay on it.
    if (pending.trackId != null && here.id === pending.trackId) {
      setCursor(Math.min(index + 1, list.total - 1));
    }
    setPending(null);
  }, [cursor, list, pending]);

  /** Count tracks as checked now, and stop counting them in the list until it is read again. */
  const counted = useCallback(
    (tracks: number) => {
      setChecked((count) => count + tracks);
      setUnreflected({ from: list.identity, count: tracks });
    },
    [list.identity],
  );

  /** Everything a change to one track makes stale; the cursor stays where it is. */
  const afterChange = useCallback(
    (trackId: number | null) => {
      if (trackId !== null) {
        setSkipped((current) => {
          if (!current.has(trackId)) return current;
          const next = new Set(current);
          next.delete(trackId);
          return next;
        });
      }
      setPending({ from: list.identity, trackId });
      list.reload();
      detail.reload();
      setVersion((value) => value + 1);
      onHealthChanged();
    },
    [detail, list, onHealthChanged],
  );

  const moveTo = useCallback(
    (index: number) => {
      if (list.total === 0) return;
      setCursor(Math.max(0, Math.min(list.total - 1, index)));
    },
    [list.total],
  );

  /**
   * Skip. In a review it wraps: on the last card, what is before it was skipped, so the next is the
   * first of those; and once every track left has been skipped the review ends on them.
   */
  const skip = useCallback(() => {
    if (!review || tab !== "one" || row?.id == null) {
      moveTo(at + 1);
      return;
    }
    const next = new Set(skipped).add(row.id);
    setSkipped(next);
    if (next.size >= list.total) {
      setSkipDone(true);
      return;
    }
    setCursor(at >= list.total - 1 ? 0 : at + 1);
  }, [at, list.total, moveTo, review, row, skipped, tab]);

  // ----------------------------------------------------------- Opened on a track (CLEAN-13)

  const focusToken = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focusToken.current === focus.token) return;
    focusToken.current = focus.token;
    setTab("one");
    const read = window.cuepoint?.getLibraryTrack;
    if (!read) return;
    let cancelled = false;
    read({ trackId: focus.trackId })
      .then(async ({ track }) => {
        if (cancelled) return;
        const state = track.match_disputed ? "disputed" : track.match_state;
        const next: MatchScope =
          state && REVIEW_SCOPES.some((entry) => entry.id === state)
            ? (state as MatchScope)
            : DEFAULT_MATCH_SCOPE;
        const target = matchQuery(next, null, order);
        const index = await selection.pickTrack(focus.trackId, target);
        if (cancelled) return;
        setRun(null);
        setPlaylist(null);
        setReview(null);
        setScope(next);
        setChecked(0);
        setStatus(null);
        setCursor(index >= 0 ? index : 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // The opening is spent once: the order and the selection are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // ----------------------------------------------------------- deciding

  const correct = useCallback(
    async (candidate: MatchCandidate, plan: CorrectPlan) => {
      const trackId = row?.id;
      if (trackId == null) return;
      const bridge = window.cuepoint?.correctMatch;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return;
      }
      const title = row?.title ?? "this track";
      setBusy(true);
      try {
        const outcome = await bridge({
          track_id: trackId,
          candidate_id: candidate.id,
          fields: plan.fields,
          ...(plan.replaceKey ? { replace_key: true } : {}),
        });
        if (!alive.current) return;
        setBusy(false);
        counted(1);
        // Nothing changed: there is nothing to undo, so none is offered.
        setStatus(
          outcome.changed && outcome.batch_id
            ? {
                text: correctedLine(title),
                batchId: outcome.batch_id,
                undoText: undidLine(title),
                tracks: 1,
              }
            : { text: nothingToCorrectLine(title), batchId: null },
        );
        afterChange(trackId);
      } catch (cause) {
        reportUnexpected(cause);
        if (alive.current) setBusy(false);
        push(userMessage(cause), "warning");
      }
    },
    [afterChange, counted, push, row],
  );

  const notThisTrack = useCallback(async () => {
    const trackId = row?.id;
    if (trackId == null) return;
    const bridge = window.cuepoint?.decideMatch;
    if (!bridge) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    const title = row?.title ?? "this track";
    setBusy(true);
    try {
      await bridge({ decision: "reject", track_id: trackId });
      if (!alive.current) return;
      setBusy(false);
      counted(1);
      // A rejection is undone from Track details → History, as it was before.
      setStatus({ text: notThisLine(title), batchId: null });
      afterChange(trackId);
    } catch (cause) {
      reportUnexpected(cause);
      if (alive.current) setBusy(false);
      push(userMessage(cause), "warning");
    }
  }, [afterChange, counted, push, row]);

  const undo = useCallback(async () => {
    const batchId = status?.batchId;
    if (!batchId) return;
    const bridge = window.cuepoint?.revertBatch;
    if (!bridge) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    const { undoText, tracks = 0 } = status;
    setBusy(true);
    try {
      const outcome = await bridge({ batch_id: batchId });
      if (!alive.current) return;
      setBusy(false);
      setChecked((count) => Math.max(0, count - tracks));
      const jobId = outcome.job_id ?? outcome.id;
      const refresh = () => {
        list.reload();
        detail.reload();
        setVersion((value) => value + 1);
        onHealthChanged();
      };
      if (jobId) {
        setStatus({
          text: "Undoing in the background. The bar at the bottom shows progress.",
          batchId: null,
        });
        // The tracks are back only once the job has run: read the list then.
        void followJob(jobId).finished.then(() => {
          if (!alive.current) return;
          setStatus({ text: undoText ?? "Undone.", batchId: null });
          refresh();
        });
        return;
      }
      setStatus({ text: undoText ?? "Undone.", batchId: null });
      refresh();
    } catch (cause) {
      reportUnexpected(cause);
      if (alive.current) setBusy(false);
      push(userMessage(cause), "warning");
    }
  }, [detail, list, onHealthChanged, push, status]);

  const takeTicked = useCallback(async () => {
    if (selection.count === 0) return;
    const bridge = window.cuepoint?.correctMatches;
    if (!bridge) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    const fields = CARD_FIELDS.filter(
      (field): field is Exclude<CardField, "key"> => field !== "key" && ticks.has(field),
    );
    const ticked = selection.count;
    setBusy(true);
    try {
      const outcome = await bridge({
        selection: batchSelection(selection.selection, query),
        fields,
        ...(ticks.has("key") ? { replace_key: true } : {}),
      });
      if (!alive.current) return;
      setBusy(false);
      if (outcome.applied) {
        const { changed, batch_id: batchId } = outcome.applied;
        counted(changed);
        setStatus(
          changed > 0
            ? {
                text: correctedManyLine(changed),
                batchId,
                undoText: `Undid the correction of ${trackCount(changed)}.`,
                tracks: changed,
              }
            : { text: nothingToCorrectManyLine(), batchId: null },
        );
        selection.clear();
        list.reload();
        detail.reload();
        onHealthChanged();
        return;
      }
      if (outcome.job_id ?? outcome.id) {
        setStatus({
          text: "Correcting the ticked tracks in the background. The bar at the bottom shows progress.",
          batchId: null,
        });
        selection.clear();
        const handle = followJob((outcome.job_id ?? outcome.id)!);
        void handle.finished.then(() => {
          if (!alive.current) return;
          setStatus({ text: "Corrected the ticked tracks.", batchId: null });
          // The job's own count is not sent back: the ticked tracks are what it was asked to do.
          counted(ticked);
          list.reload();
          detail.reload();
          setVersion((value) => value + 1);
          onHealthChanged();
        });
      }
    } catch (cause) {
      reportUnexpected(cause);
      if (alive.current) setBusy(false);
      push(userMessage(cause), "warning");
    }
  }, [counted, detail, list, onHealthChanged, push, query, selection, ticks]);

  // ----------------------------------------------------------- playing and searching

  const playback = useLibraryPlayback({ query, onMessage: (text) => push(text, "info") });
  const playFile = useCallback(() => {
    void playback.playRow(at);
  }, [at, playback]);

  const searchBeatport = useCallback(() => {
    if (!row) return;
    const words = encodeURIComponent(`${row.artist} ${row.title}`.trim());
    void openOnBeatport([`https://www.beatport.com/search?q=${words}`]).then((problem) => {
      if (problem) push(problem, "warning");
    });
  }, [push, row]);

  const searchAgain = useCallback(() => {
    if (row?.id == null) return;
    match.start("rematch", { track_ids: [row.id] }, true, `1 track: "${row.title}"`);
  }, [match, row]);

  // ----------------------------------------------------------- Past searches

  const openRun = useCallback(
    (picked: MatchRun) => {
      setRun(picked);
      setPlaylist(null);
      setReview(null);
      setScope(picked.waiting > 0 ? DEFAULT_MATCH_SCOPE : EVERYTHING);
      restart();
      setTab("one");
      saveMatchTab("one");
    },
    [restart],
  );

  /**
   * Review N ›: One at a time, on the tracks to check of the run the row's last Match started
   * (From: one run). The row counts every track of the playlist waiting, across runs, so when the
   * run holds fewer than that (earlier runs left some, or decisions a newer match disagrees with),
   * or none, the review is of the playlist instead, and the run is forgotten (C22).
   */
  const reviewPlaylist = useCallback(
    (picked: CleanPlaylistStatus | null) => {
      const counts = picked ?? playlists.data?.whole_library;
      const start = (found: MatchRun | null) => {
        const byRun = found !== null && found.waiting > 0 && found.waiting >= (counts?.waiting ?? 0);
        if (found && !byRun) onRunSpent?.(picked ? picked.id : null);
        setRun(byRun ? found : null);
        setPlaylist(byRun || !picked ? null : { id: picked.id, name: picked.name });
        setScope(DEFAULT_MATCH_SCOPE);
        setReviewing(!byRun && picked ? picked.id : null);
        setReview({
          name: picked ? picked.name : "Whole library",
          playlistId: picked ? picked.id : null,
          sure: byRun ? found.found : (counts?.accepted ?? 0),
          fromRun: byRun,
        });
        restart();
        setTab("one");
        saveMatchTab("one");
      };
      const jobId = runFor?.(picked);
      const read = window.cuepoint?.getMatchJobs;
      if (!jobId || !read) {
        start(null);
        return;
      }
      void read({ limit: 20 })
        .then((answer) => start(answer.jobs.find((entry) => entry.job_id === jobId) ?? null))
        .catch(() => start(null));
    },
    [onRunSpent, playlists.data, restart, runFor],
  );

  // Review N › from the end-of-run toast, from another page: the page hands the run over.
  const openingToken = useRef<string | null>(null);
  useEffect(() => {
    if (!reviewOpening || openingToken.current === reviewOpening.token) return;
    openingToken.current = reviewOpening.token;
    setRun(reviewOpening.run);
    setPlaylist(null);
    setScope(DEFAULT_MATCH_SCOPE);
    setReviewing(null);
    setReview({ name: reviewOpening.name, playlistId: reviewOpening.playlistId, sure: reviewOpening.run.found, fromRun: true });
    restart();
    setTab("one");
    saveMatchTab("one");
    onReviewOpened?.();
  }, [onReviewOpened, restart, reviewOpening]);

  /** ‹ Playlists: leave the review and go back to the rows. */
  const leaveReview = useCallback(() => {
    setReview(null);
    setRun(null);
    setPlaylist(null);
    setScope(DEFAULT_MATCH_SCOPE);
    setReviewing(null);
    restart();
    setTab("playlists");
    saveMatchTab("playlists");
  }, [restart]);

  useEffect(() => {
    if (reviewing === null || !list.answered) return;
    setReviewing(null);
    if (list.total === 0 && scope === DEFAULT_MATCH_SCOPE && playlist?.id === reviewing) {
      setScope("disputed");
    }
  }, [list.answered, list.total, playlist, reviewing, scope]);

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

  const jobs = useMatchJobs("", match.ended + match.started);
  const fromOptions = useMemo(() => {
    const runs = [...jobs.runs];
    if (run && !runs.some((entry) => entry.job_id === run.job_id)) runs.unshift(run);
    return runs;
  }, [jobs.runs, run]);
  const now = new Date();
  // K12: with one search or none, From has nothing to choose between. It shows
  // for two or more, and while a search or a playlist is the source, so that
  // can be seen and cleared.
  const showFrom = fromOptions.length >= 2 || run !== null || playlist !== null;
  // From going away under the user's focus (clearing the only source) must not
  // drop focus to the page: it moves to Show, the select beside it.
  const fromShown = useRef(showFrom);
  useEffect(() => {
    const was = fromShown.current;
    fromShown.current = showFrom;
    if (!was || showFrom) return;
    const active = document.activeElement;
    if (!active || active === document.body) document.getElementById("match-show")?.focus();
  }, [showFrom]);

  // ----------------------------------------------------------- the Inspector

  const reveal = useCallback(() => {
    const id = inspectedId;
    if (id == null) return;
    void revealTrack(id).then((outcome) => {
      if (outcome) push(outcome.message, outcome.tone);
    });
  }, [inspectedId, push]);

  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={tab === "table" ? selection.count : 1}
      onReveal={reveal}
      onError={(text) => push(text, "warning")}
      onMessage={(text) => push(text, "success")}
      onOpenEntity={onOpenEntity}
      onTrackChanged={() => {
        list.reload();
        detail.reload();
        setVersion((value) => value + 1);
        onHealthChanged();
      }}
    />,
  );

  // ----------------------------------------------------------- what to say when there is nothing

  // An error is said, not waited out.
  const reading = (!list.answered || pending !== null) && !list.error;
  const empty = reviewEmptyState({
    scope,
    scoped: run !== null || playlist !== null,
    health,
    error: list.error,
  });
  const trackTotal = health?.track_count ?? 0;
  const emptyNode = (
    <div className="clean-empty">
      <p className="clean-empty__headline">{empty.headline}</p>
      {empty.hint && <p className="clean-empty__hint">{empty.hint}</p>}
      {empty.offer === "match_all" && (
        <div className="clean-empty__actions">
          <Button disabled={match.matching} onClick={() => onMatchTracks()}>
            {`Match all ${trackCount(trackTotal)}…`}
          </Button>
        </div>
      )}
    </div>
  );
  const readingNode = <p className="match-one__reading">Reading the next track…</p>;

  const scopeOptions = matchScopeOptions(run !== null);
  const scopeHint = scopeOptions.find((option) => option.id === scope)?.hint;
  const waitingList = scope === "needs_review";
  // A decision counts as checked at once, while the list still holds the track
  // until it is read again: do not count it twice in that gap.
  const stale =
    unreflected && (list.identity === unreflected.from || !list.answered) ? unreflected.count : 0;
  const progressTotal = checked + Math.max(0, list.total - stale);

  // Review N ›: the header replaces Show and From on One at a time, and a done screen follows the last track.
  const toCheck = playlists.data?.whole_library.waiting ?? 0;
  const inReview = review !== null && tab === "one";
  const reviewCounts = !review
    ? null
    : review.playlistId === null
      ? (playlists.data?.whole_library ?? null)
      : (playlists.data?.playlists.find((entry) => entry.id === review.playlistId) ?? null);
  const reviewRow =
    review?.playlistId != null
      ? (playlists.data?.playlists.find((entry) => entry.id === review.playlistId) ?? null)
      : null;
  const listDone = inReview && list.total === 0 && !reading && list.answered && !list.error;
  // Everything left was skipped, and each has been skipped once: the review ends on them.
  const reviewDone = listDone || (inReview && skipDone);
  // Each progress bar has a range: never 0 wide.
  const barMax = Math.max(1, progressTotal);
  const reviewHeader =
    inReview && review && !reviewDone ? (
      <div className="match-review-bar" role="group" aria-label="Reviewing">
        <Button variant="secondary" icon="chevron-left" onClick={leaveReview}>
          Playlists
        </Button>
        <strong className="match-review-bar__name">Reviewing {review.name}</strong>
        <div
          className="match-progress__bar match-review-bar__bar"
          role="progressbar"
          aria-label="Checked so far"
          aria-valuemin={0}
          aria-valuemax={barMax}
          aria-valuenow={Math.min(checked, barMax)}
        >
          <div
            className="match-progress__fill"
            style={{ width: `${Math.round((Math.min(checked, barMax) / barMax) * 100)}%` }}
          />
        </div>
        <span className="match-review-bar__words">
          {reviewHeaderWords(Math.min(progressTotal, checked + at + 1), progressTotal, review.sure)}
        </span>
      </div>
    ) : null;
  const reviewDoneNode =
    review && reviewCounts ? (
      <ReviewDone
        {...reviewDoneWords(review.name, reviewCounts, skipDone ? skipped.size : 0)}
        saveCount={reviewCounts.unsaved}
        onSave={onSavePlaylist ? () => onSavePlaylist(reviewRow) : undefined}
        onBack={leaveReview}
        onAgain={
          skipDone
            ? () => {
                setSkipped(new Set());
                setSkipDone(false);
                setCursor(0);
              }
            : undefined
        }
      />
    ) : null;
  const oneEmpty =
    reviewDone && reviewDoneNode
      ? reviewDoneNode
      : list.total > 0 || reading
        ? readingNode
        : (reviewDoneNode ?? emptyNode);

  // A review that has run to its end no longer needs the run it was opened on.
  const spentFor = useRef<string | null>(null);
  useEffect(() => {
    if (!listDone || !review?.fromRun) return;
    const key = String(review.playlistId);
    if (spentFor.current === key) return;
    spentFor.current = key;
    onRunSpent?.(review.playlistId);
  }, [listDone, onRunSpent, review]);
  useEffect(() => {
    if (!review) spentFor.current = null;
  }, [review]);

  return (
    <div className="match-area">
      <Tabs
        tabs={MATCH_TABS.map((entry) => ({
          ...entry,
          // The count of tracks waiting for a yes or no, on the tab that reviews them.
          label: entry.id === "one" && toCheck > 0 ? `${entry.label} (${toCheck.toLocaleString()})` : entry.label,
        }))}
        activeId={tab}
        onChange={chooseTab}
      />

      {reviewHeader}

      {tab !== "past" && tab !== "playlists" && !inReview && (
        <div className="match-toolbar" role="toolbar" aria-label="Match list">
          <Select
            label="Show"
            id="match-show"
            value={scope}
            onChange={(event) => {
              if (!isMatchScope(event.target.value, run !== null)) return;
              setScope(event.target.value);
              restart();
            }}
            options={scopeOptions.map((option) => ({ value: option.id, label: option.label }))}
          />
          {showFrom && (
            <Select
              label="From"
              id="match-from"
              value={playlist ? `playlist:${playlist.id}` : (runId ?? ALL_SEARCHES)}
              onChange={(event) => {
                const picked = fromOptions.find((entry) => entry.job_id === event.target.value) ?? null;
                setRun(picked);
                setPlaylist(null);
                setReview(null);
                if (!picked && scope === EVERYTHING) setScope(DEFAULT_MATCH_SCOPE);
                restart();
              }}
              options={[
                { value: ALL_SEARCHES, label: "All searches" },
                ...(playlist
                  ? [{ value: `playlist:${playlist.id}`, label: `This playlist: ${playlist.name}` }]
                  : []),
                ...fromOptions.map((entry) => ({
                  value: entry.job_id,
                  label: runOptionLabel(entry, now),
                })),
              ]}
            />
          )}
          {waitingList ? (
            <div className="match-progress">
              <span className="match-progress__text">
                {checked.toLocaleString()} of {progressTotal.toLocaleString()} checked
              </span>
              <div
                className="match-progress__bar"
                role="progressbar"
                aria-label="Checked so far"
                aria-valuemin={0}
                aria-valuemax={Math.max(1, progressTotal)}
                aria-valuenow={Math.min(checked, Math.max(1, progressTotal))}
              >
                <div
                  className="match-progress__fill"
                  style={{ width: `${progressTotal === 0 ? 0 : Math.round((checked / progressTotal) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="match-progress__text">{trackCount(list.total)}</span>
          )}
          <span className="match-toolbar__spacer" />
          {tab === "table" && (
            <TakeMenu
              ticks={ticks}
              onToggleTick={toggle}
              tracks={selection.count}
              busy={busy}
              onTake={() => void takeTicked()}
            />
          )}
        </div>
      )}
      {tab !== "past" && tab !== "playlists" && scopeHint && list.total > 0 && <p className="clean-hint-line">{scopeHint}</p>}

      <div className="match-area__body">
        {tab === "playlists" && (
          <PlaylistsView
            data={playlists.data}
            error={playlists.error}
            loading={playlists.loading}
            matching={match.matching}
            onMatch={onMatchPlaylist}
            onStop={match.stop}
            onReview={reviewPlaylist}
            onSave={onSavePlaylist}
          />
        )}
        {tab === "one" && (
          <OneAtATime
            row={inReview && skipDone ? null : row}
            version={version}
            position={at + 1}
            total={list.total}
            ticks={ticks}
            onToggleTick={toggle}
            busy={busy || reading}
            status={status}
            onUndo={() => void undo()}
            onCorrect={(candidate, plan) => void correct(candidate, plan)}
            onNotThis={() => void notThisTrack()}
            onSkip={skip}
            onPreviousTrack={() => moveTo(at - 1)}
            onNextTrack={() => moveTo(at + 1)}
            onPlayFile={() => {
              void playFile();
            }}
            onSearchBeatport={searchBeatport}
            onSearchAgain={searchAgain}
            emptyState={oneEmpty}
            reviewing={inReview}
          />
        )}
        {tab === "table" && (
          <MatchTable
            list={list}
            selection={selection}
            query={query}
            order={order}
            onOrder={setOrder}
            cursor={at}
            onCursor={setCursor}
            onOpen={(index) => {
              setCursor(index);
              chooseTab("one");
            }}
            ticks={ticks}
            status={status}
            busy={busy}
            onUndo={() => void undo()}
            emptyState={emptyNode}
          />
        )}
        {tab === "past" && (
          <PastSearches
            version={match.ended + match.started}
            matching={match.matching}
            openId={runId}
            onOpen={openRun}
            onResume={resumeRun}
            onMatchAgain={matchAgain}
          />
        )}
      </div>
    </div>
  );
}
