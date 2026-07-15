import React from "react";
import type { Preview } from "@storybook/react";
import "../src/index.css";
import { initScale } from "../src/tokens/scale";
import {
  BUILT_IN_THEME_OPTIONS,
  DEFAULT_THEME,
  applyTheme,
  getThemeBackground,
  type BuiltInThemeId,
} from "../src/tokens/theme";

initScale();

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "app",
      values: BUILT_IN_THEME_OPTIONS.map((t) => ({
        name: t.label,
        value: getThemeBackground(t.id),
      })),
    },
  },
  globalTypes: {
    theme: {
      description: "Built-in color theme preset",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: BUILT_IN_THEME_OPTIONS.map((t) => ({ value: t.id, title: t.label })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: DEFAULT_THEME,
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.theme as BuiltInThemeId) ?? DEFAULT_THEME;
      applyTheme(theme);
      return React.createElement(Story);
    },
  ],
};

export default preview;
