import type { Meta, StoryObj } from "@storybook/react";
import { ToolbarIcon } from "./ToolbarIcon";

const meta = {
  title: "Components/ToolbarIcon",
  component: ToolbarIcon,
  tags: ["autodocs"],
} satisfies Meta<typeof ToolbarIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: "Settings", icon: "settings" } };
export const Active: Story = { args: { label: "Filter", icon: "filter", active: true } };
export const UnicodeGlyph: Story = { args: { label: "Help", glyph: "?" } };
