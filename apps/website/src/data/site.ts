/** Facts about the site that more than one page or component needs. */

export const SITE_NAME = "CuePoint";

/** The repository, linked from the footer. */
export const GITHUB_URL = "https://github.com/stuchain/CuePoint";

/**
 * The branch that repository links (the guide's links to files, "Edit on GitHub") point at. v1 is on
 * `feature` until it is merged to `main`; change this one line then.
 */
export const GITHUB_BRANCH = "feature";

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
 * (DEC-144). The name the user gave on 2026-10-08; the user approves the policy text before launch
 * (SITE-11, SITE-13).
 */
export const PUBLISHER = "Stelios Vasileiou";

/**
 * The address people write to about privacy, the terms and anything else the publisher is asked.
 * TODO(DEC-144): a placeholder. The user gives the real address before launch; the privacy policy
 * and the terms render it from here (SITE-11, SITE-13). Never ship this value.
 */
export const CONTACT_EMAIL = "contact@example.com";

/**
 * Whether the app updates itself (DIST-06 and DIST-07; DEC-145, DEC-169, DEC-170, DEC-174). It is
 * false while `docs/user-guide/getting-started.md` still says "CuePoint does not update itself yet":
 * the download page then says what the guide says (install the new installer over the old one).
 * Whoever finishes DIST-07 and updates the guide flips this to true; `site.test.ts` fails if the two
 * disagree.
 */
export const UPDATES_IN_APP = false;
