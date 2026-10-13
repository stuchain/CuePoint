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
 * Match opens on Playlists (C22). Its one action, **Match N playlists on
 * Beatport**, shows on that sub-tab only and starts one run over the ticked
 * playlists; the match window stays for tracks handed in from other pages
 * (`matchWith`).
 *
 * Every table here is the Library's `TrackTable` over the Library's windowed
 * browse with a rule set, and every action goes through a route CLEAN-11 built.
 * The page adds surface, not machinery: no second query path, no in-memory
 * results, no rule the engine does not already state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EntityKind, LibrarySummary } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { EmptyState, IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { Tabs } from "../../components/Tabs";
import { DuplicatesView } from "./DuplicatesView";
import { MatchWindow } from "./MatchWindow";
import { MissingFilesView } from "./MissingFilesView";
import { MatchArea, loadMatchTab, type MatchTab } from "./match/MatchArea";
import { usePageActive } from "../../components/shell/pageActive";
import { useCleanPlaylists, usePlaylistTicks } from "./match/useCleanPlaylists";
import { matchPlaylistsAction, matchPlaylistsLabel, matchPlaylistsSelection } from "./match/matchPlaylists";
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
  // The Playlists view's rows and ticks live here: the header's button reads them (C22).
  const pageActive = usePageActive();
  const playlists = useCleanPlaylists(match.matching, section === "review" && pageActive);
  const playlistTicks = usePlaylistTicks(playlists.data);
  const [matchTab, setMatchTab] = useState<MatchTab>(loadMatchTab);
  const [summary, setSummary] = useState<LibrarySummary | null | undefined>(undefined);

  useEffect(() => {
    const bridge = window.cuepoint?.getLibrarySummary;
    if (!bridge) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    bridge()
      .then((payload) => {
        if (!cancelled) setSummary(payload);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <ScreenHeader title="Clean" />
        <EmptyState
          headline="No collection imported yet"
          description="Clean works on your library. Import a Rekordbox collection in the Library first."
          action={{ label: IMPORT_COLLECTION_LABEL, onClick: () => navigate("/library", { state: libraryImportState() }) }}
        />
      </div>
    );
  }

  const ticked = playlistTicks.rows;
  const matchPlaylists = matchPlaylistsAction(ticked);
  const startPlaylists = () => {
    if (ticked.length === 0 || match.matching) return;
    // The ticks are spent only once the match has started; a refusal keeps them.
    void match
      .start(
        matchPlaylists.again ? "rematch-many" : "match-many",
        matchPlaylistsSelection(ticked),
        matchPlaylists.again,
        matchPlaylistsLabel(ticked),
      )
      .then((started) => {
        if (!started) return;
        playlistTicks.clear();
        playlists.reload();
      });
  };
  const needsTick = ticked.length === 0;

  const label = CLEAN_SECTIONS.find((entry) => entry.id === section)?.label ?? "";
  const counts = sectionCounts(cleanHealth.health);

  return (
    <div className="screen clean-screen">
      <div data-testid="clean-header">
        <ScreenHeader
          title="Clean"
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
          actions={
            section === "review" && matchTab === "playlists" ? (
              <div className="clean-header-action">
                {needsTick && !match.matching && (
                  <span id="clean-match-reason" className="clean-hint-line">
                    Tick one or more playlists.
                  </span>
                )}
                <Button
                  variant="primary"
                  disabled={needsTick || match.matching}
                  aria-describedby={needsTick && !match.matching ? "clean-match-reason" : undefined}
                  onClick={startPlaylists}
                >
                  {matchPlaylists.label}
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>
      {match.note && (
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
            onHealthChanged={reloadHealth}
            focus={focus}
            onOpenEntity={openEntity}
            match={match}
            onMatchTracks={(tracks) => openMatch(tracks ?? null)}
            playlists={playlists}
            ticked={playlistTicks.ticked}
            onTick={playlistTicks.onTick}
            onTabChange={setMatchTab}
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
      <MatchWindow
        open={matchOpen}
        tracks={matchTracks}
        health={cleanHealth.health}
        onStart={(selection, again, label) =>
          match.start(again ? "rematch-many" : "match-many", selection, again, label)
        }
        onClose={() => setMatchOpen(false)}
      />
    </div>
  );
}
