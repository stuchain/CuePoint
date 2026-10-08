import { useState } from "react";

import { Button, Modal, useToast } from "../components";

interface ResetToDefaultsProps {
  /** The section's name, as the page titles it: "Appearance". */
  section: string;
  /** What the reset sets, in a sentence, shown before it asks. */
  summary: string;
  /** Sets the section's defaults and returns the way to put back what was there. */
  onReset: () => () => void;
}

/**
 * A section's "Reset to defaults" (SET-11): it asks first, says what it will
 * set, and afterwards offers Undo in a toast that puts the previous values back.
 */
export function ResetToDefaults({ section, summary, onReset }: ResetToDefaultsProps) {
  const [asking, setAsking] = useState(false);
  const { push } = useToast();

  const confirm = () => {
    const undo = onReset();
    setAsking(false);
    push(`${section} reset to defaults.`, "info", { label: "Undo", onClick: undo });
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setAsking(true)}>
        Reset to defaults
      </Button>
      <Modal
        open={asking}
        title={`Reset ${section} to defaults?`}
        onClose={() => setAsking(false)}
        secondaryAction={{ label: "Cancel", onClick: () => setAsking(false) }}
        primaryAction={{ label: "Reset", onClick: confirm }}
      >
        <p>{summary}</p>
      </Modal>
    </>
  );
}
