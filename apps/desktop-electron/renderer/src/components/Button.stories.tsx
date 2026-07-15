import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Components/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "danger"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { children: "Start matching", variant: "primary" } };
export const Secondary: Story = { args: { children: "Browse…", variant: "secondary" } };
export const Danger: Story = { args: { children: "Delete", variant: "danger" } };
export const Loading: Story = { args: { children: "Processing", loading: true } };
export const Disabled: Story = { args: { children: "Unavailable", disabled: true } };
