import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Tabs } from "./Tabs";

function TabsDemo() {
  const [active, setActive] = useState("main");
  return (
    <div style={{ width: 420 }}>
      <Tabs
        tabs={[
          { id: "main", label: "Main" },
          { id: "history", label: "Past searches" },
        ]}
        activeId={active}
        onChange={setActive}
      />
    </div>
  );
}

const meta = {
  title: "Components/Tabs",
  component: TabsDemo,
  tags: ["autodocs"],
} satisfies Meta<typeof TabsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MainHistory: Story = {};
