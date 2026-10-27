/**
 * The Keys chart of the Library tab (STATS-06, DEC-206): the commonest keys as Camelot-coloured
 * bars with their counts, and how many tracks have a key and how many have none. It draws no
 * wheel; the Keys page is the one place a key spread is drawn, and **Open in Keys** goes there
 * with the same scope ticked.
 *
 * The numbers are the Keys page's own: `POST /api/v1/library/keys/population` over the scope as
 * its sources, so the two pages cannot disagree.
 */
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { RankBar } from "../../components/charts/RankBar";
import { LinkButton } from "../../components/LinkButton";
import { Loading } from "../../components/Loading";
import { KeyChip } from "../../components/wheel/KeyChip";
import { formatCount } from "../../format/counts";
import { needsDesktopApp } from "../../api/userMessage";
import { RETRY, goTo } from "../../format/words";
import { keysState } from "../keys/keysLink";
import { requestSources } from "../keys/keysSources";
import { useKeysPopulation } from "../keys/useKeysPopulation";
import { keysScopeFor } from "./statisticsKeys";

const TOP = 6;

const noSourceGone = () => false;

interface KeySummaryProps {
  /** The Statistics scope: `library`, `playlist:<id>` or `collection:<id>`. */
  scope: string;
  collections: readonly CollectionNode[];
}

export function KeySummary({ scope, collections }: KeySummaryProps) {
  const navigate = useNavigate();
  const keysScope = useMemo(() => keysScopeFor(scope, collections), [scope, collections]);
  const picked = useMemo(() => (keysScope.kind === "sources" ? keysScope.picked : []), [keysScope]);
  const sources = useMemo(() => requestSources(picked), [picked]);
  const counted = keysScope.kind === "sources";
  const population = useKeysPopulation(sources, 0, counted, noSourceGone);

  // A read of the same scope again (the library changed) keeps the numbers on screen meanwhile.
  const lastRead = useRef<{ scope: string; data: NonNullable<typeof population.data> } | null>(null);
  if (population.data) lastRead.current = { scope, data: population.data };
  const shown =
    population.data ?? (lastRead.current?.scope === scope ? lastRead.current.data : null);

  let body;
  if (keysScope.kind === "unsupported") {
    body = <p className="statistics-note">{keysScope.reason}</p>;
  } else if (population.status === "unavailable") {
    body = <p className="statistics-note">{needsDesktopApp("Reading the keys")}</p>;
  } else if (population.status === "error") {
    body = (
      <>
        <p className="statistics-note">The keys could not be read.</p>
        <Button variant="secondary" onClick={population.retry}>
          {RETRY}
        </Button>
      </>
    );
  } else if (shown === null) {
    body = <Loading what="keys" />;
  } else {
    const { total, no_key, keys } = shown;
    const common = [...keys]
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP);
    const top = Math.max(1, ...common.map((entry) => entry.count));
    body = (
      <>
        {common.length > 0 && (
          <>
            <div className="keys__head cp-data-grid__head" aria-hidden="true">
              <span className="rank__hash">#</span>
              <span>Key</span>
              <span />
              <span className="rank__number">Tracks</span>
            </div>
            <ol className="keys__list" aria-label="Commonest keys">
              {common.map((entry, index) => (
                <li key={entry.code} className="keys__row">
                  <span className="keys__rank statistics-figure" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="keys__chip">
                    <KeyChip value={entry.code} />
                  </span>
                  <RankBar share={entry.count / top} />
                  <span className="keys__count statistics-figure">{formatCount(entry.count)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="statistics-note">
          {`${formatCount(total - no_key)} with a key · ${formatCount(no_key)} without a key`}
        </p>
      </>
    );
  }

  return (
    <Card
      className="statistics-panel statistics-panel--keys"
      title="Keys"
      bodyClassName="statistics-panel__body"
    >
      {body}
      <LinkButton
        go
        className="statistics-panel__link"
        onClick={() => navigate("/keys", { state: keysState(picked) })}
      >
        {goTo("Keys")}
      </LinkButton>
    </Card>
  );
}
