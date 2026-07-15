import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./TextField";
import { Select } from "./Select";

const meta = {
  title: "Components/Form",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const TextFieldDefault: Story = {
  render: () => <TextField label="Filename prefix" defaultValue="cuepoint-export" />,
};

export const TextFieldError: Story = {
  render: () => (
    <TextField label="Beatport token" error="Token expired — sign in again." />
  ),
};

export const SelectDefault: Story = {
  render: () => (
    <Select
      label="Format"
      defaultValue="csv"
      options={[
        { value: "csv", label: "CSV" },
        { value: "json", label: "JSON" },
        { value: "xlsx", label: "Excel" },
      ]}
    />
  ),
};
