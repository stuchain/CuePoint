/**
 * The Overview tab of the Statistics page: what is in the scope.
 *
 * Four numbers (rated tracks, total time, average BPM, added this year; the track count is in the
 * header already), then the cards in pairs (D22): Genres and Labels, Artists and Keys, BPM and
 * Year, and Loudness across the row, with Date added and Rating behind "More charts". A card with
 * nothing to show is not drawn (M222), and a scope with no tracks says so once. Every number is the
 * engine's; a row opens exactly the tracks it counted.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { CollectionNode, FilterRuleSet, StatisticsSpreads } from "../../api/cuepointBridge.types";
import { EmptyState } from "../../components/EmptyState";
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
  /** The library's playlist count; only known for the whole library, so null for a scope. (The header says it.) */
  playlistCount?: number | null;
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

export function LibrarySection({ spreads, collections, now }: LibrarySectionProps) {
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
      id: "rated",
      label: "Rated tracks",
      value: formatCount(Math.max(0, spreads.total - spreads.rating.unknown.count)),
      note:
        spreads.rating.unknown.count > 0
          ? `${formatCount(spreads.rating.unknown.count)} not rated`
          : "every track is rated",
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

  if (spreads.total === 0) {
    return (
      <div className="library-tab">
        <EmptyState compact headline="No tracks to count here" description="Pick another playlist or Collection above." />
      </div>
    );
  }

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
        <RankList title="Genres" columns={["tracks"]} rows={genres} empty="No genres to list" hideWhenEmpty onOpen={open} />
        <RankList title="Labels" columns={["tracks"]} rows={labels} empty="No labels to list" hideWhenEmpty onOpen={open} />
        <RankList title="Artists" columns={["tracks"]} rows={artists} empty="No artists to list" hideWhenEmpty onOpen={open} />
        <KeySummary scope={spreads.scope} collections={collections} />
        <SpreadsSection spreads={spreads} charts={["tempo", "year"]} hideEmpty />
        <SpreadsSection
          spreads={spreads}
          charts={["loudness"]}
          hideEmpty
          wide={["loudness"]}
          footer={more ? undefined : moreCharts}
        />
        {more && <SpreadsSection spreads={spreads} charts={["date_added", "rating"]} hideEmpty footer={moreCharts} />}
      </div>
    </div>
  );
}
