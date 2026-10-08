/** Facts about the site that more than one page or component needs. */

export const SITE_NAME = "CuePoint";

/** The repository, linked from the footer. */
export const GITHUB_URL = "https://github.com/stuchain/CuePoint";

/**
 * The one primary action on every page (DEC-141). Until 1.0.0 the site offers no download (DEC-194):
 * it sends a visitor to the repository's releases, where they can watch for the release.
 * SITE-07 turns this into the download button when the release data holds a normal release.
 */
export const PRIMARY_ACTION = {
  label: "Get notified of 1.0",
  href: "https://github.com/stuchain/CuePoint/releases",
} as const;

/**
 * The publisher named in the footer, the privacy policy and the terms: the user, as an individual
 * (DEC-144). TODO(DEC-144): this is the neutral GitHub owner name until the user gives the name to
 * print; the user's full name replaces it in SITE-11, and the user approves the policy text before
 * launch (SITE-11, SITE-13).
 */
export const PUBLISHER = "stuchain";
