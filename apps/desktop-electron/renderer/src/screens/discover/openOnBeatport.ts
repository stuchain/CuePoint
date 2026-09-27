/**
 * "Open on Beatport" (DISCOVER-10, DEC-093).
 *
 * Each selected track's page, in the system browser, through the one narrow
 * bridge method the main process checks: it opens an https page on Beatport's
 * website and refuses anything else. The answer is a sentence only when
 * something did not open, so a click that worked says nothing.
 */
import { pluralize } from "../library/libraryFormat";

export async function openOnBeatport(urls: readonly string[]): Promise<string | null> {
  const open = window.cuepoint?.openBeatportPage;
  if (!open) return "Opening Beatport needs the desktop app.";
  let refused = 0;
  for (const url of urls) {
    try {
      if (!(await open(url))) refused += 1;
    } catch {
      refused += 1;
    }
  }
  if (refused === 0) return null;
  return `${pluralize(refused, "page")} could not be opened: CuePoint opens only pages on beatport.com.`;
}
