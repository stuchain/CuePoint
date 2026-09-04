/**
 * The Universal Track Table (LIBUI-04).
 *
 * The stories exist to be looked at: the density decision (DEC-048) and the
 * placeholder rows are things a test can assert the mechanics of and not the
 * legibility of. `Loading` and `PartiallyLoaded` are what a 50,000-track
 * library actually looks like while it scrolls.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { TrackTable } from "./TrackTable";
import { inMemorySource, pendingSource, type TrackTableSource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  bpm: number | null;
  key: string;
  rating: number | null;
}

const COLUMNS: TrackColumnDef<Track>[] = [
  { id: "title", header: "Title", sortKey: "title", defaultWidthPx: 220, sticky: true, render: (t) => t.title },
  { id: "artist", header: "Artist", sortKey: "artist", defaultWidthPx: 160, render: (t) => t.artist },
  { id: "album", header: "Album", sortKey: "album", defaultWidthPx: 180, render: (t) => t.album },
  {
    id: "bpm",
    header: "BPM",
    sortKey: "bpm",
    minWidthPx: 60,
    defaultWidthPx: 70,
    align: "right",
    render: (t) => (t.bpm == null ? "—" : t.bpm.toFixed(1)),
  },
  { id: "key", header: "Key", sortKey: "key", minWidthPx: 60, defaultWidthPx: 70, render: (t) => t.key },
  {
    id: "rating",
    header: "Rating",
    sortKey: "rating",
    minWidthPx: 70,
    defaultWidthPx: 90,
    render: (t) => (t.rating == null ? "" : "★".repeat(t.rating)),
  },
];

const ARTISTS = ["deadmau5", "Âme", "Eric Prydz", "apparat", "Jon Hopkins", "Nathan Fake"];
const KEYS = ["8A", "5A", "9A", "11B", "2A", "7B"];

function sample(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Track ${i + 1}`,
    artist: ARTISTS[i % ARTISTS.length]!,
    album: `Album ${i % 40}`,
    bpm: i % 7 === 0 ? null : 118 + (i % 22) + 0.5,
    key: KEYS[i % KEYS.length]!,
    rating: i % 5 === 0 ? null : (i % 5) as number,
  }));
}

const meta = {
  title: "Components/TrackTable",
  component: TrackTable<Track>,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: 480, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TrackTable<Track>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    columns: COLUMNS,
    source: inMemorySource(sample(200)),
    sort: { key: "artist", direction: "asc" },
    getRowKey: (row: Track) => row.id,
  },
};

export const Selected: Story = {
  args: {
    ...Default.args,
    selectedKeys: new Set([2, 3, 4]),
  },
};

/** Every row still waiting: what a fresh query looks like before it answers. */
export const Loading: Story = {
  args: {
    columns: COLUMNS,
    source: pendingSource<Track>(50_000),
    getRowKey: (row: Track) => row.id,
  },
};

/** Scrolled past what has loaded — the state the placeholders exist for. */
export const PartiallyLoaded: Story = {
  args: {
    columns: COLUMNS,
    getRowKey: (row: Track) => row.id,
    source: ((): TrackTableSource<Track> => {
      const loaded = sample(12);
      return { total: 50_000, getRow: (index) => loaded[index], status: "loading" };
    })(),
  },
};

export const Empty: Story = {
  args: {
    columns: COLUMNS,
    source: inMemorySource<Track>([]),
    emptyState: "No tracks match this filter",
  },
};
