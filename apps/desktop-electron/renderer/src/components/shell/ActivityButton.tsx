import { Button } from "../Button";
import { Hint } from "../Hint";
import { openActivity } from "./activityState";

/** The Activity button's reason; its shortcut is drawn beside it as a key cap. */
const ACTIVITY_HINT = "Activity: what CuePoint has done";

/**
 * Opens the Activity panel. It sits at the right end of the player bar, which is always on
 * screen, so the status strip can stay out of the way while nothing is happening (C231).
 */
export function ActivityButton({ className }: { className?: string }) {
  return (
    <Hint text={ACTIVITY_HINT} shortcut="Mod+Shift+A">
      <Button variant="secondary" className={className} onClick={openActivity}>
        Activity
      </Button>
    </Hint>
  );
}
