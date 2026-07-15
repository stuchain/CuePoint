import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";
import { Panel } from "./Panel";

const meta = {
  title: "Components/Panel",
  component: Panel,
  tags: ["autodocs"],
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Processing",
    badge: <Badge variant="info">running</Badge>,
    children: <p>Panel body content for pixel chrome validation.</p>,
  },
};

export const Alt: Story = {
  args: {
    title: "inCrate",
    variant: "alt",
    children: <p>Secondary panel surface.</p>,
  },
};
