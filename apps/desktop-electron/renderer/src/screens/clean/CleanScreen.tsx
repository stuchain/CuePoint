/**
 * The Clean page (CLEAN-12, DEC-072).
 *
 * Three parts behind tabs — Match, Missing files and Duplicates — over one
 * read of Library Health they all share (K3: Fix values moved to the Library's
 * own menus and Health to Statistics). The part last used is where the page
 * reopens (`cleanSections.ts`). The tab names and the buttons say what each
 * part is for, so no part opens with a paragraph (C15b); the tabs say where
 * work waits (CLN-3). The header is the shared `ScreenHeader`; its one action
 * lives on the Match tab only (K4: one home per action). Match is the
 * Match area (`match/MatchArea.tsx`): Playlists, the Review of a run (when one is open) and
 * Past searches.
 *
 * Match opens on Playlists (C22). Every playlist there has its own **Match**
 * (no ticks, no header button); the page starts that run and follows it. While any match
 * runs, a line at the top of every tab says what, how far and how long is left, with Stop,
 * read from the engine running job so it is right after leaving the page and coming
 * back. A run that ends lands on its Review (every track, with what was found); one that
 * found nothing says so in a red note instead, and from another page a toast says it, with
 * **Review N**. The match window stays for tracks handed in from other pages (`matchWith`).
 *
 * Every table here is the Library's `TrackTable` over the Library's windowed
 * browse with a rule set, and every action goes through a route CLEAN-11 built.
 * The page adds surface, not machinery: no second query path, no in-memory
 * results, no rule the engine does not already state.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CleanPlaylistStatus, EntityKind, LibrarySummary, MatchRun } from "../../api/cuepointBridge.types";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { EmptyState, IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { Tabs } from "../../components/Tabs";
import { DuplicatesView } from "./DuplicatesView";
import { MatchWindow } from "./MatchWindow";
import { MissingFilesView } from "./MissingFilesView";
import { MatchArea, type ReviewOpening } from "./match/MatchArea";
import { MatchRunningLine, NothingFoundNote } from "./match/MatchRunLine";
import { usePageActive } from "../../components/shell/pageActive";
import { WHOLE_LIBRARY_NAME, playlistKey, useCleanPlaylists } from "./match/useCleanPlaylists";
import { matchRowRequest } from "./match/matchPlaylists";
import { nothingFound as nothingFoundOf, nothingFoundTarget, type NothingFound } from "./match/matchDone";
import type { MatchTab } from "./match/matchTab";
import type { CleanMatchOpening, CleanOpening, CleanSectionOpening } from "./cleanLink";
import type { CleanTracks } from "./cleanTracks";
import { libraryImportState } from "../library/libraryLink";
import { entityPath } from "../discover/discoverLinks";
import {
  CLEAN_SECTIONS,
  loadCleanSection,
  sectionCounts,
  saveCleanSection,
  type CleanSection,
} from "./cleanSections";
import { unsavedInPlaylist, unsavedInRun, useSaveToFiles } from "../../components/saveToFiles/useSaveToFiles";
import { UNSAVED_SELECTION } from "../../components/saveToFiles/saveChoices";
import { useCleanHealth } from "./useCleanHealth";
import { useCleanMatch } from "./useCleanMatch";
import "../screens.css";
import "./clean.css";

interface CleanScreenProps {
  /**
   * A track to open in the Match area (CLEAN-13), from the Inspector's link.
   * Applied once per navigation, as the Library's `openWith` is.
   */
  openWith?: CleanOpening | null;
  /**
   * A part to open on (EXPORT-07): the Rekordbox export's missing-file count
   * opens Missing files (DEC-088). Applied once per navigation, as `openWith`
   * is, and not remembered as the part last used — a link is not a choice.
   */
  openSection?: CleanSectionOpening | null;
  /**
   * Tracks to match (FLW-13): the Library's notice line, Health, the Keys page,
   * the first-run guide and Prepare open the match window with them chosen.
   */
  matchWith?: CleanMatchOpening | null;
}

/** The name of the running match: what it was started under, else the row the engine puts it on. */
function runNameOf(
  started: string | null,
  jobId: string | null,
  data: { playlists: CleanPlaylistStatus[]; whole_library: { running: { job_id: string } | null } } | null,
): string | null {
  if (started) return started;
  if (!jobId || !data) return null;
  const row = data.playlists.find((entry) => entry.running?.job_id === jobId);
  if (row) return row.name;
  return data.whole_library.running?.job_id === jobId ? WHOLE_LIBRARY_NAME : null;
}

export function CleanScreen({
  openWith = null,
  openSection = null,
  matchWith = null,
}: CleanScreenProps = {}) {
  const navigate = useNavigate();
  // The Inspector's artist and label links (DISCOVER-11).
  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref)),
    [navigate],
  );
  const [section, setSection] = useState<CleanSection>(() =>
    openWith ? "review" : (openSection?.section ?? loadCleanSection()),
  );
  const opened = useRef<string | null>(null);
  const [focus, setFocus] = useState<CleanOpening | null>(null);

  useEffect(() => {
    if (!openWith || opened.current === openWith.token) return;
    opened.current = openWith.token;
    setSection("review");
    setFocus(openWith);
  }, [openWith]);

  useEffect(() => {
    if (!openSection || opened.current === openSection.token) return;
    opened.current = openSection.token;
    setSection(openSection.section);
  }, [openSection]);

  // The match window: its tracks, and whether it is open (FLW-13).
  const [matchTracks, setMatchTracks] = useState<CleanTracks | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const openMatch = useCallback((tracks: CleanTracks | null = null) => {
    setMatchTracks(tracks);
    setMatchOpen(true);
  }, []);
  useEffect(() => {
    if (!matchWith || opened.current === matchWith.token) return;
    opened.current = matchWith.token;
    openMatch(matchWith.tracks);
  }, [matchWith, openMatch]);

  const cleanHealth = useCleanHealth();
  const { reload: reloadHealth } = cleanHealth;
  const match = useCleanMatch(reloadHealth);
  // The Playlists view's rows live here: a row's Match starts the page's one run (C22).
  const pageActive = usePageActive();
  const playlists = useCleanPlaylists(match.matching, section === "review" && pageActive);
  // Whether the person is on the Match part of Clean: a run that ends there lands on its review,
  // and one that ends elsewhere says so in a toast. Kept in a ref, read when the run ends, which
  // may be while this page is hidden.
  const matchShown = pageActive && section === "review";
  // Which Match tab is open, and whether a review's details are: a run that ends lands on its review
  // only from the rows (or Past searches) or a review with nothing open, never over a panel being read.
  const [matchView, setMatchView] = useState<{ tab: MatchTab; panelOpen: boolean }>({
    tab: "playlists",
    panelOpen: false,
  });
  const canLand = matchShown && !matchView.panelOpen;
  const matchInView = useRef(canLand);
  const pageShown = useRef(pageActive);
  // Written after the commit, not during render: a render may be thrown away, and a hidden page's
  // renders are deferred, but these are only read when a run ends, long after.
  useLayoutEffect(() => {
    matchInView.current = canLand;
    pageShown.current = pageActive;
  }, [canLand, pageActive]);
  // A run that ended finding nothing at all: the red note, until it is seen, dismissed or matched again.
  const [nothingFound, setNothingFound] = useState<{
    run: MatchRun;
    playlist: CleanPlaylistStatus | null;
    name: string;
    found: NothingFound;
  } | null>(null);
  // The run each row's last Match started in this session, so Review opens on that run.
  const rowRuns = useRef(new Map<string, string>());
  const rowKey = (playlist: CleanPlaylistStatus | null) => (playlist ? playlistKey(playlist.id) : "library");
  const runFor = useCallback(
    (playlist: CleanPlaylistStatus | null) => rowRuns.current.get(rowKey(playlist)),
    [],
  );
  const [reviewOpening, setReviewOpening] = useState<ReviewOpening | null>(null);
  // A row's run, once it has been reviewed to its end or no longer holds what the row waits on.
  const runSpent = useCallback((playlistId: number | null) => {
    rowRuns.current.delete(playlistId === null ? "library" : playlistKey(playlistId));
  }, []);
  const reviewOpened = useCallback(() => setReviewOpening(null), []);
  // The save bar under every tab, and its window (C23); a playlist's row opens it on that
  // playlist's tracks. A decision made here (Correct, Take, Undo, a run ending) is not
  // announced as a library change, so it bumps `decided` and the bar and the rows count again.
  const [decided, setDecided] = useState(0);
  const save = useSaveToFiles({ active: pageActive, refreshKey: decided });
  const { open: openSave } = save;
  const { reload: reloadPlaylists } = playlists;
  const matchChanged = useCallback(() => {
    reloadHealth();
    reloadPlaylists();
    setDecided((count) => count + 1);
  }, [reloadHealth, reloadPlaylists]);
  // A run ending counts too, whichever tab is open (MatchArea is mounted only on Match).
  const endedSeen = useRef(match.ended);
  useEffect(() => {
    if (endedSeen.current === match.ended) return;
    endedSeen.current = match.ended;
    setDecided((count) => count + 1);
  }, [match.ended]);
  const savePlaylist = useCallback(
    (playlist: CleanPlaylistStatus | null) => {
      if (playlist) openSave(unsavedInPlaylist(playlist.id), playlist.unsaved);
      else openSave(UNSAVED_SELECTION, playlists.data?.whole_library.unsaved ?? 0);
    },
    [openSave, playlists.data],
  );
  // Save N to files… from a past search's review: that run's own unsaved tracks, counted by the
  // engine as the Library counts them, not the whole library's.
  const countRunUnsaved = useCallback((jobId: string): Promise<number> => {
    const browse = window.cuepoint?.browseLibrary;
    if (!browse) return Promise.resolve(0);
    return browse({
      filters: unsavedInRun(jobId).query?.filters ?? null,
      limit: 1,
      offset: 0,
      sort: "artist",
      dir: "asc",
    })
      .then((answer) => answer.total)
      .catch(() => 0);
  }, []);
  const saveRun = useCallback(
    (jobId: string) => {
      void countRunUnsaved(jobId).then((count) => openSave(unsavedInRun(jobId), count));
    },
    [countRunUnsaved, openSave],
  );
  // Read through the shared cache (C19d): a page shown again does not wait on it.
  // A summary that cannot be read counts as none, and the page goes on (as it always has).
  const summaryRead = useSharedRead(LIBRARY_SUMMARY);
  const summary: LibrarySummary | null | undefined = summaryRead.unavailable
    ? null
    : (summaryRead.value ?? (summaryRead.error !== undefined ? null : undefined));

  const choose = useCallback(
    (id: string) => {
      const next = CLEAN_SECTIONS.find((entry) => entry.id === id)?.id;
      if (!next) return;
      setSection(next);
      saveCleanSection(next);
      // Counts change with every edit made anywhere, the Library included.
      reloadHealth();
    },
    [reloadHealth],
  );

  if (summary === undefined) {
    return (
      <div className="screen screen--stack clean-screen--waiting">
        <p className="clean-empty__hint">Reading your library…</p>
      </div>
    );
  }

  if (summary && (summary.library_empty || summary.source === null)) {
    return (
      <div className="screen screen--stack screen--scroll clean-screen--waiting">
        <ScreenHeader title="Clean" inset />
        <EmptyState
          headline="No collection imported yet"
          description="Clean works on your library. Import a Rekordbox file in the Library first."
          action={{ label: IMPORT_COLLECTION_LABEL, onClick: () => navigate("/library", { state: libraryImportState() }) }}
        />
      </div>
    );
  }

  // A run's review: from its end, a toast on another page, or the red note. Brings the Match area
  // back on that run. `filter` opens it on one chip ("Not found" for a run that found nothing).
  const openReview = (
    run: MatchRun,
    playlist: CleanPlaylistStatus | null,
    filter?: ReviewOpening["filter"],
  ) => {
    setSection("review");
    saveCleanSection("review");
    setReviewOpening({
      token: `${run.job_id}:${Date.now()}`,
      run,
      playlistId: playlist ? playlist.id : null,
      name: playlist ? playlist.name : (run.label ?? WHOLE_LIBRARY_NAME),
      ...(filter ? { filter } : {}),
    });
    if (!pageShown.current) navigate("/clean");
  };
  // A playlist's Match: one run over that playlist, followed here (C22).
  const startPlaylist = (playlist: CleanPlaylistStatus | null) => {
    const data = playlists.data;
    if (!data || match.matching) return;
    const request = matchRowRequest(playlist, data.whole_library);
    setNothingFound(null);
    void match
      .start(request.again ? "rematch-many" : "match-many", request.selection, request.again, request.label, {
        onJob: (jobId) => rowRuns.current.set(rowKey(playlist), jobId),
        away: () => !matchInView.current,
        onReview: (run) => {
          const none = nothingFoundOf(run);
          openReview(run, playlist, none ? nothingFoundTarget(none).filter : undefined);
        },
        onLand: (run) => openReview(run, playlist),
        noteVisible: () => pageShown.current,
        onNothing: (run, found) =>
          setNothingFound({ run, playlist, found, name: playlist ? playlist.name : (run.label ?? WHOLE_LIBRARY_NAME) }),
      })
      .then((started) => {
        if (started) playlists.reload();
      });
  };

  const label = CLEAN_SECTIONS.find((entry) => entry.id === section)?.label ?? "";
  const counts = sectionCounts(cleanHealth.health);
  // What is being matched, in the playlist or library name: the name a run started here was given,
  // else the row the engine says the running job is on (right after coming back too).
  const runName = match.matching ? runNameOf(match.label, match.jobId, playlists.data) : null;

  return (
    <div className="screen clean-screen">
      <div data-testid="clean-header">
        <ScreenHeader
          title="Clean"
          inset
          tabs={
            <Tabs
              tabs={CLEAN_SECTIONS.map((entry) => {
                const waiting = counts[entry.id];
                return {
                  id: entry.id,
                  label:
                    waiting === undefined
                      ? entry.label
                      : `${entry.label} (${waiting.toLocaleString()})`,
                };
              })}
              activeId={section}
              onChange={choose}
            />
          }
        />
      </div>
      {match.matching && (
        <MatchRunningLine
          name={runName}
          progress={match.progress}
          secondsLeft={match.secondsLeft}
          onStop={match.jobId ? () => match.stop(match.jobId!) : null}
        />
      )}
      {!match.matching && nothingFound && (
        <NothingFoundNote
          name={nothingFound.name}
          found={nothingFound.found}
          onSee={() => {
            openReview(nothingFound.run, nothingFound.playlist, nothingFoundTarget(nothingFound.found).filter);
            setNothingFound(null);
          }}
          onDismiss={() => setNothingFound(null)}
        />
      )}
      <div className="clean-screen__body" role="tabpanel" aria-label={label}>
        {section === "review" && (
          <MatchArea
            onHealthChanged={matchChanged}
            focus={focus}
            match={match}
            playlists={playlists}
            onMatchPlaylist={startPlaylist}
            runFor={runFor}
            onRunSpent={runSpent}
            reviewOpening={reviewOpening}
            onReviewOpened={reviewOpened}
            onViewChange={setMatchView}
            onSavePlaylist={savePlaylist}
            onSaveRun={saveRun}
            countRunUnsaved={countRunUnsaved}
            onOpenEntity={openEntity}
          />
        )}
        {section === "missing" && (
          <MissingFilesView
            health={cleanHealth.health}
            onHealthChanged={reloadHealth}
            onOpenEntity={openEntity}
          />
        )}
        {section === "duplicates" && (
          <DuplicatesView health={cleanHealth.health} onHealthChanged={reloadHealth} />
        )}
      </div>
      {save.bar}
      <MatchWindow
        open={matchOpen}
        tracks={matchTracks}
        health={cleanHealth.health}
        onStart={(selection, again, label) =>
          match.start(again ? "rematch-many" : "match-many", selection, again, label)
        }
        onClose={() => setMatchOpen(false)}
      />
      {save.dialog}
    </div>
  );
}
