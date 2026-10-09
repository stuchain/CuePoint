import { featureHref } from "./features";

/**
 * What the home page says (SITE-06). Plain American English for a DJ (DEC-132, DEC-158); never "engine"
 * or "jobs" (DEC-155); every claim is backed by the user guide, the privacy notice or a decision, and
 * `home.test.ts` holds the words, the links and the sources.
 */

// ---- the opening scene's story, as text (nothing is only in the 3D) ----

export interface OpeningStep {
  readonly id: "messy" | "matched" | "ready";
  readonly title: string;
  readonly text: string;
}

export const OPENING_STEPS: readonly OpeningStep[] = [
  {
    id: "messy",
    title: "A messy library",
    text: "Years of tracks, and the keys, tempos and genres do not agree. Some are missing, some are wrong.",
  },
  {
    id: "matched",
    title: "Matched on Beatport",
    text: "CuePoint looks up each track on Beatport and brings back its key, and offers its tempo and genre. It accepts the matches it is sure of and leaves the rest for you to review.",
  },
  {
    id: "ready",
    title: "Organized and ready for the booth",
    text: "Your tracks line up on the Camelot wheel, sorted by key, and go back to Rekordbox as a new file. Your own corrections stay on top.",
  },
];

// ---- the app's pictures ----

/**
 * One picture slot. Until SITE-04 captures the real app there is no file for it, and the page shows a
 * clearly labelled placeholder of the right size (the app's default window, 1280 x 800, DEC-161); it
 * never shows a made-up screenshot. To put the real picture in, add the file: `src/lib/app-shots.ts`
 * finds `src/assets/app/<id>-<theme>.png` by this slot's id (for example `library-neoDark.png`), and the
 * slot is a placeholder if and only if there is no such file. Nothing else changes.
 */
export interface AppShotDef {
  /** A short name, shown on the placeholder. */
  readonly label: string;
  /** What the real picture shows, as alt text will say it (and what the placeholder promises). */
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

const WINDOW = { width: 1280, height: 800 } as const;

export type AppShotId = "window" | "clean" | "library" | "keys" | "discover" | "prepare" | "statistics" | "waveforms" | "export";

export const APP_SHOTS: Readonly<Record<AppShotId, AppShotDef>> = {
  window: {
    label: "The CuePoint window",
    alt: "The CuePoint window on a library of tracks, with the Camelot wheel open and one key lit.",
    ...WINDOW,
  },
  clean: {
    label: "Clean",
    alt: "The Clean page in the middle of matching a playlist, with the matched tracks and the ones that need review.",
    ...WINDOW,
  },
  library: {
    label: "The Library",
    alt: "The Library page: a table of tracks with their keys, tempos and genres, and the Track details panel open.",
    ...WINDOW,
  },
  keys: {
    label: "Keys",
    alt: "The Keys page: the keys of a playlist counted on the Camelot wheel, with the list of tracks in the keys picked.",
    ...WINDOW,
  },
  discover: {
    label: "Discover",
    alt: "The Discover page: new music on Beatport from artists and labels in the library.",
    ...WINDOW,
  },
  prepare: {
    label: "Prepare",
    alt: "The Prepare page: a Set as a running order in chapters, with the checks between tracks.",
    ...WINDOW,
  },
  statistics: {
    label: "Statistics",
    alt: "The Statistics page: most played tracks, top artists and labels, and how the library spreads by genre and key.",
    ...WINDOW,
  },
  waveforms: {
    label: "Waveforms and the player",
    alt: "The player bar with a track's waveform, and Track details showing its cues, beat grid and loudness.",
    ...WINDOW,
  },
  export: {
    label: "Export to Rekordbox",
    alt: "The export preview, listing what will be written into the new Rekordbox file.",
    ...WINDOW,
  },
};

// ---- what the app does: a few teasers, each one line; the details are on its feature page ----

export interface Feature {
  readonly id: string;
  /** The page's name for it, as the app names it: the teaser's heading. */
  readonly name: string;
  /** One sentence. Everything else is on the feature page. */
  readonly text: string;
  /** Where "Learn more" goes: the feature page (SITE-08), which links the guide page for the details. */
  readonly learnMore: { readonly label: string; readonly path: string };
}

const more = (slug: string) => ({ label: "Learn more", path: featureHref(slug) });

/**
 * Five teasers, the things that bring a DJ to the app (the owner's direction, 2026-10-09: the home page
 * draws people in, the feature pages hold the details). Keys, Waveforms and Statistics have their own
 * feature pages and are linked from /features/.
 */
export const FEATURES: readonly Feature[] = [
  {
    id: "clean",
    name: "Clean",
    text: "Match a playlist or your whole library to Beatport, and review only the matches CuePoint is not sure of.",
    learnMore: more("clean"),
  },
  {
    id: "library",
    name: "The Library",
    text: "Search your whole collection and filter it by key, tempo or genre, with Beatport's key on every matched track.",
    learnMore: more("library"),
  },
  {
    id: "discover",
    name: "Discover",
    text: "Find new music on Beatport from the artists and labels already in your library.",
    learnMore: more("discover"),
  },
  {
    id: "prepare",
    name: "Prepare",
    text: "Plan a set as a running order, and CuePoint points out a key clash or a tempo that does not fit.",
    learnMore: more("prepare"),
  },
  {
    id: "export",
    name: "Export to Rekordbox",
    text: "Write your keys, tempos and genres into a new Rekordbox XML file, and the file you imported is never changed.",
    learnMore: more("export"),
  },
];

// ---- trust ----

export interface TrustClaim {
  readonly id: "free" | "local" | "yours" | "open" | "rekordbox";
  readonly title: string;
  readonly text: string;
  /**
   * What backs the claim: a file from the repository root and a phrase it contains (whitespace and
   * `**` ignored). `home.test.ts` reads each file and looks for the phrase, so a claim cannot outlive
   * the words that support it.
   */
  readonly evidence: readonly { readonly file: string; readonly phrase: string }[];
}

export const TRUST: readonly TrustClaim[] = [
  {
    id: "free",
    title: "Free",
    text: "Free to download and to use.",
    evidence: [{ file: "apps/website/PRODUCT.md", phrase: "CuePoint is a free desktop app for DJs" }],
  },
  {
    id: "local",
    title: "Runs on your computer",
    text: "Your library is kept on your computer; CuePoint goes online when you ask it to look tracks up on Beatport, and sends error reports with your names removed, which you can turn off.",
    evidence: [
      { file: "PRIVACY_NOTICE.md", phrase: "processes your Rekordbox collection locally on your device" },
      { file: "PRIVACY_NOTICE.md", phrase: "only when you initiate actions" },
      { file: "PRIVACY_NOTICE.md", phrase: "Settings \u2192 Privacy \u2192 Send error reports" },
      { file: "PRIVACY_NOTICE.md", phrase: "your file, folder, track, artist, label or playlist names" },
    ],
  },
  {
    id: "yours",
    title: "Your library stays yours",
    text: "CuePoint never deletes or moves your music files, and before it writes tags or exports it shows a preview: nothing happens until you confirm.",
    evidence: [
      { file: "docs/user-guide/clean.md", phrase: "No track, file or playlist is removed, moved or renamed" },
      { file: "docs/user-guide/library.md", phrase: "never moves them" },
      { file: "docs/user-guide/library.md", phrase: "Nothing happens until you press the confirm button" },
      { file: "docs/user-guide/library.md", phrase: "The preview is a read and changes nothing" },
      { file: "docs/user-guide/library.md", phrase: "Only after a preview has answered" },
      { file: "docs/user-guide/rekordbox-export.md", phrase: "CuePoint never writes over it" },
    ],
  },
  {
    id: "open",
    title: "Open source",
    text: "The code is public on GitHub, under the Apache 2.0 license.",
    evidence: [
      { file: "LICENSE", phrase: "Apache License Version 2.0" },
    ],
  },
  {
    id: "rekordbox",
    title: "Made for Rekordbox",
    text: "It reads the collection you export from Rekordbox as XML, and writes a new XML file back for Rekordbox to import.",
    evidence: [
      { file: "docs/user-guide/getting-started.md", phrase: "Export Collection in xml format" },
      { file: "docs/user-guide/rekordbox-export.md", phrase: "writes it into a new Rekordbox XML file" },
    ],
  },
];

// ---- the top of the page ----

export const HERO = {
  heading: "Your Rekordbox library, cleaned up and ready for the booth",
  lead: "CuePoint is a free desktop app for DJs. It matches your tracks to Beatport, fills in the keys and tempos that are missing or wrong, and sends the result back to Rekordbox.",
  title: "CuePoint: clean up your Rekordbox library",
  description:
    "CuePoint is a free desktop app for DJs. Match your Rekordbox library to Beatport, fix keys and tempos, see your keys on the Camelot wheel and plan sets.",
} as const;
