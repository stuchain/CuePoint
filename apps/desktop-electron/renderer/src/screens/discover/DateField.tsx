/**
 * A day field that shows the day the app's way ("Sep 27, 2026"), with a pixel calendar button (M39, D7 B).
 *
 * The browser's own date input draws its locale's "09/27/2026" in its own face with a native
 * calendar glyph. Here that input stays, as the field's value and keyboard, but is laid
 * invisibly over the whole field: its indicator is hidden, the field draws the day the way
 * every other date in the app is written, and a click, Enter or Space opens the browser's
 * calendar. The native calendar popup is accepted for now (D7 B).
 */
import type { KeyboardEvent, MouseEvent } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import { formatDate } from "../../format/dates";

interface DateFieldProps {
  /** The day as the engine writes it, "2026-09-27", or "" for none. */
  value: string;
  onChange: (value: string) => void;
  /** The field's name for a screen reader: "From". */
  label: string;
  /** Said where there is no day: "Choose a day". */
  empty?: string;
  className?: string;
}

/** A "2026-09-27" read as that day on this computer, not as midnight UTC. */
function day(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** Opens the browser's calendar where it can (a test's jsdom and older hosts cannot). */
function showCalendar(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // Already open, or not allowed right now: the keyboard still edits the day.
  }
}

export function DateField({ value, onChange, label, empty = "Choose a day", className = "" }: DateFieldProps) {
  const shown = day(value);
  return (
    <span className={`cp-field__input discover-date ${className}`.trim()}>
      <span className="discover-date__text" aria-hidden="true">
        {shown ? formatDate(shown) : empty}
      </span>
      <span className="discover-date__button" aria-hidden="true">
        <PixelIcon name="calendar" size="sm" />
      </span>
      <input
        type="date"
        className="discover-date__input"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event: MouseEvent<HTMLInputElement>) => showCalendar(event.currentTarget)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            showCalendar(event.currentTarget);
          }
        }}
      />
    </span>
  );
}
