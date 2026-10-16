import type { ReactNode } from "react";

import "./Tabs.css";

interface TabItem {
  id: string;
  label: string;
  /** Beside the label, in the same button: a count or a chip (Statistics' "Library 2,847"). */
  detail?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /**
   * Exactly two looks. `"main"` (the default) is the underline strip that switches a page's
   * views; `"sub"` is the quiet pill row inside a page or a panel (T8). Both pad a tab the same.
   */
  variant?: "main" | "sub";
  /**
   * Wires the tabs to their panels: each tab gets `id` and `aria-controls`, and the page gives
   * its panels the ids from `tabId` and `panelId`. Absent, no ids are written.
   */
  idPrefix?: string;
}

/** The id of a tab's button, for a panel's `aria-labelledby`. */
export function tabId(idPrefix: string, id: string): string {
  return `${idPrefix}-tab-${id}`;
}

/** The id of a tab's panel, which the tab's `aria-controls` names. */
export function panelId(idPrefix: string, id: string): string {
  return `${idPrefix}-panel-${id}`;
}

export function Tabs({ tabs, activeId, onChange, variant = "main", idPrefix }: TabsProps) {
  return (
    <div className={`cp-tabs ${variant === "sub" ? "cp-tabs--sub" : ""}`.trim()} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={idPrefix ? tabId(idPrefix, tab.id) : undefined}
          aria-controls={idPrefix ? panelId(idPrefix, tab.id) : undefined}
          aria-selected={tab.id === activeId}
          className={`cp-tabs__tab ${tab.id === activeId ? "cp-tabs__tab--active" : ""}`}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.detail !== undefined && tab.detail !== null && (
            <span className="cp-tabs__detail">{tab.detail}</span>
          )}
        </button>
      ))}
    </div>
  );
}
