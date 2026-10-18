/**
 * The Statistics page (STATS-04, DEC-138, DEC-162).
 *
 * What you play most, how the library is made up and what needs fixing, as three tabs: Plays,
 * Library and Health. The page is the frame: the header with its scope picker and a summary line
 * of what is counted, the tab strip (Library carries the track count, Health a "N issues" chip),
 * and each tab's loading, failed and empty states. Nothing here is drawn from numbers the
 * engine did not send.
 *
 * Every number is the engine's, for the scope picked: the whole library, a Rekordbox
 * playlist, or one of CuePoint's Collections or Sets. One read per tab, so one failing
 * leaves the other two as they were, and every failure has its own **Try again**. The three
 * tabs are mounted once and hidden when not shown, so each keeps its choices (the Plays "since",
 * a list opened to more rows, the extra charts) while another is looked at.
 *
 * A link can ask for the Health tab (`statisticsLink.ts`), because library health lives here
 * now: the page opens it, once per navigation.
 */
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CleanJobStarted, LibrarySummary } from "../../api/cuepointBridge.types";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { useToast } from "../../components";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { Tabs, panelId, tabId } from "../../components/Tabs";
import { formatCount, plural } from "../../format/counts";
import { RETRY } from "../../format/words";
import { Select } from "../../components/Select";
import { useCleanJob, type CleanMessageTone } from "../clean/useCleanJob";
import { libraryImportState } from "../library/libraryLink";
import { HealthSection } from "./HealthSection";
import { healthToFix } from "./healthCount";
import { LibrarySection } from "./LibrarySection";
import { PlaysSection } from "./PlaysSection";
import { loadPlaysChoice } from "./playsChoice";
import { statisticsFocus } from "./statisticsLink";
import { noHistoryState, noLibraryState } from "./statisticsEmpty";
import {
  effectiveScope,
  loadScope,
  rememberedForm,
  saveScope,
  statisticsScopeOptions,
} from "./statisticsScope";
import {
  useStatisticsHealth,
  useStatisticsPlays,
  useStatisticsSpreads,
  useStatisticsTrees,
} from "./useStatistics";
import { NEEDS_DESKTOP } from "../../api/userMessage";
import "../screens.css";
import "./statistics.css";

const NOT_HERE = "Statistics can be read in the desktop app, once CuePoint has started.";

type TabId = "plays" | "library" | "health";

interface TabPanelProps {
  id: TabId;
  active: boolean;
  status: "loading" | "ready" | "error" | "unavailable";
  loading: string;
  failed: string;
  onRetry: () => void;
  children: ReactNode;
}

/** One tab's panel: what it is doing (reading, failed, or its body). Hidden, not unmounted. */
function TabPanel({ id, active, status, loading, failed, onRetry, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={panelId("statistics", id)}
      aria-labelledby={tabId("statistics", id)}
      className="statistics-tabpanel"
      hidden={!active}
      data-panel-of={id}
    >
      {status === "loading" && <Loading what={loading} />}
      {status === "unavailable" && <p className="statistics-note">{NOT_HERE}</p>}
      {status === "error" && (
        <Notice
          action={
            <Button variant="secondary" onClick={onRetry}>
              {RETRY}
            </Button>
          }
        >
          {failed}
        </Notice>
      )}
      {status === "ready" && children}
    </div>
  );
}

export function StatisticsScreen() {
  const navigate = useNavigate();
  const [remembered, setRemembered] = useState<string | null>(() => loadScope());
  // The library summary, through the shared cache (C19d), which reads it again when the
  // library changes or an import or a refresh ends. A summary that cannot be read is not
  // "empty".
  const summaryRead = useSharedRead(LIBRARY_SUMMARY);
  const answered =
    summaryRead.value !== undefined || summaryRead.error !== undefined || summaryRead.unavailable
      ? { summary: (summaryRead.value ?? null) as LibrarySummary | null }
      : null;

  const trees = useStatisticsTrees();
  const options = useMemo(
    () => statisticsScopeOptions(trees.playlists, trees.collections),
    [trees.collections, trees.playlists],
  );
  const scope = effectiveScope(remembered, options, trees.playlists);

  const settled = answered !== null && trees.settled;
  const libraryEmpty = answered?.summary?.library_empty === true;
  // Nothing is asked until the summary and trees are in: there is a library, and the
  // remembered scope has been judged against the trees as they are now.
  const reading = settled && !libraryEmpty ? scope : null;
  const [playsChoice, setPlaysChoice] = useState(loadPlaysChoice);
  const plays = useStatisticsPlays(reading, playsChoice, trees.refreshing);
  const spreads = useStatisticsSpreads(reading, trees.refreshing);
  const health = useStatisticsHealth(reading, trees.refreshing);

  // The cover-art read is run here, not in HealthSection: a scope change or a failed re-read
  // swaps that section for a spinner, and a follower living in it would be dropped mid-scan
  // (no toast, no re-read, the button free again while the job runs).
  const { push } = useToast();
  const message = useCallback((text: string, tone: CleanMessageTone) => push(text, tone), [push]);
  const { running: jobRunning, run: runJob } = useCleanJob(message);
  // A scan outlives the scope it started under: when it ends, Health is read for the scope then.
  const healthRetry = useRef(health.retry);
  healthRetry.current = health.retry;
  const retryHealth = useCallback(() => healthRetry.current(), []);
  // The same start Clean's Health tab made: every track, however the library is scoped here,
  // because the read is of files and not of Collections.
  const readCoverArt = useCallback(() => {
    const begin = window.cuepoint?.startArtworkScan;
    if (!begin) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    void runJob<CleanJobStarted>("artwork_scan", () => begin({ selection: { query: {} } }), {
      succeeded: "Finished reading cover art.",
      onEnded: retryHealth,
    });
  }, [runJob, push, retryHealth]);

  // A link that is about health opens the Health tab, once per navigation, so choosing another
  // tab afterwards (or a read coming round again) does not send the person back.
  const location = useLocation();
  const asked = statisticsFocus(location);
  const [tab, setTab] = useState<TabId>("plays");
  const openedFor = useRef<string | null>(null);
  const leaveRef = useRef<() => void>(() => {});
  const focusToken = asked?.focus === "health" ? asked.token : null;
  useEffect(() => {
    if (!focusToken || openedFor.current === focusToken) return;
    openedFor.current = focusToken;
    leaveRef.current();
    setTab("health");
  }, [focusToken]);

  // Each tab keeps its own place in the page's one scroll (the `.app-main` region holds it): a tab
  // not opened yet starts at the top, one come back to is where it was left. A link that asks for
  // Health is a new ask, so it starts at the top.
  const pageRef = useRef<HTMLDivElement>(null);
  const places = useRef<Partial<Record<TabId, number>>>({});
  const shown = useRef<TabId>(tab);
  const lastFocus = useRef<string | null>(null);
  const scroller = () => pageRef.current?.closest<HTMLElement>(".app-main") ?? pageRef.current;
  // A layout effect, so the page never paints one frame at the old place. A tab whose data has
  // not come yet is too short to scroll down to its place (the browser clamps it to 0), so the
  // place is asked for again once that data first arrives.
  const tabLoaded = tab === "plays" ? !!plays.data : tab === "library" ? !!spreads.data : !!health.data;
  const waitingFor = useRef<{ tab: TabId; top: number } | null>(null);
  useLayoutEffect(() => {
    shown.current = tab;
    const fresh = focusToken !== null && lastFocus.current !== focusToken;
    lastFocus.current = focusToken;
    const top = fresh ? 0 : (places.current[tab] ?? 0);
    scroller()?.scrollTo?.({ top });
    waitingFor.current = top > 0 && !tabLoaded ? { tab, top } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, focusToken]);
  useLayoutEffect(() => {
    const wanted = waitingFor.current;
    if (!tabLoaded || !wanted || wanted.tab !== tab) return;
    waitingFor.current = null;
    scroller()?.scrollTo?.({ top: wanted.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabLoaded, tab]);
  const leave = () => {
    const region = scroller();
    if (region) places.current[shown.current] = region.scrollTop;
  };
  leaveRef.current = leave;
  const chooseTab = (next: TabId) => {
    if (next === tab) return;
    leave();
    setTab(next);
  };

  const choose = (value: string) => {
    const form = rememberedForm(value, trees.playlists);
    setRemembered(form);
    saveScope(form);
  };

  const toFix = health.data ? healthToFix(health.data) : 0;

  // The page summary line: what is being counted, as a facts line.
  const summaryValue = answered?.summary ?? null;
  const scopeLabel = options.find((option) => option.value === scope)?.label ?? null;
  const summaryLine =
    !settled || libraryEmpty || summaryValue === null
      ? undefined
      : scope === "library"
        ? [
            typeof summaryValue.track_count === "number" ? plural(summaryValue.track_count, "track") : null,
            typeof summaryValue.playlist_count === "number" ? plural(summaryValue.playlist_count, "playlist") : null,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ") || undefined
        : (scopeLabel ?? undefined);

  const header = (
    <ScreenHeader
      title="Statistics"
      inset
      beside={
        answered !== null && !libraryEmpty ? (
          // The word "Scope" sits inside the picker, so the title row is one control tall like the
          // other pages' (area 59); the label stays the select's accessible name.
          <span className="statistics-page__scope-wrap">
            <span className="statistics-page__scope-word" aria-hidden="true">
              Scope
            </span>
            <Select
              label="Scope"
              hideLabel
              className="statistics-page__scope"
              value={scope}
              options={options}
              disabled={!settled}
              onChange={(event) => choose(event.target.value)}
            />
          </span>
        ) : undefined
      }
      summary={summaryLine}
      tabs={
        answered !== null && !libraryEmpty ? (
          <Tabs
            idPrefix="statistics"
            activeId={tab}
            onChange={(id) => chooseTab(id as TabId)}
            tabs={[
              { id: "plays", label: "Plays" },
              {
                id: "library",
                label: "Library",
                detail: spreads.data ? formatCount(spreads.data.total) : undefined,
              },
              {
                id: "health",
                label: "Health",
                // A count after the name, amber because it is work to do (area 58); the word is for
                // a screen reader.
                detail:
                  toFix > 0 ? (
                    <span className="statistics-page__todo">
                      {formatCount(toFix)}
                      <span className="cp-visually-hidden">{toFix === 1 ? " issue" : " issues"}</span>
                    </span>
                  ) : undefined,
              },
            ]}
          />
        ) : undefined
      }
    />
  );

  if (libraryEmpty) {
    const empty = noLibraryState();
    return (
      <div ref={pageRef} className="screen screen--scroll statistics-page">
        {header}
        <EmptyState
          icon="statistics"
          headline={empty.title}
          description={empty.hint ?? undefined}
          action={
            empty.action
              ? {
                  label: empty.action.label,
                  onClick: () => navigate("/library", { state: libraryImportState() }),
                }
              : undefined
          }
        />
      </div>
    );
  }

  const noHistory = plays.data ? noHistoryState(plays.data.history_from) : null;

  return (
    <div ref={pageRef} className="screen screen--scroll statistics-page">
      {header}

      <TabPanel
        id="plays"
        active={tab === "plays"}
        status={plays.status}
        loading="plays"
        failed="Plays could not be read."
        onRetry={plays.retry}
      >
        {plays.data && (
          <>
            {noHistory && (
              <div className="statistics-empty statistics-empty--section">
                <p className="statistics-empty__title">{noHistory.title}</p>
                {noHistory.hint && <p className="statistics-note">{noHistory.hint}</p>}
              </div>
            )}
            <PlaysSection
              data={plays.data}
              choice={playsChoice}
              onChoice={setPlaysChoice}
              stale={plays.stale}
              failed={plays.failed}
              onRetry={plays.retry}
            />
          </>
        )}
      </TabPanel>

      <TabPanel
        id="library"
        active={tab === "library"}
        status={spreads.status}
        loading="your library"
        failed="Your library could not be read."
        onRetry={spreads.retry}
      >
        {spreads.data && (
          <LibrarySection
            spreads={spreads.data}
            collections={trees.collections}
            playlistCount={
              spreads.data.scope === "library" && typeof summaryValue?.playlist_count === "number"
                ? summaryValue.playlist_count
                : null
            }
          />
        )}
      </TabPanel>

      <TabPanel
        id="health"
        active={tab === "health"}
        status={health.status}
        loading="health"
        failed="Health could not be read."
        onRetry={health.retry}
      >
        {health.data && (
          <HealthSection
            health={health.data}
            coverArtRunning={jobRunning === "artwork_scan"}
            onReadCoverArt={readCoverArt}
          />
        )}
      </TabPanel>
    </div>
  );
}
