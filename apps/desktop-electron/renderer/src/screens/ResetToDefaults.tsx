import { Button, useToast } from "../components";

interface ResetToDefaultsProps {
  /** The section's name, as the page titles it: "Appearance". */
  section: string;
  /** Sets the section's defaults and returns the way to put back what was there. */
  onReset: () => () => void;
}

/**
 * A section's "Reset {section}" (SET-11): it resets at once, with no question, and
 * offers Undo in a toast that puts the previous values back. A reversible action acts
 * and offers Undo rather than asking first.
 */
export function ResetToDefaults({ section, onReset }: ResetToDefaultsProps) {
  const { push } = useToast();

  const reset = () => {
    const undo = onReset();
    push(`${section} reset`, "info", { label: "Undo", onClick: undo });
  };

  return (
    <Button variant="secondary" onClick={reset}>
      {`Reset ${section}`}
    </Button>
  );
}
