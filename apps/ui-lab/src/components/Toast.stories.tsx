import type { Meta, StoryObj } from "@storybook/react";
import { ToastProvider, useToast } from "./Toast";
import { Button } from "./Button";

function ToastDemo() {
  const { push } = useToast();
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button variant="secondary" onClick={() => push("Saved settings.", "success")}>
        Success
      </Button>
      <Button variant="secondary" onClick={() => push("Network retry…", "warning")}>
        Warning
      </Button>
      <Button variant="danger" onClick={() => push("Export failed.", "error")}>
        Error
      </Button>
    </div>
  );
}

function WithProvider() {
  return (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  );
}

const meta = {
  title: "Components/Toast",
  component: WithProvider,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof WithProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Triggers: Story = {};
