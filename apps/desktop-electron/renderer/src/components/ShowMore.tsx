import { SHOW_LESS, showAll } from "../format/words";
import { Button } from "./Button";

interface ShowMoreProps {
  /** How many there are in all. */
  total: number;
  /** Whether the whole list is showing. */
  expanded: boolean;
  onToggle: () => void;
  /** For the grouped count; the computer's locale when left out. */
  locale?: string;
  /** What the button controls, for `aria-controls`. */
  controls?: string;
}

/**
 * The one button that opens a list that was cut short and shuts it again (C18): "Show all 24" and
 * "Show less". Quiet, so it never competes with the page's main button.
 */
export function ShowMore({ total, expanded, onToggle, locale, controls }: ShowMoreProps) {
  return (
    <Button variant="quiet" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      {expanded ? SHOW_LESS : showAll(total, locale)}
    </Button>
  );
}
