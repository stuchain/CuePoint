import { describe, expect, it } from "vitest";
import { stripComments } from "../test/cssRules";

import panel from "./Panel.css?raw";
import tabs from "./Tabs.css?raw";
import select from "./Select.css?raw";
import modal from "./Modal.css?raw";
import toast from "./Toast.css?raw";
import contextMenu from "./TrackContextMenu.css?raw";
import suggest from "./SuggestInput.css?raw";
import globalSearch from "./shell/GlobalSearch.css?raw";
import wheelPopover from "./wheel/WheelPopover.css?raw";
import wheelButton from "./wheel/WheelButton.css?raw";
import firstSteps from "../screens/library/FirstSteps.css?raw";
import quickFilters from "../screens/library/QuickFilters.css?raw";
import filterBar from "../screens/library/FilterBar.css?raw";
import button from "./Button.css?raw";
import textField from "./TextField.css?raw";
import sidebar from "./shell/Sidebar.css?raw";
import themeSettings from "../screens/theme-settings.css?raw";
import prepare from "../screens/prepare/prepare.css?raw";

/**
 * Quieter chrome (C11, C16): flat controls and panels draw no bevel or offset shadow.
 * Only the dialog keeps one soft shadow. The tokens stay defined (the website and the
 * player bar's badge use them); the consumers just stop using them.
 */
const SHEETS: Record<string, string> = {
  Panel: panel,
  Tabs: tabs,
  Select: select,
  Modal: modal,
  Toast: toast,
  TrackContextMenu: contextMenu,
  SuggestInput: suggest,
  GlobalSearch: globalSearch,
  WheelPopover: wheelPopover,
  WheelButton: wheelButton,
  FirstSteps: firstSteps,
  QuickFilters: quickFilters,
  FilterBar: filterBar,
  Button: button,
  TextField: textField,
  Sidebar: sidebar,
  "theme-settings": themeSettings,
  prepare,
};

const HEAVY = /--shadow-(panel|badge|bevel[a-z-]*|modal|inset-deep)\b/;

describe.each(Object.entries(SHEETS))("%s stylesheet", (name, css) => {
  const text = stripComments(css);

  it("references no heavy shadow or bevel token", () => {
    expect(HEAVY.exec(text)?.[0]).toBeUndefined();
  });

  it("uses --shadow-dialog only in Modal", () => {
    expect(text.includes("--shadow-dialog")).toBe(name === "Modal");
  });
});
