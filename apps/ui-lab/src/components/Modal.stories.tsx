import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

function ModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        open={open}
        title="Export results"
        onClose={() => setOpen(false)}
        secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}
        primaryAction={{ label: "Export", onClick: () => setOpen(false) }}
      >
        <p>Choose export format and destination (mock).</p>
      </Modal>
    </>
  );
}

const meta = {
  title: "Components/Modal",
  component: ModalDemo,
  tags: ["autodocs"],
} satisfies Meta<typeof ModalDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExportDialog: Story = {};
