import type { Meta, StoryObj } from "@storybook/react";
import { ListRow } from "./ListRow";
import { Badge } from "./Badge";

const meta = {
  title: "Components/ListRow",
  component: ListRow,
  tags: ["autodocs"],
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Matched: Story = {
  args: {
    primary: "Strobe",
    secondary: "Deadmau5",
    matched: true,
    meta: (
      <>
        <div>8A</div>
        <div>128</div>
        <div>96</div>
      </>
    ),
  },
};

export const Unmatched: Story = {
  args: {
    primary: "Unknown Track",
    secondary: "Various Artists",
    matched: false,
    meta: (
      <>
        <div>—</div>
        <div>—</div>
        <div>—</div>
      </>
    ),
  },
};

export const Selected: Story = {
  args: {
    selected: true,
    primary: "Innerbloom",
    secondary: "RÜFÜS DU SOL",
    matched: true,
    meta: <Badge variant="success">high</Badge>,
  },
};
