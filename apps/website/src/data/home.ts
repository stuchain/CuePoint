import { featureHref, type Unshipped } from "./features";

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

// ---- one section per thing the app does ----

export interface Feature {
  readonly id: string;
  /** The page's name for it, as the app names it. */
  readonly name: string;
  readonly heading: string;
  /** Two or three sentences. */
  readonly text: string;
  readonly shot: AppShotId;
  /**
   * Where "Learn more" goes: the section's feature page (SITE-08), which links the guide page for the details.
   */
  readonly learnMore?: { readonly label: string; readonly path: string };
  /** Set while the app does not ship this page yet (SITE-08): the section carries a marker a public build refuses. */
  readonly unshipped?: Unshipped;
}

const more = (slug: string) => ({ label: "Learn more", path: featureHref(slug) });

export const FEATURES: readonly Feature[] = [
  {
    id: "clean",
    name: "Clean",
    heading: "Match your tracks to Beatport and fix what is wrong",
    text: "Match a playlist, a Collection or your whole library to Beatport. CuePoint keeps every candidate it found and accepts a match by itself only when it is certain, so you review the rest with the keyboard. It also finds missing files and possible duplicates, and it deletes nothing.",
    shot: "clean",
    learnMore: more("clean"),
  },
  {
    id: "library",
    name: "The Library",
    heading: "Browse, filter and see your keys",
    text: "Search and filter the whole collection, choose your columns, and click a key on the Camelot wheel to see only the tracks in it. A matched track gets Beatport's key, and you can apply its tempo, genre, label and year too. Your own values stay on top of Rekordbox's.",
    shot: "library",
    learnMore: more("library"),
  },
  {
    id: "keys",
    name: "Keys",
    heading: "See the keys of any playlist",
    text: "Pick one or several playlists, Collections or Sets and see how many tracks you have in each key, on the Camelot wheel and as a list. Click a key to list its tracks.",
    shot: "keys",
    learnMore: more("keys"),
    unshipped: { shipped: false, step: "PAGES-16" },
  },
  {
    id: "waveforms",
    name: "Waveforms",
    heading: "See each track's shape before you play it",
    text: "CuePoint works out a waveform for every track whose file it can find, and draws your Rekordbox cues, loops and beat grid on it. The same pass measures how loud each track is, and Prepare tells you how much louder or quieter the next one will be.",
    shot: "waveforms",
    learnMore: more("waveforms"),
  },
  {
    id: "discover",
    name: "Discover",
    heading: "Find new music from artists and labels you play",
    text: "Discover looks on Beatport for new music from the artists and labels already in your library. Keep a wantlist, send tracks to a Beatport playlist, and find tracks in your own library that are similar to one you like.",
    shot: "discover",
    learnMore: more("discover"),
  },
  {
    id: "prepare",
    name: "Prepare",
    heading: "Plan a set before the gig",
    text: "Lay out a set as a running order in chapters, with planned times. CuePoint checks each transition, points out a key clash or a tempo that does not fit, and suggests tracks for a gap. When it is ready, make a set list.",
    shot: "prepare",
    learnMore: more("prepare"),
  },
  {
    id: "statistics",
    name: "Statistics",
    heading: "See what your library holds",
    text: "Statistics shows your most played tracks, your top artists and labels, and the tracks you have never played. It also shows how your library spreads by genre, tempo, year and rating, with a key summary that opens Keys.",
    shot: "statistics",
    learnMore: more("statistics"),
    unshipped: { shipped: false, step: "STATS-02..07" },
  },
  {
    id: "export",
    name: "Export to Rekordbox",
    heading: "Send it back to Rekordbox",
    text: "Export writes a new Rekordbox XML file with your key, tempo, genre, label, year and rating, and the Collections you choose as playlists. Cue points and beat grids are kept exactly as Rekordbox wrote them. A preview shows what will be written first, and the file you imported is never changed.",
    shot: "export",
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
    text: "CuePoint is free to download and to use.",
    evidence: [{ file: "apps/website/PRODUCT.md", phrase: "CuePoint is a free desktop app for DJs" }],
  },
  {
    id: "local",
    title: "Runs on your computer",
    text: "Your library is read and kept on your computer. It goes online to look tracks up on Beatport when you ask it to. When it hits a bug it sends an error report, with your names removed; you can turn that off in Settings \u2192 Privacy.",
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
    text: "CuePoint never deletes or moves your music files, and never changes the file you imported from Rekordbox. It writes tags into your music files only when you ask it to. Before it writes tags, exports, or removes tracks that left your Rekordbox export, it shows a preview, and nothing happens until you confirm.",
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
    text: "CuePoint reads the collection you export from Rekordbox as XML, and writes a new XML file back for Rekordbox to import.",
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
