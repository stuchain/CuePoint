/**
 * The Statistics page (STATS-04, DEC-138, DEC-162).
 *
 * How the library is made up, what you play most and what needs fixing, as three tabs: Overview,
 * Plays and Health (D22). The page is the frame: the header with its scope picker and a summary line
 * of what is counted, the tab strip (Health carries a "N issues" chip),
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
import { ScreenHeader, type HeaderFacts } from "../../components/shell/ScreenHeader";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { LibrarySummary } from "../../api/cuepointBridge.types";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { Tabs, panelId, tabId } from "../../components/Tabs";
import { countNoun, formatCount, pluralWord } from "../../format/counts";
import { RETRY } from "../../format/words";
import { WHICH_TRACKS } from "../../words";
import { Select } from "../../components/Select";
import { libraryImportState } from "../library/libraryLink";
import { HealthSection } from "./HealthSection";
import { healthToFix } from "./healthCount";
import { LibrarySection } from "./LibrarySection";
import { PlaysSection, PlaysSince } from "./PlaysSection";
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
import { needsDesktopApp } from "../../api/userMessage";
import "../screens.css";
import "./statistics.css";

type TabId = "overview" | "plays" | "health";

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
      {status === "unavailable" && <EmptyState compact headline={needsDesktopApp("Statistics")} />}
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
  // What the header's date field says is wrong with a typed day; the Plays tab says it (M224).
  const [dateNote, setDateNote] = useState<string | null>(null);
  const plays = useStatisticsPlays(reading, playsChoice, trees.refreshing);
  const spreads = useStatisticsSpreads(reading, trees.refreshing);
  const health = useStatisticsHealth(reading, trees.refreshing);

  // A link that is about health opens the Health tab, once per navigation, so choosing another
  // tab afterwards (or a read coming round again) does not send the person back.
  const location = useLocation();
  const asked = statisticsFocus(location);
  const [tab, setTab] = useState<TabId>("overview");
  const openedFor = useRef<string | null>(null);
  const leaveRef = useRef<() => void>(() => {});
  const focusToken = asked?.focus === "health" ? asked.token : null;
  useEffect(() => {
    if (!focusToken || openedFor.current === focusToken) return;
    openedFor.current = focusToken;
    leaveRef.current();
    setTab("health");
  }, [focusToken]);

  // Each tab keeps its own place in the page's one scroll (its `.screen-region`, under the header,
  // M225): a tab not opened yet starts at the top, one come back to is where it was left. A link that
  // asks for Health is a new ask, so it starts at the top.
  const pageRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const places = useRef<Partial<Record<TabId, number>>>({});
  const shown = useRef<TabId>(tab);
  const lastFocus = useRef<string | null>(null);
  const scroller = () => regionRef.current ?? pageRef.current;
  // A layout effect, so the page never paints one frame at the old place. A tab whose data has
  // not come yet is too short to scroll down to its place (the browser clamps it to 0), so the
  // place is asked for again once that data first arrives.
  const tabLoaded = tab === "plays" ? !!plays.data : tab === "overview" ? !!spreads.data : !!health.data;
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
  const facts: HeaderFacts | undefined =
    !settled || libraryEmpty || summaryValue === null
      ? undefined
      : scope === "library"
        ? typeof summaryValue.track_count === "number"
          ? {
              count: summaryValue.track_count,
              noun: "track",
              facts:
                typeof summaryValue.playlist_count === "number"
                  ? [countNoun(summaryValue.playlist_count, "playlist")]
                  : [],
            }
          : undefined
        : scopeLabel === null || spreads.data?.scope !== scope
          ? undefined
          : { count: spreads.data.total, noun: "track", facts: [scopeLabel] };

  const header = (
    <ScreenHeader
      title="Statistics"
      inset
      beside={
        answered !== null && !libraryEmpty ? (
          // The label is the select's own, drawn inside its box (C244), so the title row is one
          // control tall like the other pages' and nothing is painted over. Keys says the same (C222).
          <>
            <Select
              label={WHICH_TRACKS}
              inlineLabel
              className="statistics-page__scope"
              value={scope}
              options={options}
              disabled={!settled}
              onChange={(event) => choose(event.target.value)}
            />
            {/* Plays' Since is part of the scope, so it sits beside it while Plays is shown (M224). */}
            {tab === "plays" && plays.status !== "unavailable" && (
              <PlaysSince choice={playsChoice} onChoice={setPlaysChoice} stale={plays.stale} onNote={setDateNote} />
            )}
          </>
        ) : undefined
      }
      facts={facts}
      tabs={
        answered !== null && !libraryEmpty ? (
          <Tabs
            idPrefix="statistics"
            label="Statistics views"
            activeId={tab}
            onChange={(id) => chooseTab(id as TabId)}
            tabs={[
              // No count after the name: the track count is in the header (C257).
              { id: "overview", label: "Overview" },
              { id: "plays", label: "Plays" },
              {
                id: "health",
                label: "Health",
                // A count after the name, amber because it is work to do (area 58); the word is for
                // a screen reader.
                detail:
                  toFix > 0 ? (
                    <span className="statistics-page__todo">
                      {formatCount(toFix)}
                      <span className="cp-visually-hidden">{` ${pluralWord(toFix, "issue")}`}</span>
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
        <div ref={regionRef} className="screen-region">
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
      </div>
    );
  }

  const noHistory = plays.data ? noHistoryState(plays.data.history_from) : null;

  return (
    <div ref={pageRef} className="screen screen--scroll statistics-page">
      {header}

      {/* The tabs scroll here, under the header, so the bar sits on the content's edge (M225). */}
      <div ref={regionRef} className="screen-region">
      <TabPanel
        id="overview"
        active={tab === "overview"}
        status={spreads.status}
        loading="your library"
        failed="Your library could not be read."
        onRetry={spreads.retry}
      >
        {spreads.data && <LibrarySection spreads={spreads.data} collections={trees.collections} />}
      </TabPanel>

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
              <EmptyState compact headline={noHistory.title} description={noHistory.hint ?? undefined} />
            )}
            <PlaysSection
              data={plays.data}
              choice={playsChoice}
              onChoice={setPlaysChoice}
              stale={plays.stale}
              failed={plays.failed}
              onRetry={plays.retry}
              dateNote={dateNote}
              pageEmpty={noHistory !== null}
            />
          </>
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
        {health.data && <HealthSection health={health.data} />}
      </TabPanel>
      </div>
    </div>
  );
}
