/**
 * The guide's table (SITE-09). The guide itself is `docs/user-guide/*.md`, read where it is and never
 * changed for the site: the files carry no front matter, so each page's title, description, order and
 * section live here. The build fails if a file has no row or a row has no file (`assertGuideTable`).
 *
 * Descriptions are written for a DJ, 70 to 160 characters (the checks in scripts/check-site.mjs), and
 * each is unique. The page title on the site is `title`; the page's own first heading stays as the
 * file has it.
 */

export type GuideSection = "start" | "use" | "help" | "policy";

export interface GuideSectionInfo {
  readonly id: GuideSection;
  readonly label: string;
}

/** The sidebar's sections, in order. `support-policy.md` is alone in the last one (not the main list). */
export const GUIDE_SECTIONS: readonly GuideSectionInfo[] = [
  { id: "start", label: "Start here" },
  { id: "use", label: "Using CuePoint" },
  { id: "help", label: "When you need more" },
  { id: "policy", label: "Policy" },
];

export interface GuideRow {
  /** The file in docs/user-guide/, with its `.md`. The page's address is the name without it. */
  readonly file: string;
  readonly title: string;
  /** The meta description: 70 to 160 characters, unique. */
  readonly description: string;
  readonly order: number;
  readonly section: GuideSection;
}

export const GUIDE_ROWS: readonly GuideRow[] = [
  {
    file: "getting-started.md",
    title: "Getting started",
    description:
      "Install CuePoint, export your collection from Rekordbox, import it and match your first playlist on Beatport. A first session from start to finish.",
    order: 1,
    section: "start",
  },
  {
    file: "features.md",
    title: "Features",
    description:
      "Everything CuePoint does with your Rekordbox collection, page by page, and the things it promises never to do to your files.",
    order: 2,
    section: "start",
  },
  {
    file: "the-window.md",
    title: "The CuePoint window",
    description:
      "Find your way around CuePoint: the sidebar, search, Track details, the status strip, keyboard shortcuts, themes and the privacy switch.",
    order: 3,
    section: "start",
  },
  {
    file: "library.md",
    title: "Your library",
    description:
      "Import your Rekordbox export, browse and filter your tracks, refresh after changes and write tags to your files, with a preview before anything is saved.",
    order: 4,
    section: "use",
  },
  {
    file: "keys.md",
    title: "Keys",
    description:
      "See how many tracks you have in each key across your playlists, Collections and Sets, then open the tracks in any key or the keys that mix with it.",
    order: 5,
    section: "use",
  },
  {
    file: "organization.md",
    title: "Organizing your library",
    description:
      "Make your own Collections, Smart Collections, tags, ratings and notes beside your Rekordbox playlists, and see what Rekordbox will and will not see.",
    order: 6,
    section: "use",
  },
  {
    file: "clean.md",
    title: "Clean",
    description:
      "Match your tracks to Beatport, review each match with the keyboard, and find missing files and possible duplicates. Nothing is deleted or moved.",
    order: 7,
    section: "use",
  },
  {
    file: "discover.md",
    title: "Discover",
    description:
      "Find new music on Beatport from the artists and labels in your library, keep a wantlist and send tracks you want to a Beatport playlist.",
    order: 8,
    section: "use",
  },
  {
    file: "prepare.md",
    title: "Prepare",
    description:
      "Plan a set: put tracks in running order, split it into chapters, time each one, check every transition and take the set out as a list or a playlist.",
    order: 9,
    section: "use",
  },
  {
    file: "player.md",
    title: "Playing music",
    description:
      "Play any track in your library gaplessly, queue the view you are looking at, pick the audio output and find out why a file will not play.",
    order: 10,
    section: "use",
  },
  {
    file: "waveforms.md",
    title: "Waveforms",
    description:
      "See every track as a waveform with its loudness, your Rekordbox cue points and beat grid, and learn how CuePoint makes them in the background.",
    order: 11,
    section: "use",
  },
  {
    file: "rekordbox-export.md",
    title: "Exporting to Rekordbox",
    description:
      "Send your Collections, ratings and changed values back to Rekordbox as a new XML file, and see what the export carries before you open it.",
    order: 12,
    section: "use",
  },
  {
    file: "workflows.md",
    title: "Workflows",
    description:
      "Step-by-step routines for the tasks DJs do most: a first clean-up, a big batch, a quality check, an export and preparing a set.",
    order: 13,
    section: "use",
  },
  {
    file: "troubleshooting.md",
    title: "Troubleshooting",
    description:
      "Fixes for import errors, slow runs, matches that will not appear and failed exports, plus how to send a support bundle or report a problem.",
    order: 14,
    section: "help",
  },
  {
    file: "performance.md",
    title: "Performance",
    description:
      "Measured import and browse times for a 50,000-track library, what slows CuePoint down, and the settings that tune it for a big collection.",
    order: 15,
    section: "help",
  },
  {
    file: "glossary.md",
    title: "Glossary",
    description:
      "Plain definitions of the words CuePoint uses: Set, chapter, entry, planned time, waveform, hot cue, beat grid, LUFS, LU and more.",
    order: 16,
    section: "help",
  },
  {
    file: "support-policy.md",
    title: "Support policy",
    description:
      "Which systems CuePoint supports, how fast problems are answered, what to send with a report and where the logs are kept.",
    order: 17,
    section: "policy",
  },
];

/** What went wrong with the table, or nothing: both lists empty. */
export interface GuideTableProblems {
  /** Files in the guide folder with no row. */
  readonly missingRows: readonly string[];
  /** Rows whose file is not in the guide folder. */
  readonly missingFiles: readonly string[];
  /** Other faults: a duplicate file, order, title or description, a bad description length. */
  readonly invalid: readonly string[];
}

export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

export function checkGuideTable(files: readonly string[], rows: readonly GuideRow[] = GUIDE_ROWS): GuideTableProblems {
  const fileSet = new Set(files);
  const rowFiles = new Set(rows.map((r) => r.file));
  const invalid: string[] = [];
  const seen = (label: string, values: readonly (string | number)[]) => {
    const counts = new Map<string | number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const [v, n] of counts) if (n > 1) invalid.push(`${label} "${v}" is used by ${n} rows`);
  };
  seen("file", rows.map((r) => r.file));
  seen("order", rows.map((r) => r.order));
  seen("title", rows.map((r) => r.title));
  seen("description", rows.map((r) => r.description));
  for (const r of rows) {
    const n = r.description.length;
    if (n < DESCRIPTION_MIN || n > DESCRIPTION_MAX) {
      invalid.push(`${r.file}: the description is ${n} characters, outside ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}`);
    }
    if (!GUIDE_SECTIONS.some((s) => s.id === r.section)) invalid.push(`${r.file}: unknown section "${r.section}"`);
  }
  return {
    missingRows: files.filter((f) => !rowFiles.has(f)).sort(),
    missingFiles: rows.map((r) => r.file).filter((f) => !fileSet.has(f)).sort(),
    invalid,
  };
}

/** Throws, naming every fault, when the table and the folder disagree. */
export function assertGuideTable(files: readonly string[], rows: readonly GuideRow[] = GUIDE_ROWS): void {
  const p = checkGuideTable(files, rows);
  const lines = [
    ...p.missingRows.map((f) => `docs/user-guide/${f} has no row in src/content/guide.ts`),
    ...p.missingFiles.map((f) => `src/content/guide.ts has a row for ${f}, but docs/user-guide/ has no such file`),
    ...p.invalid,
  ];
  if (lines.length > 0) throw new Error(`The guide table is wrong:\n  ${lines.join("\n  ")}`);
}

/** The slug of a file: its name without `.md`. It is the page's address under /guide/. */
export const guideSlug = (file: string): string => file.replace(/\.md$/, "");

/** The path of a guide page relative to the base. The index is `guide/`. */
export const guidePath = (slug: string): string => `guide/${slug}/`;

/** The rows in sidebar order. */
export function orderedRows(rows: readonly GuideRow[] = GUIDE_ROWS): GuideRow[] {
  return [...rows].sort((a, b) => a.order - b.order);
}

/** The sidebar: every section with its pages, in order. */
export function guideSections(rows: readonly GuideRow[] = GUIDE_ROWS) {
  const ordered = orderedRows(rows);
  return GUIDE_SECTIONS.map((section) => ({
    ...section,
    pages: ordered.filter((r) => r.section === section.id),
  })).filter((s) => s.pages.length > 0);
}

/** The pages before and after one, in reading order (the policy page ends the list). */
export function neighbours(file: string, rows: readonly GuideRow[] = GUIDE_ROWS) {
  const ordered = orderedRows(rows);
  const i = ordered.findIndex((r) => r.file === file);
  return { previous: i > 0 ? ordered[i - 1] : undefined, next: i >= 0 ? ordered[i + 1] : undefined };
}

/** The section a row belongs to. */
export function guideSection(id: GuideSection): GuideSectionInfo {
  const found = GUIDE_SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown guide section "${id}"`);
  return found;
}
