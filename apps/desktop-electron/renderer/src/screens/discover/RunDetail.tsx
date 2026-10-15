/**
 * One search: what it looked for, how it ended, what it found (DISCOVER-10,
 * DEC-091, DEC-092). The engine calls it a run; the user never reads that.
 *
 * The header is the search as the engine kept it, scope included, so one can
 * be read long after its settings have changed. Below it are the results as
 * rows of cards (charts, artists, labels), a card opening its own tracks, and
 * "Everything" the whole dig as one table. A dig made before cards existed has
 * no cards, and shows that one table.
 */
import { useCallback, useEffect, useState } from "react";

import type { DiscoverGroupCard, DiscoverRunHeader } from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { pluralize } from "../library/libraryFormat";
import { RunCards } from "./RunCards";
import { RunTracksView } from "./RunTracksView";
import {
  chartsLine,
  refusalText,
  releasesLine,
  runScopeLine,
  runOutcome,
  runStateLabel,
  runStateTone,
  scopeLine,
  searchTitle,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { cardCounts, cardRef } from "./groupCards";
import { useRunGroups } from "./useRunGroups";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

interface RunDetailProps {
  runId: number;
  tools: DiscoverTools;
  /** Changes when the run may have changed: it is running, or just ended. */
  version: number;
  /** The search is not there any more: deleted elsewhere. */
  onGone: () => void;
}

/** What the results area shows: the cards (or, with none, everything), one card, or everything. */
type View = { kind: "auto" } | { kind: "everything" } | { kind: "card"; card: DiscoverGroupCard };

const BADGE: Record<ReturnType<typeof runStateTone>, "info" | "success" | "warning" | "danger"> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "danger",
};

/** The names a run's scope resolved to, folded away when there are many. */
function ScopeNames({ names, noun }: { names: DiscoverRunHeader["artists"]; noun: string }) {
  if (names.length === 0) return null;
  return (
    <details className="discover-run__names">
      <summary>
        The {pluralize(names.length, noun)} it looked for
      </summary>
      <p className="discover-note">{names.map((entry) => entry.name).join(", ")}</p>
    </details>
  );
}

export function RunDetail({ runId, tools, version, onGone }: RunDetailProps) {
  const [header, setHeader] = useState<DiscoverRunHeader | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "auto" });
  // Ticked cards and open rows are kept here, so coming back from a card finds them as left.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const read = useRunGroups(runId, version, onGone);

  // The header, again whenever the run may have moved on.
  useEffect(() => {
    const bridge = window.cuepoint?.getDiscoveryRun;
    if (!bridge) {
      setHeaderError(NO_ENGINE);
      return;
    }
    let current = true;
    void bridge({ run_id: runId })
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          if (answer.refusal.code === "DISCOVERY_RUN_NOT_FOUND") onGone();
          else setHeaderError(refusalText(answer.refusal));
          return;
        }
        setHeader(answer.value);
        setHeaderError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setHeaderError(userMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [runId, version, onGone]);

  // A different run is a different header and a different view: never show one run's over another.
  useEffect(() => {
    setHeader(null);
    setHeaderError(null);
    setView({ kind: "auto" });
    setTicked(new Set());
    setExpanded(new Set());
  }, [runId]);

  const back = useCallback(() => setView({ kind: "auto" }), []);

  const run = header?.run ?? null;
  const running = run?.running ?? false;
  const grouped = read.groups?.grouped === true;

  let body;
  if (read.loading) {
    body = <p className="discover-note discover-run__reading">Reading the dig…</p>;
  } else if (view.kind === "card") {
    body = (
      <RunTracksView
        key={`${runId}:${view.card.kind}:${view.card.key}`}
        runId={runId}
        tools={tools}
        version={version}
        groups={[cardRef(view.card)]}
        label={view.card.name}
        lead={
          <>
            <Button variant="secondary" icon="chevron-left" onClick={back}>
              All results
            </Button>
            <span className="discover-run__card-title">
              <strong>{view.card.name}</strong>{" "}
              <span className="discover-note">{cardCounts(view.card)}</span>
            </span>
          </>
        }
        onGone={onGone}
        running={running}
      />
    );
  } else if (grouped && read.groups && view.kind !== "everything") {
    body = (
      <RunCards
        runId={runId}
        groups={read.groups}
        tools={tools}
        version={version}
        onOpen={(card) => setView({ kind: "card", card })}
        onEverything={() => setView({ kind: "everything" })}
        ticked={ticked}
        onTicked={setTicked}
        expanded={expanded}
        onExpanded={setExpanded}
      />
    );
  } else {
    body = (
      <RunTracksView
        key={`${runId}:everything`}
        runId={runId}
        tools={tools}
        version={version}
        label="Tracks this dig found"
        lead={
          grouped ? (
            <Button variant="secondary" icon="chevron-left" onClick={back}>
              All results
            </Button>
          ) : undefined
        }
        onGone={onGone}
        running={running}
      />
    );
  }

  return (
    <section className="discover-run" aria-label="Dig">
      <header className="discover-run__header">
        {headerError ? (
          <p className="discover-note discover-note--warning" role="alert">
            {headerError}
          </p>
        ) : !run || !header ? (
          <p className="discover-note">Reading the dig…</p>
        ) : (
          <>
            <div className="discover-run__title-row">
              <h2 className="discover-section__title">{searchTitle(run.started_at)}</h2>
              <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
            </div>
            <p className="discover-run__outcome">{runOutcome(run)}</p>
            <details className="discover-run__scope">
              <summary>{runScopeLine(run, tools.options.genres)}</summary>
              <p className="discover-run__looked-title">What it looked for</p>
              <ul className="discover-run__looked" aria-label="What it looked for">
                <li>{chartsLine(run, tools.options.genres)}</li>
                <li>{releasesLine(run)}</li>
                <li>Artists: {scopeLine(run.params.artists, "artist", "artists")}</li>
                <li>Labels: {scopeLine(run.params.labels, "label", "labels")}</li>
              </ul>
              <ScopeNames names={header.artists} noun="artist" />
              <ScopeNames names={header.labels} noun="label" />
            </details>
          </>
        )}
      </header>

      {read.error && (
        <p className="discover-note discover-note--warning" role="alert">
          {read.error}
        </p>
      )}

      {body}
    </section>
  );
}
