import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import { openActivity } from "./activityState";

/** The Activity button's reason; its shortcut is drawn beside it as a key cap. */
const ACTIVITY_HINT = "Activity: what CuePoint has done";

/**
 * Opens the Activity panel. It is a row of the sidebar's pinned foot, above Settings: the icon
 * and the word, the icon alone in the collapsed rail. The status strip holds no button, so it
 * can stay out of the way while nothing is happening (C231).
 */
export function ActivityButton({ collapsed }: { collapsed: boolean }) {
  return (
    <Hint text={ACTIVITY_HINT} shortcut="Mod+Shift+A" portal placement="right">
      <button type="button" className="cp-sidebar__link cp-sidebar__activity" aria-label="Activity" onClick={openActivity}>
        <span className="cp-sidebar__icon" aria-hidden>
          <PixelIcon name="activity" />
        </span>
        {!collapsed && <span className="cp-sidebar__label">Activity</span>}
      </button>
    </Hint>
  );
}
