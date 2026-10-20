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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { DiscoverGroupCard, DiscoverRunHeader } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { countNoun } from "../../format/counts";
import { BACK } from "../../format/words";
import { RunCards } from "./RunCards";
import { RunTracksView } from "./RunTracksView";
import {
  canContinueRun,
  chartsLine,
  refusalText,
  releasesLine,
  runScopeLine,
  runOutcome,
  scopeLine,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { cardRef } from "./groupCards";
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

/** "‹ Back": the quiet way from a card, or Everything, to the cards (C20). */
function BackToResults({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="quiet" icon="chevron-left" aria-label="Back to all results" onClick={onBack}>
      {BACK}
    </Button>
  );
}

/** The names a run's scope resolved to, folded away when there are many. */
function ScopeNames({ names, noun }: { names: DiscoverRunHeader["artists"]; noun: string }) {
  if (names.length === 0) return null;
  return (
    <details className="discover-run__names">
      <summary>
        The {countNoun(names.length, noun)} it looked for
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
  const sectionRef = useRef<HTMLElement>(null);
  // Where the page was scrolled to on the cards when a card or Everything opened.
  const cardsTop = useRef<number | null>(null);

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
    cardsTop.current = null;
    setTicked(new Set());
    setExpanded(new Set());
  }, [runId]);

  // The page's one scroll is `.app-main`'s (KeptPages): hiding the cards does not keep their place
  // in it, so the place is kept here when a card (or Everything) opens and put back on Back. A
  // layout effect, so no frame paints at the top. What opens starts at the top.
  const open = useCallback((next: View) => {
    cardsTop.current = sectionRef.current?.closest<HTMLElement>(".app-main")?.scrollTop ?? null;
    setView(next);
  }, []);
  useLayoutEffect(() => {
    const main = sectionRef.current?.closest<HTMLElement>(".app-main");
    if (!main) return;
    if (view.kind === "auto") {
      if (cardsTop.current !== null) main.scrollTop = cardsTop.current;
      cardsTop.current = null;
    } else if (cardsTop.current !== null) {
      main.scrollTop = 0;
    }
  }, [view]);

  const back = useCallback(() => setView({ kind: "auto" }), []);

  const run = header?.run ?? null;
  const running = run?.running ?? false;
  const grouped = read.groups?.grouped === true;
  const cardsShown = view.kind === "auto";

  // The cards stay mounted, hidden, while a card's tracks or Everything are open (C19e's rule for
  // pages): Back is then instant, with nothing asked again and the cards as they were left.
  const cards =
    !read.loading && grouped && read.groups ? (
      <RunCards
        runId={runId}
        groups={read.groups}
        tools={tools}
        version={version}
        onOpen={(card) => open({ kind: "card", card })}
        onEverything={() => open({ kind: "everything" })}
        ticked={ticked}
        onTicked={setTicked}
        expanded={expanded}
        onExpanded={setExpanded}
        hidden={!cardsShown}
      />
    ) : null;

  let body;
  if (read.loading) {
    body = <Loading what="the dig" className="discover-run__reading" />;
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
            <BackToResults onBack={back} />
            <span className="discover-run__card-title" data-cut-hint="">
              <strong>{view.card.name}</strong>
            </span>
          </>
        }
        onGone={onGone}
        running={running}
      />
    );
  } else if (cards && cardsShown) {
    body = null;
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
            <BackToResults onBack={back} />
          ) : undefined
        }
        onGone={onGone}
        running={running}
      />
    );
  }

  return (
    <section ref={sectionRef} className="discover-run" aria-label="Dig">
      <header className="discover-run__header">
        {headerError ? (
          <Notice>{headerError}</Notice>
        ) : !run || !header ? (
          <Loading what="the dig" />
        ) : (
          <>
            {/* No title of its own: the open dig's card in the list is the heading. */}
            {/* A stopped dig's card in the list says why; not said twice. */}
            {!canContinueRun(run) && <p className="discover-run__outcome">{runOutcome(run)}</p>}
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
        <Notice>{read.error}</Notice>
      )}

      {cards}
      {body}
    </section>
  );
}
