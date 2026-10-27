/**
 * The Wheel | List switch (K15, M161): which reading of the counts the middle pane shows. It sits in
 * that pane's own head, and it is a radio group, not a tab strip: it changes what one pane draws and
 * has no panels of its own. It wears the sub-tabs' look. Arrows move to the other choice and choose it.
 */
import type { KeyboardEvent } from "react";

import type { KeysView } from "./keysView";
import "../../components/Tabs.css";

const VIEWS: { id: KeysView; label: string }[] = [
  { id: "wheel", label: "Wheel" },
  { id: "list", label: "List" },
];

interface KeysViewSwitchProps {
  view: KeysView;
  onChange: (view: KeysView) => void;
}

export function KeysViewSwitch({ view, onChange }: KeysViewSwitchProps) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = (from + 1) % VIEWS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = (from - 1 + VIEWS.length) % VIEWS.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = VIEWS.length - 1;
    if (to === null) return;
    event.preventDefault();
    onChange(VIEWS[to]!.id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[to]?.focus();
  };
  return (
    <div className="cp-tabs cp-tabs--sub keys-page__switch" role="radiogroup" aria-label="Show keys as">
      {VIEWS.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="radio"
          aria-checked={item.id === view}
          tabIndex={item.id === view ? 0 : -1}
          className={`cp-tabs__tab ${item.id === view ? "cp-tabs__tab--active" : ""}`}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
