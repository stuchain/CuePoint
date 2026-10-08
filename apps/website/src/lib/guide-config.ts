import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL, addressParts } from "../../site.config";
import { GITHUB_BRANCH, GITHUB_URL } from "../data/site";
import type { GuideLinkConfig } from "./guide-links";

/**
 * The guide's link settings: the folder, the repository and the base. The project root (apps/website) is
 * found from this file's own place. A built page runs from dist/.prerender, where that place is wrong, so
 * the working directory (npm runs the build in apps/website) is the fallback; the first root with
 * docs/user-guide two folders up wins.
 */
export function guideLinkConfig(projectRoot?: string): GuideLinkConfig {
  const candidates = projectRoot ? [projectRoot] : [fileURLToPath(new URL("../../", import.meta.url)), process.cwd()];
  for (const root of candidates) {
    const repoRoot = resolve(root, "..", "..");
    const guideDir = resolve(repoRoot, "docs", "user-guide");
    if (existsSync(guideDir)) {
      return { guideDir, repoRoot, base: addressParts(SITE_URL).base, githubUrl: GITHUB_URL, branch: GITHUB_BRANCH };
    }
  }
  throw new Error(`The guide folder docs/user-guide was not found two folders above ${candidates.join(" or ")}`);
}
