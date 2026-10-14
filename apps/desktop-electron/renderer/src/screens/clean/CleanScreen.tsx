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
 * Match area (`match/MatchArea.tsx`): Playlists, One at a time, Table and Past
 * searches.
 *
 * Match opens on Playlists (C22). Every playlist there has its own **Match**
 * (no ticks, no header button); the page starts that run, follows it, and says
 * from another page that it ended, with **Review N**. The match window stays
 * for tracks handed in from other pages (`matchWith`).
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
import { MatchArea, loadMatchTab, type MatchTab, type ReviewOpening } from "./match/MatchArea";
import { usePageActive } from "../../components/shell/pageActive";
import { WHOLE_LIBRARY_NAME, playlistKey, useCleanPlaylists } from "./match/useCleanPlaylists";
import { matchRowRequest } from "./match/matchPlaylists";
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
import { unsavedInPlaylist, useSaveToFiles } from "../../components/saveToFiles/useSaveToFiles";
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
  const [matchTab, setMatchTab] = useState<MatchTab>(loadMatchTab);
  // Whether the person is looking at the rows: a run that ends elsewhere says so in a toast.
  // Kept in a ref, read when the run ends, which may be while this page is hidden.
  const rowsShown = pageActive && section === "review" && matchTab === "playlists";
  const rowsInView = useRef(rowsShown);
  const pageShown = useRef(pageActive);
  // Written after the commit, not during render: a render may be thrown away, and a hidden page's
  // renders are deferred, but these are only read when a run ends, long after.
  useLayoutEffect(() => {
    rowsInView.current = rowsShown;
    pageShown.current = pageActive;
  }, [rowsShown, pageActive]);
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

  // Review N ›, from a toast on another page: bring the Match area back on that run.
  const openReview = (run: MatchRun, playlist: CleanPlaylistStatus | null) => {
    setSection("review");
    saveCleanSection("review");
    setReviewOpening({
      token: `${run.job_id}:${Date.now()}`,
      run,
      playlistId: playlist ? playlist.id : null,
      name: playlist ? playlist.name : (run.label ?? WHOLE_LIBRARY_NAME),
    });
    if (!pageShown.current) navigate("/clean");
  };
  // A playlist's Match: one run over that playlist, followed here (C22).
  const startPlaylist = (playlist: CleanPlaylistStatus | null) => {
    const data = playlists.data;
    if (!data || match.matching) return;
    const request = matchRowRequest(playlist, data.whole_library);
    void match
      .start(request.again ? "rematch-many" : "match-many", request.selection, request.again, request.label, {
        onJob: (jobId) => rowRuns.current.set(rowKey(playlist), jobId),
        away: () => !rowsInView.current,
        onReview: (run) => openReview(run, playlist),
      })
      .then((started) => {
        if (started) playlists.reload();
      });
  };

  const label = CLEAN_SECTIONS.find((entry) => entry.id === section)?.label ?? "";
  const counts = sectionCounts(cleanHealth.health);

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
      {match.note && !rowsShown && (
        <div className="clean-note" role="region" aria-label="Matching">
          <p className="clean-note__text">{match.note}</p>
          {match.progress && (
            <progress
              className="clean-progress"
              aria-label="Matching progress"
              value={match.progress.done}
              max={match.progress.total}
            />
          )}
        </div>
      )}
      <div className="clean-screen__body" role="tabpanel" aria-label={label}>
        {section === "review" && (
          <MatchArea
            health={cleanHealth.health}
            onHealthChanged={matchChanged}
            focus={focus}
            onOpenEntity={openEntity}
            match={match}
            onMatchTracks={(tracks) => openMatch(tracks ?? null)}
            playlists={playlists}
            onMatchPlaylist={startPlaylist}
            runFor={runFor}
            onRunSpent={runSpent}
            reviewOpening={reviewOpening}
            onReviewOpened={reviewOpened}
            onTabChange={setMatchTab}
            onSavePlaylist={savePlaylist}
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
