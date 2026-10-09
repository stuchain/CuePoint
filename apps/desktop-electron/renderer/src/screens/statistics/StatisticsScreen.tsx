/**
 * The Statistics page (STATS-04, DEC-138, DEC-162).
 *
 * What you play most and how the library is made up, in three sections: Plays, Your library
 * and Health. This step is the frame: the page header with its scope picker, each section's
 * heading with its loading, failed and empty states, and a plain count of what was read.
 * STATS-05 to STATS-07 fill the sections; nothing here is drawn from numbers the engine did
 * not send.
 *
 * Every number is the engine's, for the scope picked: the whole library, a Rekordbox
 * playlist, or one of CuePoint's Collections or Sets. One read per section, so one failing
 * leaves the other two as they were, and every failure has its own **Try again**.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useLibraryChanges } from "../../api/libraryChanges";
import type { LibrarySummary } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { PixelSpinner } from "../../components/PixelSpinner";
import { Select } from "../../components/Select";
import { libraryImportState } from "../library/libraryLink";
import { HealthSection } from "./HealthSection";
import { KeySummary } from "./KeySummary";
import { SpreadsSection } from "./SpreadsSection";
import { PlaysSection } from "./PlaysSection";
import { loadPlaysChoice } from "./playsChoice";
import { noHistoryState, noLibraryState } from "./statisticsEmpty";
import {
  effectiveScope,
  loadScope,
  rememberedForm,
  saveScope,
  statisticsScopeOptions,
} from "./statisticsScope";
import {
  useLibraryJobsFinished,
  useStatisticsHealth,
  useStatisticsPlays,
  useStatisticsSpreads,
  useStatisticsTrees,
} from "./useStatistics";
import "../screens.css";
import "./statistics.css";

const NOT_HERE = "Statistics can be read in the desktop app, once CuePoint has started.";

interface SectionProps {
  id: string;
  title: string;
  status: "loading" | "ready" | "error" | "unavailable";
  loading: string;
  failed: string;
  onRetry: () => void;
  children: ReactNode;
}

/** One section: its heading, then what it is doing (reading, failed, or its body). */
function Section({ id, title, status, loading, failed, onRetry, children }: SectionProps) {
  return (
    <section className="statistics-section" aria-labelledby={`statistics-${id}`}>
      <h2 id={`statistics-${id}`} className="statistics-section__title">
        {title}
      </h2>
      {status === "loading" && <PixelSpinner label={loading} />}
      {status === "unavailable" && <p className="statistics-note">{NOT_HERE}</p>}
      {status === "error" && (
        <div className="statistics-section__failed">
          <p className="statistics-note">{failed}</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {status === "ready" && children}
    </section>
  );
}

export function StatisticsScreen() {
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const [remembered, setRemembered] = useState<string | null>(() => loadScope());
  // The library summary and the refresh it answered for; a summary that cannot be read is not
  // "empty". A summary of an earlier refresh is not this refresh's.
  const [answered, setAnswered] = useState<{
    summary: LibrarySummary | null;
    generation: number;
  } | null>(null);

  const again = useCallback(() => setRefresh((value) => value + 1), []);
  useLibraryChanges(again);
  useLibraryJobsFinished(again);

  useEffect(() => {
    const read = window.cuepoint?.getLibrarySummary;
    if (!read) {
      setAnswered({ summary: null, generation: refresh });
      return;
    }
    let cancelled = false;
    read().then(
      (value) => {
        if (!cancelled) setAnswered({ summary: value ?? null, generation: refresh });
      },
      () => {
        if (!cancelled) setAnswered({ summary: null, generation: refresh });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const trees = useStatisticsTrees(refresh);
  const options = useMemo(
    () => statisticsScopeOptions(trees.playlists, trees.collections),
    [trees.collections, trees.playlists],
  );
  const scope = effectiveScope(remembered, options, trees.playlists);

  const settled = answered !== null && answered.generation === refresh && trees.settled;
  const libraryEmpty = answered?.summary?.library_empty === true;
  // Nothing is asked until this refresh's summary and trees are in: there is a library, and the
  // remembered scope has been judged against the trees as they are now.
  const reading = settled && !libraryEmpty ? scope : null;
  const [playsChoice, setPlaysChoice] = useState(loadPlaysChoice);
  const plays = useStatisticsPlays(reading, refresh, playsChoice);
  const spreads = useStatisticsSpreads(reading, refresh);
  const health = useStatisticsHealth(reading, refresh);

  const choose = (value: string) => {
    const form = rememberedForm(value, trees.playlists);
    setRemembered(form);
    saveScope(form);
  };

  const header = (
    <header className="statistics-page__header">
      <h1 className="screen__title">Statistics</h1>
      {answered !== null && !libraryEmpty && (
        <Select
          label="Scope"
          className="statistics-page__scope"
          value={scope}
          options={options}
          disabled={!settled}
          onChange={(event) => choose(event.target.value)}
        />
      )}
    </header>
  );

  if (libraryEmpty) {
    const empty = noLibraryState();
    return (
      <div className="screen screen--scroll statistics-page">
        {header}
        <div className="statistics-empty">
          <p className="statistics-empty__title">{empty.title}</p>
          {empty.hint && <p className="statistics-note">{empty.hint}</p>}
          {empty.action && (
            <Button variant="primary" onClick={() => navigate("/library", { state: libraryImportState() })}>
              {empty.action.label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const noHistory = plays.data ? noHistoryState(plays.data.history_from) : null;

  return (
    <div className="screen screen--scroll statistics-page">
      {header}

      <Section
        id="plays"
        title="Plays"
        status={plays.status}
        loading="Reading plays…"
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
      </Section>

      <Section
        id="library"
        title="Your library"
        status={spreads.status}
        loading="Reading your library…"
        failed="Your library could not be read."
        onRetry={spreads.retry}
      >
        {spreads.data && (
          <div className="statistics-panels">
            <SpreadsSection spreads={spreads.data} />
            <KeySummary scope={spreads.data.scope} collections={trees.collections} refresh={refresh} />
          </div>
        )}
      </Section>

      <Section
        id="health"
        title="Health"
        status={health.status}
        loading="Reading health…"
        failed="Health could not be read."
        onRetry={health.retry}
      >
        {health.data && <HealthSection health={health.data} />}
      </Section>
    </div>
  );
}
