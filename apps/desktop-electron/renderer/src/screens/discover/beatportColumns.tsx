/**
 * The Beatport tables' columns (DISCOVER-10, DEC-041).
 *
 * Rows from Beatport are not library rows, so they get a column registry of
 * their own rather than the Library's: that, and a data source, is all it took
 * for `TrackTable` to hold them, which is what DEC-041 made it generic for.
 *
 * Every Beatport table sends one row shape (DISCOVER-09's `BeatportTrackRow`),
 * so the shared columns are written once over it and each table adds its own:
 * a run's order and sources, the wantlist's note, date added and bought mark.
 * A column sorts by the engine's own sort names; one the engine cannot order
 * by has no `sortKey`. Each table keeps its own layout (DEC-042).
 */
import type {
  BeatportTrackRow,
  DiscoverRunTrackRow,
  WantlistRow,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { formatBpm } from "../library/trackValues";
import { artistsText, formatWhen, sourcesText, trackName } from "./discoverFormat";

export const RUN_TABLE_LAYOUT_KEY = "cuepoint-discover-run-table-layout";
export const WANTLIST_TABLE_LAYOUT_KEY = "cuepoint-discover-wantlist-table-layout";
export const ENTITY_TABLE_LAYOUT_KEY = "cuepoint-discover-page-beatport-layout";

/** The columns every Beatport table has, over any row that is one. */
function sharedColumns<Row extends BeatportTrackRow>(): TrackColumnDef<Row>[] {
  return [
    {
      id: "title",
      header: "Title",
      sortKey: "title",
      minWidthPx: 120,
      defaultWidthPx: 240,
      sticky: true,
      render: (row) => trackName(row),
    },
    {
      id: "artists",
      header: "Artists",
      sortKey: "artist",
      minWidthPx: 100,
      defaultWidthPx: 190,
      render: (row) => artistsText(row),
    },
    {
      id: "label",
      header: "Label",
      minWidthPx: 90,
      defaultWidthPx: 150,
      render: (row) => row.label_name ?? "",
    },
    {
      id: "release_date",
      header: "Released",
      sortKey: "release_date",
      minWidthPx: 90,
      defaultWidthPx: 104,
      render: (row) => row.release_date ?? "",
    },
    {
      id: "bpm",
      header: "BPM",
      minWidthPx: 56,
      defaultWidthPx: 72,
      align: "right",
      render: (row) => formatBpm(row.bpm),
    },
    {
      id: "key",
      header: "Key",
      minWidthPx: 56,
      defaultWidthPx: 70,
      render: (row) => row.key ?? "",
    },
    {
      id: "genre",
      header: "Genre",
      minWidthPx: 90,
      defaultWidthPx: 150,
      render: (row) => row.genre_name ?? "",
    },
    {
      id: "release",
      header: "Release",
      hiddenByDefault: true,
      minWidthPx: 100,
      defaultWidthPx: 170,
      render: (row) => row.release_name ?? "",
    },
  ];
}

/** "Owned" when the library has it (DEC-092), computed by the engine on read. */
function ownedColumn<Row extends BeatportTrackRow>(): TrackColumnDef<Row> {
  return {
    id: "owned",
    header: "Owned",
    minWidthPx: 60,
    defaultWidthPx: 76,
    render: (row) => (row.owned ? "Owned" : ""),
  };
}

/** "Wanted" when the track is on the wantlist now (DISCOVER-06). */
function wantedColumn<Row extends BeatportTrackRow>(): TrackColumnDef<Row> {
  return {
    id: "on_wantlist",
    header: "Wantlist",
    minWidthPx: 70,
    defaultWidthPx: 84,
    render: (row) => (row.on_wantlist ? "Wanted" : ""),
  };
}

export const RUN_COLUMNS: readonly TrackColumnDef<DiscoverRunTrackRow>[] = [
  {
    id: "position",
    header: "#",
    sortKey: "position",
    minWidthPx: 44,
    defaultWidthPx: 56,
    align: "right",
    // The order the run found it in, from 1, as a person counts.
    render: (row) => String(row.position + 1),
  },
  ...sharedColumns<DiscoverRunTrackRow>(),
  {
    id: "sources",
    header: "Found in",
    minWidthPx: 120,
    defaultWidthPx: 260,
    render: (row) => sourcesText(row.sources),
  },
  ownedColumn<DiscoverRunTrackRow>(),
  wantedColumn<DiscoverRunTrackRow>(),
];

/**
 * An Artist or Label page's Beatport half (DISCOVER-11). The engine answers
 * it newest release first and takes no other order, so no column sorts it.
 */
export const ENTITY_COLUMNS: readonly TrackColumnDef<BeatportTrackRow>[] = [
  ...sharedColumns<BeatportTrackRow>().map(({ sortKey: _unsorted, ...column }) => column),
  ownedColumn<BeatportTrackRow>(),
  wantedColumn<BeatportTrackRow>(),
];

export const WANTLIST_COLUMNS: readonly TrackColumnDef<WantlistRow>[] = [
  ...sharedColumns<WantlistRow>(),
  {
    id: "note",
    header: "Note",
    minWidthPx: 100,
    defaultWidthPx: 200,
    render: (row) => row.note ?? "",
  },
  {
    id: "added_at",
    header: "Added",
    sortKey: "added_at",
    minWidthPx: 100,
    defaultWidthPx: 150,
    render: (row) => formatWhen(row.added_at),
  },
  {
    id: "bought",
    header: "Bought",
    minWidthPx: 80,
    defaultWidthPx: 150,
    render: (row) => formatWhen(row.bought_at),
  },
  ownedColumn<WantlistRow>(),
];
