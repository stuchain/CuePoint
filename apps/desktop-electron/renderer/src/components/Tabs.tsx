import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { PixelIcon } from "./PixelIcon";
import { useMotion } from "../tokens/MotionContext";
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
  /** Names the tablist for a screen reader ("Library views"); give one wherever there is more than one strip (M474). */
  label?: string;
}

/** The id of a tab's button, for a panel's `aria-labelledby`. */
export function tabId(idPrefix: string, id: string): string {
  return `${idPrefix}-tab-${id}`;
}

/** The id of a tab's panel, which the tab's `aria-controls` names. */
export function panelId(idPrefix: string, id: string): string {
  return `${idPrefix}-panel-${id}`;
}

/** A count or a short word, which can be named in an aria-label. */
function plain(detail: ReactNode): detail is string | number {
  return typeof detail === "string" || typeof detail === "number";
}

/** Whether a strip holds more tabs than it shows to the right of what is in view. */
function hasMoreToRight(strip: HTMLElement): boolean {
  return strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1;
}

export function Tabs({ tabs, activeId, onChange, variant = "main", idPrefix, label }: TabsProps) {
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  // The "more" chevron scrolls smoothly only while motion may move (M387): under reduced motion or
  // with Scrolling off it jumps.
  const smooth = useMotion("scroll");

  // Sub-tabs that do not fit scroll sideways; a quiet chevron at the right edge, over a fade,
  // says there is more and scrolls it (C27).
  const measure = useCallback(() => {
    const node = strip.current;
    setMore(variant === "sub" && node !== null && hasMoreToRight(node));
  }, [variant]);
  useLayoutEffect(measure, [measure, tabs.length]);
  useEffect(() => {
    const node = strip.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  // Roving focus (C199): only the active tab is in the tab order; the arrow keys move between tabs
  // (skipping a disabled one, wrapping round) and choose the one they land on; Home and End go to
  // the ends.
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const enabled = tabs.map((tab, index) => (tab.disabled ? -1 : index)).filter((index) => index >= 0);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(from);
    let target: number | undefined;
    if (event.key === "ArrowRight") target = enabled[(at + 1) % enabled.length];
    else if (event.key === "ArrowLeft") target = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (event.key === "Home") target = enabled[0];
    else if (event.key === "End") target = enabled[enabled.length - 1];
    if (target === undefined) return;
    event.preventDefault();
    const next = tabs[target]!;
    onChange(next.id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[target]?.focus();
    buttons?.[target]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  // The one tab in the tab order: the active one, or the first enabled tab when the active id
  // matches no enabled tab, so the strip is never unreachable by Tab (S6).
  const stop = tabs.find((tab) => tab.id === activeId && !tab.disabled)?.id ?? tabs.find((tab) => !tab.disabled)?.id;

  return (
    <div
      ref={strip}
      className={`cp-tabs ${variant === "sub" ? "cp-tabs--sub" : ""}`.trim()}
      role="tablist"
      aria-label={label}
      onScroll={measure}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={idPrefix ? tabId(idPrefix, tab.id) : undefined}
          aria-controls={idPrefix ? panelId(idPrefix, tab.id) : undefined}
          aria-selected={tab.id === activeId}
          aria-disabled={tab.disabled ? true : undefined}
          tabIndex={tab.id === stop ? 0 : -1}
          className={`cp-tabs__tab ${tab.id === activeId ? "cp-tabs__tab--active" : ""}`}
          // A plain count is named with its label and a comma ("Missing files, 3"); a chip or other
          // element is read in its place, after a hidden comma.
          aria-label={plain(tab.detail) ? `${tab.label}, ${tab.detail}` : undefined}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label}
          {tab.detail !== undefined && tab.detail !== null && (
            <>
              {/* Said, not drawn: the name reads "Missing files, 3", not "Missing files3". A plain
                  count is in the button's aria-label instead. */}
              {!plain(tab.detail) && <span className="cp-tabs__comma">, </span>}
              <span className="cp-tabs__detail">{tab.detail}</span>
            </>
          )}
        </button>
      ))}
      {more && (
        <button
          type="button"
          className="cp-tabs__more"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => strip.current?.scrollBy?.({ left: Math.max(1, (strip.current?.clientWidth ?? 0) * 0.6), behavior: smooth ? "smooth" : "auto" })}
        >
          <PixelIcon name="chevron-right-sm" size="sm" />
        </button>
      )}
    </div>
  );
}
