/** One step of a trail. `path` is relative to the base ("" is the home page). */
export interface Crumb {
  label: string;
  path: string;
}
