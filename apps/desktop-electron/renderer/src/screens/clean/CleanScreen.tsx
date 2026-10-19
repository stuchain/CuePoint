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
 * Match area (`match/MatchArea.tsx`): Playlists and Past searches on one row, and the Review of
 * a run (when one is open) below it.
 *
 * Match opens on Playlists (C22). Tick one or more playlists (or the whole library) and press
 * **Match ticked playlists**: the page starts that one run and follows it. While any match
 * runs, a line at the top of every tab says what, how far and how long is left, with Stop,
 * read from the engine running job so it is right after leaving the page and coming
 * back. A run that ends lands on the Review of the first playlist it matched (every track, with what
 * was found and a tick to sync it); one that found nothing says so in a red note instead, and from
 * another page a toast says it, with **Review**. Syncing is per playlist, from its Review: there
 * is no save bar on this page. The match window stays for tracks handed in from other pages
 * (`matchWith`).
 *
 * Every table here is the Library's `TrackTable` over the Library's windowed
 * browse with a rule set, and every action goes through a route CLEAN-11 built.
 * The page adds surface, not machinery: no second query path, no in-memory
 * results, no rule the engine does not already state.
 */
import { Activity, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EntityKind, LibrarySummary, MatchRun } from "../../api/cuepointBridge.types";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { formatCount } from "../../format/counts";
import { EmptyState, IMPORT_COLLECTION_LABEL } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { Tabs } from "../../components/Tabs";
import { DuplicatesView } from "./DuplicatesView";
import { MatchWindow } from "./MatchWindow";
import { MissingFilesView } from "./MissingFilesView";
import { MatchArea, type ReviewOpening, type ReviewTarget } from "./match/MatchArea";
import { NothingFoundNote } from "./match/MatchRunLine";
import { usePageActive } from "../../components/shell/pageActive";
import { WHOLE_LIBRARY_NAME, useCleanPlaylists } from "./match/useCleanPlaylists";
import { matchRequest, type MatchChoice } from "./match/matchPlaylists";
import type { NothingFound } from "./match/matchDone";
import type { MatchView } from "./match/matchTab";
import type { CleanMatchOpening, CleanOpening, CleanSectionOpening } from "./cleanLink";
import type { CleanTracks } from "./cleanTracks";
import { libraryImportState } from "../library/libraryLink";
import { entityPath } from "../discover/discoverLinks";
import {
  CLEAN_SECTIONS,
  factsLine,
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

/** What a run reviews once it ends: each playlist it was started on (the first one opens). */
function targetsOf(choice: MatchChoice): ReviewTarget[] {
  return choice.whole
    ? [{ playlistId: null, name: WHOLE_LIBRARY_NAME }]
    : choice.playlists.map((playlist) => ({ playlistId: playlist.id, name: playlist.name }));
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
  // A part left for another keeps what it was showing (scroll, sort, selection): its pane is
  // hidden, not unmounted. A part never opened is not drawn.
  const [visited, setVisited] = useState<ReadonlySet<CleanSection>>(new Set());
  if (!visited.has(section)) setVisited(new Set([...visited, section]));
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
  const [matchView, setMatchView] = useState<{ tab: MatchView; panelOpen: boolean }>({
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
    targets: ReviewTarget[];
    name: string;
    found: NothingFound;
  } | null>(null);
  const [reviewOpening, setReviewOpening] = useState<ReviewOpening | null>(null);
  const reviewOpened = useCallback(() => setReviewOpening(null), []);
  const { reload: reloadPlaylists } = playlists;
  // A tick, a choice or a sync made on a review changes what Health and the rows count.
  const matchChanged = useCallback(() => {
    reloadHealth();
    reloadPlaylists();
  }, [reloadHealth, reloadPlaylists]);
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
        <Loading what="your library" />
      </div>
    );
  }

  if (summary && (summary.library_empty || summary.source === null)) {
    return (
      <div className="screen screen--stack screen--scroll clean-screen--waiting">
        <ScreenHeader title="Clean" inset />
        <EmptyState
          icon="clean"
          headline="No library yet"
          description="Clean matches your tracks, finds missing files and spots duplicates in your library."
          action={{ label: IMPORT_COLLECTION_LABEL, onClick: () => navigate("/library", { state: libraryImportState() }) }}
        />
      </div>
    );
  }

  // A run's reviews: from its end, a toast on another page, or the red note. Brings the Match area
  // back on the first playlist's review.
  const openReview = (run: MatchRun, targets: ReviewTarget[]) => {
    setSection("review");
    saveCleanSection("review");
    setReviewOpening({ token: `${run.job_id}:${Date.now()}`, targets });
    if (!pageShown.current) navigate("/clean");
  };
  // Match what is ticked: one run over all of it, followed here (C22).
  const startMatch = (choice: MatchChoice) => {
    const data = playlists.data;
    if (!data || match.matching) return;
    const request = matchRequest(choice, data.whole_library);
    const targets = targetsOf(choice);
    setNothingFound(null);
    void match
      .start(request.again ? "rematch-many" : "match-many", request.selection, request.again, request.label, {
        away: () => !matchInView.current,
        onReview: (run) => openReview(run, targets),
        onLand: (run) => openReview(run, targets),
        noteVisible: () => pageShown.current,
        onNothing: (run, found) => setNothingFound({ run, targets, found, name: request.label }),
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
          summary={factsLine(cleanHealth.health?.track_count ?? null, counts)}
          tabs={
            <Tabs
              tabs={CLEAN_SECTIONS.map((entry) => {
                const waiting = counts[entry.id];
                return {
                  id: entry.id,
                  label: entry.label,
                  // The count after the name, in the page's one count style: a grey figure,
                  // amber when it is work waiting (area 58).
                  detail:
                    waiting === undefined ? undefined : (
                      <span className="clean-tab-count">{formatCount(waiting)}</span>
                    ),
                };
              })}
              activeId={section}
              onChange={choose}
            />
          }
        />
      </div>
      {!match.matching && nothingFound && (
        <NothingFoundNote
          name={nothingFound.name}
          found={nothingFound.found}
          onSee={() => {
            openReview(nothingFound.run, nothingFound.targets);
            setNothingFound(null);
          }}
          onDismiss={() => setNothingFound(null)}
        />
      )}
      <div className="clean-screen__body" role="tabpanel" aria-label={label}>
        {visited.has("review") && (
          <Activity mode={section === "review" ? "visible" : "hidden"}>
            <MatchArea
              onHealthChanged={matchChanged}
              focus={focus}
              match={match}
              playlists={playlists}
              onMatch={startMatch}
              reviewOpening={reviewOpening}
              onReviewOpened={reviewOpened}
              onViewChange={setMatchView}
            />
          </Activity>
        )}
        {visited.has("missing") && (
          <Activity mode={section === "missing" ? "visible" : "hidden"}>
            <MissingFilesView
              health={cleanHealth.health}
              onHealthChanged={reloadHealth}
              onOpenEntity={openEntity}
            />
          </Activity>
        )}
        {visited.has("duplicates") && (
          <Activity mode={section === "duplicates" ? "visible" : "hidden"}>
            <DuplicatesView health={cleanHealth.health} onHealthChanged={reloadHealth} />
          </Activity>
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
