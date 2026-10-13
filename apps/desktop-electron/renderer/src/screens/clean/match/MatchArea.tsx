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
  /** The Playlists view's rows, and which are ticked (the page owns the ticks: its header reads them). */
  playlists: CleanPlaylistsState;
  ticked: ReadonlySet<string>;
  onTick: (key: string, on: boolean) => void;
  /** Which sub-tab is open, said up so the header shows Match N playlists only on Playlists (C22). */
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
  ticked,
  onTick,
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
      setScope(picked.waiting > 0 ? DEFAULT_MATCH_SCOPE : EVERYTHING);
      restart();
      setTab("one");
      saveMatchTab("one");
    },
    [restart],
  );

  /** Review N: One at a time, on this playlist's tracks waiting for a yes or no (C22). */
  const reviewPlaylist = useCallback(
    (picked: CleanPlaylistStatus | null) => {
      setRun(null);
      setPlaylist(picked ? { id: picked.id, name: picked.name } : null);
      setScope(DEFAULT_MATCH_SCOPE);
      setReviewing(picked ? picked.id : null);
      restart();
      setTab("one");
      saveMatchTab("one");
    },
    [restart],
  );

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
  const oneEmpty = list.total > 0 || reading ? readingNode : emptyNode;

  const scopeOptions = matchScopeOptions(run !== null);
  const scopeHint = scopeOptions.find((option) => option.id === scope)?.hint;
  const waitingList = scope === "needs_review";
  // A decision counts as checked at once, while the list still holds the track
  // until it is read again: do not count it twice in that gap.
  const stale =
    unreflected && (list.identity === unreflected.from || !list.answered) ? unreflected.count : 0;
  const progressTotal = checked + Math.max(0, list.total - stale);

  return (
    <div className="match-area">
      <Tabs tabs={MATCH_TABS.map((entry) => ({ ...entry }))} activeId={tab} onChange={chooseTab} />

      {tab !== "past" && tab !== "playlists" && (
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
                aria-valuemax={progressTotal}
                aria-valuenow={checked}
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
            ticked={ticked}
            onTick={onTick}
            onReview={reviewPlaylist}
            onSave={onSavePlaylist}
          />
        )}
        {tab === "one" && (
          <OneAtATime
            row={row}
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
            onSkip={() => moveTo(at + 1)}
            onPreviousTrack={() => moveTo(at - 1)}
            onNextTrack={() => moveTo(at + 1)}
            onPlayFile={() => {
              void playFile();
            }}
            onSearchBeatport={searchBeatport}
            onSearchAgain={searchAgain}
            emptyState={oneEmpty}
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
