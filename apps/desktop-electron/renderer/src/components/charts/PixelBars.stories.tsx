import type { Meta, StoryObj } from "@storybook/react";
import { PixelBars } from "./PixelBars";

const meta = {
  title: "Components/PixelBars",
  component: PixelBars,
  tags: ["autodocs"],
} satisfies Meta<typeof PixelBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Named buckets run as rows. */
export const Horizontal: Story = {
  args: {
    title: "Genre",
    orientation: "horizontal",
    buckets: [
      { label: "Techno", count: 812 },
      { label: "House", count: 540 },
      { label: "Drum and bass", count: 133 },
      { label: "Ambient", count: 0 },
      { label: "Electro", count: 21 },
    ],
    barName: (bucket) => `${bucket.label}, ${bucket.count} tracks`,
    onSelect: () => undefined,
  },
};

/** Ordered buckets run as columns, and a long run scrolls inside the chart. */
export const Vertical: Story = {
  args: {
    title: "Tempo",
    orientation: "vertical",
    buckets: Array.from({ length: 61 }, (_, at) => ({
      label: String(90 + at),
      count: at % 9 === 0 ? 0 : Math.round(300 * Math.exp(-(((at - 34) / 12) ** 2))),
    })),
    barName: (bucket) => `${bucket.label} BPM, ${bucket.count} tracks`,
    onSelect: () => undefined,
  },
};

/** No `onSelect`: the counts show and nothing opens (loudness). */
export const NotSelectable: Story = {
  args: {
    ...Vertical.args,
    title: "Loudness",
    barName: (bucket) => `${bucket.label} LUFS, ${bucket.count} tracks`,
    onSelect: undefined,
  },
};
