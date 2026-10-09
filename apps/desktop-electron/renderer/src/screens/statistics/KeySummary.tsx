/**
 * The key summary (STATS-06, DEC-206): how many tracks have a Beatport key, the three commonest
 * keys, and how many have none. It draws no wheel; the Keys page is the one place a key spread
 * is drawn, and **Open in Keys** goes there with the same scope ticked.
 *
 * The numbers are the Keys page's own: `POST /api/v1/library/keys/population` over the scope as
 * its sources, so the two pages cannot disagree.
 */
import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { formatCount } from "../../components/charts/formatCount";
import { PixelSpinner } from "../../components/PixelSpinner";
import { keysState } from "../keys/keysLink";
import { requestSources } from "../keys/keysSources";
import { useKeysPopulation } from "../keys/useKeysPopulation";
import { keysScopeFor } from "./statisticsKeys";

const TOP = 3;

const noSourceGone = () => false;

interface KeySummaryProps {
  /** The Statistics scope: `library`, `playlist:<id>` or `collection:<id>`. */
  scope: string;
  collections: readonly CollectionNode[];
  /** Moves when the library changed, so the counts are read again. */
  refresh: number;
}

export function KeySummary({ scope, collections, refresh }: KeySummaryProps) {
  const navigate = useNavigate();
  const keysScope = useMemo(() => keysScopeFor(scope, collections), [scope, collections]);
  const picked = useMemo(() => (keysScope.kind === "sources" ? keysScope.picked : []), [keysScope]);
  const sources = useMemo(() => requestSources(picked), [picked]);
  const counted = keysScope.kind === "sources";
  const population = useKeysPopulation(sources, refresh, counted, noSourceGone);

  // A read of the same scope again (the library changed) keeps the numbers on screen meanwhile.
  const lastRead = useRef<{ scope: string; data: NonNullable<typeof population.data> } | null>(null);
  if (population.data) lastRead.current = { scope, data: population.data };
  const shown =
    population.data ?? (lastRead.current?.scope === scope ? lastRead.current.data : null);

  let body;
  if (keysScope.kind === "unsupported") {
    body = <p className="statistics-note">{keysScope.reason}</p>;
  } else if (population.status === "unavailable") {
    body = <p className="statistics-note">Keys can be read in the desktop app.</p>;
  } else if (population.status === "error") {
    body = (
      <>
        <p className="statistics-note">The keys could not be read.</p>
        <Button variant="secondary" onClick={population.retry}>
          Try again
        </Button>
      </>
    );
  } else if (shown === null) {
    body = <PixelSpinner label="Reading keys…" />;
  } else {
    const { total, no_key, keys } = shown;
    const common = [...keys]
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP);
    const commonest = common.map((entry) => `${entry.code} (${formatCount(entry.count)})`).join(", ");
    body = (
      <p className="statistics-note">
        {`${formatCount(total - no_key)} of ${formatCount(total)} tracks have a Beatport key`}
        {commonest !== "" && ` · most common ${commonest}`}
        {` · No Beatport key: ${formatCount(no_key)}`}
      </p>
    );
  }

  return (
    <div className="statistics-panel statistics-panel--keys">
      <h3 className="statistics-panel__title">
        Keys
      </h3>
      {body}
      <Button variant="secondary" onClick={() => navigate("/keys", { state: keysState(picked) })}>
        Open in Keys
      </Button>
    </div>
  );
}
