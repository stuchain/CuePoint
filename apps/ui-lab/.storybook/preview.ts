import type { Preview } from "@storybook/react";
import "../src/index.css";
import { initScale } from "../src/tokens/scale";

initScale();

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#1a1a2e" }],
    },
  },
};

export default preview;
