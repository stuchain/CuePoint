/**
 * The Library tab of the Statistics page: what is in the scope.
 *
 * Four numbers (tracks, total time, average BPM, added this year), then Genres, Labels and
 * Artists by track count (five rows each, the rest behind "See top N"), then the charts: BPM
 * and Keys, Year and Loudness, with Date added and Rating behind "More charts". Every number is
 * the engine's; a row opens exactly the tracks it counted.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CollectionNode, FilterRuleSet, StatisticsSpreads } from "../../api/cuepointBridge.types";
import { LinkButton } from "../../components/LinkButton";
import { countNoun, formatCount } from "../../format/counts";
import { formatLength, formatTotal } from "../../format/durations";
import { formatBpm } from "../../format/units";
import { libraryRulesState } from "../library/libraryLink";
import { KeySummary } from "./KeySummary";
import { RankList, type RankRow } from "./RankList";
import { SpreadsSection } from "./SpreadsSection";

interface LibrarySectionProps {
  spreads: StatisticsSpreads;
  collections: readonly CollectionNode[];
  /** The library's playlist count; only known for the whole library, so null for a scope. */
  playlistCount: number | null;
  /** Today, for "added this year". */
  now?: Date;
}

interface Figure {
  id: string;
  label: string;
  value: string;
  note: string;
}

/** Tracks added in `year`, from the date-added months (`YYYY-MM`). */
function addedIn(spreads: StatisticsSpreads, year: number): number {
  return spreads.date_added.buckets
    .filter((bucket) => String(bucket.value ?? "").startsWith(`${year}-`))
    .reduce((sum, bucket) => sum + bucket.count, 0);
}

export function LibrarySection({ spreads, collections, playlistCount, now }: LibrarySectionProps) {
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const open = (rules: FilterRuleSet) => navigate("/library", { state: libraryRulesState(rules) });
  const year = (now ?? new Date()).getFullYear();
  // The link lives inside the last chart's card, at its bottom right (C256).
  const moreCharts = (
    <LinkButton go={!more} className="statistics-panel__link" onClick={() => setMore((shown) => !shown)}>
      {more ? "Fewer charts" : "More charts: date added, rating"}
    </LinkButton>
  );

  const figures: Figure[] = [
    {
      id: "tracks",
      label: "Tracks",
      value: formatCount(spreads.total),
      note: playlistCount === null ? "in this scope" : countNoun(playlistCount, "playlist"),
    },
    {
      id: "time",
      label: "Total time",
      value: formatTotal(spreads.total_seconds),
      note:
        spreads.average_seconds === null
          ? "no lengths known"
          : `avg ${formatLength(spreads.average_seconds)}`,
    },
    {
      id: "bpm",
      label: "Average BPM",
      value: spreads.average_bpm === null ? "—" : formatBpm(spreads.average_bpm),
      note:
        spreads.tempo.unknown.count > 0
          ? `${formatCount(spreads.tempo.unknown.count)} with no BPM`
          : "every track has a BPM",
    },
    {
      id: "added",
      label: "Added this year",
      value: formatCount(addedIn(spreads, year)),
      note: String(year),
    },
  ];

  // Genres come from the genre spread: its named buckets, not the rest ("Other") or the tracks
  // with none.
  const genres: RankRow[] = spreads.genre.buckets.flatMap((bucket) =>
    bucket.rules === null
      ? []
      : [
          {
            id: bucket.label,
            name: bucket.label,
            tracks: bucket.count,
            weight: bucket.count,
            rules: bucket.rules,
            label: `${bucket.label}, ${countNoun(bucket.count, "track")}`,
          },
        ],
  );
  const labels: RankRow[] = spreads.labels.map((row) => ({
    id: row.label_key,
    name: row.name,
    tracks: row.tracks,
    weight: row.tracks,
    rules: row.rules,
    label: `${row.name}, ${countNoun(row.tracks, "track")}`,
  }));
  const artists: RankRow[] = spreads.artists.map((row) => ({
    id: row.name_key,
    name: row.name,
    tracks: row.tracks,
    weight: row.tracks,
    rules: row.rules,
    label: `${row.name}, ${countNoun(row.tracks, "track")}`,
  }));

  return (
    <div className="library-tab">
      <dl className="library-figures">
        {figures.map((figure) => (
          <div key={figure.id} className="library-figures__cell" data-figure={figure.id}>
            <dt className="cp-text-label">{figure.label}</dt>
            <dd className="library-figures__value">{figure.value}</dd>
            <dd className="library-figures__note">{figure.note}</dd>
          </div>
        ))}
      </dl>

      <div className="statistics-panels">
        <RankList
          title="Genres"
          unit="tracks"
          columns={["tracks"]}
          rows={genres}
          empty="No genres to list"
          onOpen={open}
        />
        <RankList
          title="Labels"
          unit="tracks"
          columns={["tracks"]}
          rows={labels}
          empty="No labels to list"
          onOpen={open}
        />
        <RankList
          title="Artists"
          unit="tracks"
          columns={["tracks"]}
          rows={artists}
          empty="No artists to list"
          onOpen={open}
        />
        <SpreadsSection spreads={spreads} charts={["tempo"]} />
        <KeySummary scope={spreads.scope} collections={collections} />
        <SpreadsSection
          spreads={spreads}
          charts={["year", "loudness"]}
          footer={more ? undefined : moreCharts}
        />
        {more && <SpreadsSection spreads={spreads} charts={["date_added", "rating"]} footer={moreCharts} />}
      </div>
    </div>
  );
}
