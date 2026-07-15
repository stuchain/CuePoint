import type { Meta, StoryObj } from "@storybook/react";
import { ProgressBar } from "./ProgressBar";

const meta = {
  title: "Components/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: { value: 42, label: "Searching Beatport… (42/128)" },
};

export const Complete: Story = {
  args: { value: 100, label: "Complete" },
};
