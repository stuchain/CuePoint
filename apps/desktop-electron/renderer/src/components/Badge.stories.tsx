import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "128 tracks" } };
export const Success: Story = { args: { children: "Matched", variant: "success" } };
export const Warning: Story = { args: { children: "Soon", variant: "warning" } };
export const Danger: Story = { args: { children: "Error", variant: "danger" } };
export const Info: Story = { args: { children: "XML", variant: "info" } };
