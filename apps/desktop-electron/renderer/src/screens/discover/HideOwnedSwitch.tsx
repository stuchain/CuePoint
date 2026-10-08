/**
 * The one switch for tracks already in the library (DSC-6, FLW-15).
 *
 * Results and the artist and label pages hide them the same way, with these
 * words and the same default, on. The wantlist is the exception: it is the
 * user's own list, so it keeps its three-way filter, set to Any.
 */

/** What "in your library" means, said once, where the switch is (DEC-092). */
export const IN_LIBRARY_EXPLAINER =
  "Tracks you've matched on the Clean page. Match more tracks there to hide more of what you already have.";

interface HideOwnedSwitchProps {
  hiding: boolean;
  onChange: (hiding: boolean) => void;
}

export function HideOwnedSwitch({ hiding, onChange }: HideOwnedSwitchProps) {
  return (
    <label className="discover-toolbar__check" title={IN_LIBRARY_EXPLAINER}>
      <input
        type="checkbox"
        checked={hiding}
        onChange={(event) => onChange(event.target.checked)}
      />
      Hide tracks already in your library
    </label>
  );
}
