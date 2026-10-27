/**
 * The one switch for tracks already in the library (DSC-6, FLW-15).
 *
 * Results and the artist and label pages hide them the same way, with these
 * words and the same default, on. The wantlist is the exception: it is the
 * user's own list, so it keeps its three-way filter, set to Any.
 */
import { Hint } from "../../components/Hint";
import { RouteButton } from "../library/RouteButton";
import { cleanMatchState } from "../clean/cleanLink";

/** What "in your library" means, said once, where the switch is (DEC-092). */
export const IN_LIBRARY_EXPLAINER =
  "Tracks you have matched on the Clean page. Match more tracks there to hide more of what you already have.";

/**
 * What "in your library" means, always in view above a table that hides or marks those tracks, with
 * the way to Match (M520). The hover text on the switch says it too, for whoever hovers.
 */
export function InLibraryNote() {
  return (
    <p className="discover-note discover-in-library-note">
      “In your library” counts tracks you have matched on Beatport.{" "}
      <RouteButton to="/clean" state={cleanMatchState()} className="cp-link">
        Match more
      </RouteButton>
    </p>
  );
}

interface HideOwnedSwitchProps {
  hiding: boolean;
  onChange: (hiding: boolean) => void;
}

export function HideOwnedSwitch({ hiding, onChange }: HideOwnedSwitchProps) {
  return (
    <Hint text={IN_LIBRARY_EXPLAINER} inline>
      <label className="discover-toolbar__check">
        <input
          type="checkbox"
          checked={hiding}
          onChange={(event) => onChange(event.target.checked)}
        />
        Hide tracks already in your library
      </label>
    </Hint>
  );
}
