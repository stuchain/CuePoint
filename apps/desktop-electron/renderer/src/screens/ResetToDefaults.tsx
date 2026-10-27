import { Button, useToast } from "../components";

interface ResetToDefaultsProps {
  /** The section's name, as the page titles it: "Appearance". Said in the Undo toast, not on the button. */
  section: string;
  /** Sets the section's defaults and returns the way to put back what was there. */
  onReset: () => () => void;
  /** Every value already is its default: there is nothing to reset, so no button is drawn (M436). */
  atDefaults?: boolean;
}

/**
 * A section's "Reset to defaults" (SET-11, M436): the quiet button at the right of the section's
 * title line (`PanelTools`), the same words in every section, and drawn only while a value
 * differs from its default. It resets at once, with no question, and offers Undo in a toast that
 * puts the previous values back. A reversible action acts and offers Undo rather than asking first.
 */
export function ResetToDefaults({ section, onReset, atDefaults = false }: ResetToDefaultsProps) {
  const { push } = useToast();
  if (atDefaults) return null;

  const reset = () => {
    const undo = onReset();
    push(`${section} reset`, "info", { label: "Undo", onClick: undo });
  };

  return (
    <Button variant="quiet" onClick={reset}>
      Reset to defaults
    </Button>
  );
}
