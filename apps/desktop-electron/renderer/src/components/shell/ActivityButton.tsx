import { Button } from "../Button";
import { Hint } from "../Hint";
import { openActivity } from "./activityState";

/** The Activity button's reason; its shortcut is drawn beside it as a key cap. */
const ACTIVITY_HINT = "Activity: what CuePoint has done";

/**
 * Opens the Activity panel. It is the last item of the status strip, next to the jobs it lists
 * (M273, D25): Activity opens a dialog over the page and is not a page, so it is not in the
 * sidebar's list of pages. Ctrl+Shift+A opens it from anywhere.
 */
export function ActivityButton() {
  return (
    <Hint text={ACTIVITY_HINT} shortcut="Mod+Shift+A" portal>
      <Button variant="quiet" className="cp-status__activity" aria-label="Activity" aria-haspopup="dialog" onClick={openActivity}>
        Activity
      </Button>
    </Hint>
  );
}
