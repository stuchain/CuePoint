import type { Meta, StoryObj } from "@storybook/react";
import { ToolbarIcon } from "./ToolbarIcon";

const meta = {
  title: "Components/ToolbarIcon",
  component: ToolbarIcon,
  tags: ["autodocs"],
} satisfies Meta<typeof ToolbarIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: "Settings", glyph: "⚙" } };
export const Active: Story = { args: { label: "Filter", glyph: "☰", active: true } };
