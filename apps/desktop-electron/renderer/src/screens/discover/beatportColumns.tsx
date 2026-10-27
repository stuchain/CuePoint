/**
 * The Beatport tables' columns (DISCOVER-10, DEC-041).
 *
 * Rows from Beatport are not library rows, so they get a column registry of
 * their own rather than the Library's: that, and a data source, is all it took
 * for `TrackTable` to hold them, which is what DEC-041 made it generic for.
 *
 * Every Beatport table sends one row shape (DISCOVER-09's `BeatportTrackRow`),
 * so the shared columns are written once over it and each table adds its own:
 * a search's order and reasons, the wantlist's note, date added and bought mark.
 * Artist and label names are links to their pages (FLW-16). The play button is no column:
 * the table draws it at the right end of each row (`PreviewButton`).
 * A column sorts by the engine's own sort names; one the engine cannot order
 * by has no `sortKey`. Each table keeps its own layout (DEC-042).
 */
import type {
  BeatportTrackRow,
  DiscoverRunTrackRow,
  WantlistRow,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { KeyChip } from "../../components/wheel/KeyChip";
import { formatBpm } from "../library/trackValues";
import { beatportRowKey } from "./beatportKey";
import { IN_LIBRARY_EXPLAINER } from "./HideOwnedSwitch";
import { artistsText, formatIsoDay, formatWhen, sourcesText, trackName } from "./discoverFormat";

export const RUN_TABLE_LAYOUT_KEY = "cuepoint-discover-run-table-layout";
export const WANTLIST_TABLE_LAYOUT_KEY = "cuepoint-discover-wantlist-table-layout";
export const ENTITY_TABLE_LAYOUT_KEY = "cuepoint-discover-page-beatport-layout";

/**
 * The order the shared columns had before D12 put BPM before Key, as the Library's are (it was
 * Key, BPM since C70): a layout saved in it is moved once, as the Library's are.
 */
const PREVIOUS_SHARED_ORDER = ["title", "artists", "key", "bpm", "genre", "label", "release_date", "release"];
export const RUN_PREVIOUS_DEFAULT_ORDER: readonly string[] = [
  "position",
  ...PREVIOUS_SHARED_ORDER,
  "sources",
  "owned",
  "on_wantlist",
];
export const WANTLIST_PREVIOUS_DEFAULT_ORDER: readonly string[] = [
  ...PREVIOUS_SHARED_ORDER,
  "note",
  "added_at",
  "bought",
  "owned",
];
export const ENTITY_PREVIOUS_DEFAULT_ORDER: readonly string[] = [
  ...PREVIOUS_SHARED_ORDER,
  "owned",
  "on_wantlist",
];

/**
 * The columns every Beatport table has, over any row that is one. Title and Artist come first,
 * then Key, BPM and Genre, as in the Library (C70); the label, date and release follow. Every
 * column has an `accessor`, so a heading with no engine key (Key, BPM, Genre, Label, and every
 * heading on a page the engine orders itself) sorts in the table over the rows it holds (C193).
 * Names are plain text, as in the Library (C196): the row menu opens an artist's or label's page.
 */
function sharedColumns<Row extends BeatportTrackRow>(): TrackColumnDef<Row>[] {
  return [
    {
      id: "title",
      header: "Title",
      sortKey: "title",
      accessor: (row) => trackName(row),
      minWidthPx: 120,
      defaultWidthPx: 210,
      sticky: true,
      render: (row) => trackName(row),
    },
    {
      id: "artists",
      header: "Artist",
      sortKey: "artist",
      accessor: (row) => artistsText(row),
      minWidthPx: 100,
      defaultWidthPx: 170,
      render: (row) => artistsText(row),
      text: (row) => artistsText(row),
    },
    {
      id: "bpm",
      header: "BPM",
      accessor: (row) => row.bpm,
      minWidthPx: 56,
      defaultWidthPx: 60,
      align: "right",
      render: (row) => formatBpm(row.bpm) || null,
    },
    {
      id: "key",
      header: "Key",
      chips: true,
      accessor: (row) => beatportRowKey(row),
      minWidthPx: 56,
      defaultWidthPx: 60,
      // Camelot, as every key in the app is shown (DEC-201), as the Library's chip (R4-2,
      // DEC-272); Beatport's own key.
      render: (row) => <KeyChip value={beatportRowKey(row)} />,
      text: (row) => beatportRowKey(row) ?? "",
    },
    {
      id: "genre",
      header: "Genre",
      accessor: (row) => row.genre_name,
      minWidthPx: 90,
      defaultWidthPx: 100,
      render: (row) => row.genre_name || null,
    },
    {
      id: "label",
      header: "Label",
      // Waits in the Columns list so the dig table's opening columns fit the window (M85, D12).
      hiddenByDefault: true,
      accessor: (row) => row.label_name,
      minWidthPx: 90,
      defaultWidthPx: 130,
      render: (row) => row.label_name || null,
      text: (row) => row.label_name ?? "",
    },
    {
      id: "release_date",
      header: "Released",
      hiddenByDefault: true,
      sortKey: "release_date",
      accessor: (row) => row.release_date,
      minWidthPx: 90,
      defaultWidthPx: 96,
      render: (row) => formatIsoDay(row.release_date) || null,
    },
    {
      id: "release",
      header: "Release",
      accessor: (row) => row.release_name,
      hiddenByDefault: true,
      minWidthPx: 100,
      defaultWidthPx: 170,
      render: (row) => row.release_name || null,
    },
  ];
}

/**
 * "In your library" when the library has it (DEC-092, DSC-6), computed by the
 * engine on read. The id stays `owned`, which a saved column layout keeps.
 */
function ownedColumn<Row extends BeatportTrackRow>(): TrackColumnDef<Row> {
  return {
    id: "owned",
    header: "In your library",
    hint: IN_LIBRARY_EXPLAINER,
    minWidthPx: 90,
    defaultWidthPx: 110,
    render: (row) => (row.owned ? "In your library" : ""),
  };
}

/** "On wantlist" when the track is on the wantlist now (DISCOVER-06). */
function wantedColumn<Row extends BeatportTrackRow>(): TrackColumnDef<Row> {
  return {
    id: "on_wantlist",
    header: "Wantlist",
    minWidthPx: 70,
    defaultWidthPx: 90,
    render: (row) => (row.on_wantlist ? "On wantlist" : ""),
  };
}

export const RUN_COLUMNS: readonly TrackColumnDef<DiscoverRunTrackRow>[] = [
  {
    id: "position",
    header: "#",
    sortKey: "position",
    // Room for the "#" and the sort arrow beside it: at 44 the arrow squeezed the "#" down to a ":".
    minWidthPx: 64,
    defaultWidthPx: 64,
    align: "right",
    // The order the run found it in, from 1, as a person counts.
    render: (row) => String(row.position + 1),
  },
  ...sharedColumns<DiscoverRunTrackRow>(),
  {
    id: "sources",
    header: "From",
    hiddenByDefault: true,
    minWidthPx: 120,
    defaultWidthPx: 180,
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
  ...sharedColumns<BeatportTrackRow>().map(({ sortKey: _engineOrder, ...column }) => column),
  ownedColumn<BeatportTrackRow>(),
  wantedColumn<BeatportTrackRow>(),
];

export const WANTLIST_COLUMNS: readonly TrackColumnDef<WantlistRow>[] = [
  ...sharedColumns<WantlistRow>(),
  {
    id: "note",
    header: "Note",
    minWidthPx: 100,
    defaultWidthPx: 160,
    render: (row) => row.note ?? "",
  },
  {
    id: "added_at",
    header: "Added",
    sortKey: "added_at",
    minWidthPx: 100,
    defaultWidthPx: 110,
    render: (row) => formatWhen(row.added_at),
  },
  {
    id: "bought",
    header: "Bought",
    minWidthPx: 80,
    defaultWidthPx: 110,
    render: (row) => formatWhen(row.bought_at),
  },
  ownedColumn<WantlistRow>(),
];
