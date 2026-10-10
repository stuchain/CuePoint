import type { AppShotId } from "./home";

/**
 * What each feature page says (SITE-08): one page per thing the app does, at /features/<slug>/.
 * Plain American English for a DJ (DEC-132, DEC-158); never "engine" or "jobs" (DEC-155). Each claim is
 * backed by the user guide in docs/user-guide/. The lines the guide does not cover yet are written from
 * the decisions and named in `fromDecisions`, so they are found and re-checked when the guide gains the
 * page (the Keys page, DEC-200/201/206; the Camelot wheel, DEC-133).
 *
 * Each page is written for one search a DJ types (`query`), listed in docs/content-plan.md with the
 * page that answers it; `features.test.ts` holds the plan, the limits and the links.
 */

/**
 * A page or a section that describes something the app does not ship yet (the Camelot wheel button,
 * the Keys page). It stays in the preview so the page is ready, shows a visible note, and
 * carries `data-unshipped`; a public build fails while any marker remains (scripts/check-site.mjs).
 * `step` is the phase step that ships it: remove the marker when that step is merged and the guide
 * describes the feature.
 */
export interface Unshipped {
  readonly shipped: false;
  readonly step: string;
}

export interface FeatureSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly unshipped?: Unshipped;
}

export interface FeaturePage {
  /** The page's address: /features/<slug>/. The home page's section ids match it. */
  readonly slug: string;
  /** The app's name for it. */
  readonly name: string;
  /** The one search this page answers (docs/content-plan.md). */
  readonly query: string;
  /** `<title>`, 60 characters or fewer. */
  readonly title: string;
  /** Meta description, 70 to 160 characters. */
  readonly description: string;
  /** The page's one `h1`. */
  readonly heading: string;
  /** A short line for the overview. */
  readonly summary: string;
  /** The problem in the DJ's words. */
  readonly problem: readonly string[];
  readonly how: readonly FeatureSection[];
  readonly shot: AppShotId;
  /** What it does not do. */
  readonly doesNot: readonly string[];
  /**
   * The guide page (a file of docs/user-guide without `.md`) and the words for the link. Left out while
   * the guide has no page for the feature (Keys): only an unshipped page may leave it out.
   */
  readonly guide?: { readonly page: string; readonly label: string };
  /** Set while the whole page describes a feature the app does not ship yet. */
  readonly unshipped?: Unshipped;
  /** The slugs of two related feature pages. */
  readonly related: readonly [string, string];
  /** The decisions behind lines the user guide does not describe yet. */
  readonly fromDecisions?: readonly string[];
}

export const featureHref = (slug: string): string => `features/${slug}/`;

/** The overview's own words: they claim only what ships today. */
export const OVERVIEW = {
  title: "CuePoint features for Rekordbox DJs",
  description:
    "Everything CuePoint does with your Rekordbox library: match to Beatport, fix keys and tags, find new music, plan sets, see waveforms and export.",
} as const;

/** Every unshipped page and section, for the tests and the README. */
export function unshippedMarkers(): { where: string; step: string }[] {
  return FEATURE_PAGES.flatMap((p) => [
    ...(p.unshipped ? [{ where: p.slug, step: p.unshipped.step }] : []),
    ...p.how.flatMap((h) => (h.unshipped ? [{ where: `${p.slug}: ${h.heading}`, step: h.unshipped.step }] : [])),
  ]);
}

/** The pages whose feature ships today. */
export const shippedPages = (): FeaturePage[] => FEATURE_PAGES.filter((p) => !p.unshipped);

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: "clean",
    name: "Clean",
    query: "fix Rekordbox key tags",
    title: "Fix Rekordbox key tags with Beatport | CuePoint",
    description:
      "Match your Rekordbox tracks to Beatport to fill in missing or wrong keys, tempos, genres and labels. Review matches, find duplicates and missing files.",
    heading: "Fix the keys and tags in your Rekordbox library",
    summary: "Match tracks to Beatport, fix values, find duplicates and missing files.",
    problem: [
      "Half your tracks have no key, or a key you do not trust. The genre is blank on some and wrong on others. The same song is in the collection twice, and a few files moved when you reorganized a drive.",
      "Fixing that by hand, one track at a time, is a weekend. Most DJs do not, and then dig through the wrong tracks at the gig.",
    ],
    how: [
      {
        heading: "Match to Beatport, then review",
        paragraphs: [
          "Pick a playlist, a Collection, your selection or the whole library and choose Match. CuePoint looks each track up on Beatport and keeps every candidate it found, with a score and the reason it turned down the ones it did not pick.",
          "It accepts a match on its own only when the best candidate scores 95 or more and passes every check. Everything else waits for you in the review queue, where the keyboard does the work: A accepts, R rejects, N moves on.",
        ],
      },
      {
        heading: "Key, tempo, genre, label and year",
        paragraphs: [
          "An accepted match gives the track Beatport's key. Its tempo, genre, label and year are offered next to each other, and you tick the ones you want to apply. Your own values go on top and Rekordbox's stay underneath, so any change can be taken back.",
          "Title, artist, remixer and album are never changed.",
        ],
      },
      {
        heading: "Duplicates and missing files",
        paragraphs: [
          "Clean groups tracks that may be the same recording: the same file, the same Beatport track, or the same artist, title and mix. It also lists the files that are missing or unreadable, and reports a drive that is not plugged in once, not as thousands of missing files.",
          "A Health tab counts everything that needs you, and each count opens the Library on exactly those tracks.",
        ],
      },
    ],
    shot: "clean",
    doesNot: [
      "It deletes nothing. No track, file or playlist is removed, moved or renamed. To get rid of a duplicate, remove it in Rekordbox and refresh.",
      "It does not move missing files. Rekordbox's Relocate does that, and Clean shows you which files to relocate.",
      "It does not guess. A track Beatport does not have gets no key from CuePoint, unless you type one yourself.",
      "It does not work out a key from the audio. The values come from Beatport.",
    ],
    guide: { page: "clean", label: "Read the Clean guide" },
    related: ["library", "export"],
  },
  {
    slug: "library",
    name: "The Library",
    query: "filter Rekordbox tracks by key and BPM",
    title: "Filter and sort your Rekordbox library | CuePoint",
    description:
      "Search and filter your whole Rekordbox collection by key, tempo and genre, choose your columns and see everything CuePoint knows about a track.",
    heading: "Find the right track in your whole Rekordbox collection",
    summary: "Search, filters and columns over your whole collection.",
    problem: [
      "You know the next track should be 124 to 130 BPM, in a key that fits the one that is playing. Finding it in a long Rekordbox list means scrolling and squinting.",
    ],
    how: [
      {
        heading: "Search, filter and sort everything",
        paragraphs: [
          "Import the collection you exported from Rekordbox and the Library page shows it with your playlists on the left. Type to search titles, artists, albums and labels, or add filters such as BPM between 124 and 130, genre is Techno, or a comment that contains a word. Filters stack, and the bar says how many tracks are left.",
          "Choose your columns, click a heading to sort, and click a track to see everything CuePoint knows about it in Track details on the right.",
        ],
      },
      {
        heading: "The Camelot wheel",
        unshipped: { shipped: false, step: "PAGES-10" },
        paragraphs: [
          "A button next to search, on every page, opens a wheel of the 24 keys. It lights the key of the track you selected, or the one that is playing, and the keys that mix with it: the same number one step either way, and the relative key.",
          "Click a key and the Library shows every track in that key.",
        ],
      },
      {
        heading: "Keys are Beatport's, or yours",
        paragraphs: [
          "A track's key is the one you typed, or else the key of its accepted Beatport match, shown in Camelot (8A). Rekordbox's own key is never used. A track with neither has no key, and the Library says \u201CNo Beatport key\u201D.",
        ],
      },
    ],
    shot: "library",
    doesNot: [
      "Browsing changes nothing. Files change only when you choose Write tags to files, after a preview.",
      "It does not work out a key from the audio. A track with no Beatport match and no key from you has no key.",
      "It does not use Rekordbox's key, because Rekordbox's keys might be wrong.",
    ],
    guide: { page: "library", label: "Read the Library guide" },
    related: ["clean", "discover"],
    fromDecisions: ["DEC-133", "DEC-157", "DEC-160", "DEC-201"],
  },
  {
    slug: "keys",
    name: "Keys",
    query: "keys in my Rekordbox playlist",
    title: "See the keys in your Rekordbox playlists | CuePoint",
    description:
      "Count the keys of one or several playlists, Collections or Sets on the Camelot wheel, and list the tracks in the keys you pick. Free for Rekordbox DJs.",
    heading: "See which keys your playlists hold",
    summary: "The keys of one or several playlists on the Camelot wheel, with counts.",
    problem: [
      "Before a gig you want to know what the crate is made of. Is it all 8A and 9A, or is there nothing that fits a 3B opener? Rekordbox does not count keys for you.",
    ],
    how: [
      {
        heading: "Pick the playlists, read the wheel",
        paragraphs: [
          "Keys is its own page in the sidebar. Choose the whole library, or tick several playlists, Collections and Sets. CuePoint counts each key over everything you chose and shows the counts on the Camelot wheel, darker where there are more, and as a list in Camelot order. A track in several sources is counted once.",
          "The numbers are written on the page, not only shown when you hover.",
        ],
      },
      {
        heading: "Then the tracks",
        paragraphs: [
          "Click one or more keys to list those tracks underneath. Ask for the keys that mix with 8A and the wheel lights them. Open the choice in the Library, or save it as a Smart Collection, with the playlists you ticked carried along.",
        ],
      },
      {
        heading: "Only keys CuePoint trusts",
        paragraphs: [
          "The count uses your own key for a track, or else the key of its accepted Beatport match. Tracks with neither are counted on their own line, “No Beatport key”, so you can see how much of the playlist still needs matching.",
        ],
      },
    ],
    shot: "keys",
    doesNot: [
      "It does not change your playlists or your files.",
      "It does not count Rekordbox's keys. A track with no Beatport key and none from you is listed as having no key.",
      "It does not work out a key from the audio.",
    ],
    related: ["library", "statistics"],
    unshipped: { shipped: false, step: "PAGES-16" },
    fromDecisions: ["DEC-200", "DEC-201", "DEC-206"],
  },
  {
    slug: "discover",
    name: "Discover",
    query: "find new music from artists and labels on Beatport",
    title: "Find new music from your artists and labels | CuePoint",
    description:
      "Discover looks on Beatport for new tracks from the artists and labels already in your library, hides what you own and keeps a wantlist. Free.",
    heading: "Find new music from the artists and labels you play",
    summary: "New music from Beatport for the artists and labels already in your library.",
    problem: [
      "You play the same labels for years. Keeping up with what they and your favorite artists put out means checking Beatport page after page.",
    ],
    how: [
      {
        heading: "Runs that read Beatport for you",
        paragraphs: [
          "Start a run and say what to look for: Beatport charts in the genres you choose that were made by artists in your library, and new releases on your labels from the last few days. Every artist and label in your library, only the ones you pick, or none.",
          "A run works in the background while you keep using CuePoint, and every run is kept until you delete it, so you can open last month's.",
        ],
      },
      {
        heading: "Without what you already own",
        paragraphs: [
          "Tracks your library already has are hidden, with a count of how many. A track counts as owned when one in your library has an accepted match to it in Clean.",
        ],
      },
      {
        heading: "A wantlist, a Beatport playlist, and similar tracks",
        paragraphs: [
          "Add what you want to the wantlist in CuePoint, or push it to a playlist on your Beatport account. From any track you can open its artist's or label's page, and find tracks in your own library that are similar to one you like.",
        ],
      },
    ],
    shot: "discover",
    doesNot: [
      "It does not buy, download or play Beatport tracks. They have no file in your library, so they cannot be played in CuePoint.",
      "It needs a Beatport token. Beatport does not hand tokens out from your account page; you ask Beatport for API access first, and the guide walks you through it.",
      "It does not know a track is yours until you match it in Clean. Until then Discover shows it as new.",
    ],
    guide: { page: "discover", label: "Read the Discover guide" },
    related: ["clean", "prepare"],
  },
  {
    slug: "prepare",
    name: "Prepare",
    query: "plan a DJ set before the gig",
    title: "Plan a DJ set before the gig | CuePoint",
    description:
      "Lay out a set as a running order in chapters with planned times. CuePoint checks every transition, suggests tracks for a gap and makes a set list.",
    heading: "Plan your set before you get to the booth",
    summary: "Build a Set in chapters, with times, transition checks and a set list.",
    problem: [
      "You plan a set in your head, or on a scrap of paper, and find out at the gig that two tracks clash in key or that the warm-up runs twenty minutes long.",
    ],
    how: [
      {
        heading: "A running order in chapters",
        paragraphs: [
          "A Set is a running order. Start an empty one, or copy a Collection, a Rekordbox playlist or your selection into one. Divide it into chapters such as warm-up, peak and close, and give a chapter a target length and a BPM range.",
          "Each entry can carry a planned in and out time, so the Set adds up how long it will run. It counts only the entries you timed, and says how many it did not count.",
        ],
      },
      {
        heading: "Checks that explain themselves",
        paragraphs: [
          "CuePoint checks every transition and says what it finds: a tempo jump outside the window that fits (half and double time count as fitting), a key clash with no relation on the Camelot wheel, or a track with no BPM to compare. It also flags a missing file and a chapter that runs over or under its target.",
          "A warning never stops you. Acknowledge one you have heard and know works.",
        ],
      },
      {
        heading: "Suggestions, and a set list",
        paragraphs: [
          "Choose a gap and CuePoint suggests tracks that fit between the two around it. Play the Set as the queue, then save a set list as text, CSV or M3U8, or export the Set to Rekordbox as one playlist.",
        ],
      },
    ],
    shot: "prepare",
    doesNot: [
      "It does not mix. Playing a Set plays whole tracks, one after the other. The planned times are your plan, and nothing starts, stops or crossfades at them.",
      "It does not put chapters, times or notes into Rekordbox. Rekordbox has nowhere to keep them, so an export is one ordinary playlist in your running order.",
      "A Set holds up to 1,000 entries.",
    ],
    guide: { page: "prepare", label: "Read the Prepare guide" },
    related: ["library", "waveforms"],
  },
  {
    slug: "statistics",
    name: "Statistics",
    query: "most played tracks in Rekordbox",
    title: "Most played and never played tracks | CuePoint",
    description:
      "See your most played tracks, top artists and labels, the tracks you never played, and how your library spreads by genre, key and tempo. Free.",
    heading: "See what your Rekordbox library really holds",
    summary: "Most played, never played, and how the library spreads.",
    problem: [
      "Which tracks do you really play? Which ones have sat in the library for three years without a single play? Rekordbox keeps the numbers and does not add them up for you.",
    ],
    how: [
      {
        heading: "What you play",
        paragraphs: [
          "Statistics lists your most played tracks as a top 10, 25, 50, 100 or 200, your top artists and labels by the plays of their tracks, and the tracks you have never played. The play counts are the ones Rekordbox keeps.",
          "CuePoint also remembers the counts it reads at each import and refresh, so it can show what you played since a date. That history starts at the last import before CuePoint began keeping counts, and nothing earlier can be recovered.",
        ],
      },
      {
        heading: "What the library looks like",
        paragraphs: [
          "See how your tracks spread by genre, key, tempo, year, date added, rating and loudness. The key summary counts the keys CuePoint trusts and the tracks that still have none. A health section counts missing files, tracks matched to Beatport and tracks with waveforms analyzed.",
          "Every number leads somewhere: a bar or a row opens the Library on exactly those tracks.",
        ],
      },
    ],
    shot: "statistics",
    doesNot: [
      "It does not count plays in CuePoint's own player. The plays are Rekordbox's.",
      "It looks nothing up. Every number comes from what your library already holds.",
      "It cannot show plays from before the history starts.",
    ],
    guide: { page: "statistics", label: "Read the Statistics guide" },
    related: ["library", "clean"],
    fromDecisions: ["DEC-136", "DEC-137", "DEC-138", "DEC-168", "DEC-206"],
  },
  {
    slug: "waveforms",
    name: "Waveforms and the player",
    query: "waveform and loudness of my DJ tracks",
    title: "Waveforms and loudness for your DJ tracks | CuePoint",
    description:
      "CuePoint draws a waveform for every track it can find, with your Rekordbox cues and beat grid, measures loudness, and plays music gaplessly. Free.",
    heading: "See each track's shape and loudness before you play it",
    summary: "A waveform and a loudness number for every track, and a player to try them.",
    problem: [
      "You want to see where the breakdown is and how long the intro runs, without playing the track. And you want to know whether the next one will sound louder when you bring it in.",
    ],
    how: [
      {
        heading: "A waveform for every track",
        paragraphs: [
          "CuePoint works out a waveform for every track whose file it can find, from the audio itself, in the background and at low priority. It draws it in the player bar (a click seeks), in Track details, as a Library column and in Prepare's transition strip. Choose three colored bands for the lows, mids and highs, or one color.",
          "Your Rekordbox hot cues, memory cues, loops and beat grid are drawn on it.",
        ],
      },
      {
        heading: "Loudness in LUFS",
        paragraphs: [
          "The same pass measures how loud each track is over the whole track, and its highest peak. In Prepare's transition strip the words between two tracks say how much louder or quieter the next one is.",
        ],
      },
      {
        heading: "A player that does what you ask",
        paragraphs: [
          "Double-click a track and the view you were looking at becomes the queue. Playback is gapless, out of the audio device you choose. Nothing plays until you ask.",
        ],
      },
    ],
    shot: "waveforms",
    doesNot: [
      "It does not turn a track up or down for its loudness, and does not write the number to your files or to Rekordbox.",
      "It does not edit cues or beat grids. They are Rekordbox's: move one in Rekordbox and refresh.",
      "It does not zoom or scroll. A waveform is the whole track at once.",
      "A first analysis of a big library takes hours: about 6,000 six-minute tracks an hour on a recent desktop. It can be paused, and carries on after a restart.",
      "The Linux build comes without the player.",
    ],
    guide: { page: "waveforms", label: "Read the Waveforms guide" },
    related: ["prepare", "library"],
  },
  {
    slug: "export",
    name: "Export to Rekordbox",
    query: "export edited keys back to Rekordbox XML",
    title: "Export your changes back to Rekordbox | CuePoint",
    description:
      "Write your keys, tempos, genres, labels and playlists into a new Rekordbox XML file. Cue points and beat grids are kept, and the original is untouched.",
    heading: "Send your fixes back to Rekordbox, safely",
    summary: "A new Rekordbox XML file with your values, cues and beat grids kept.",
    problem: [
      "You fixed hundreds of keys and built Collections. They are only useful if they get back into Rekordbox, without losing the cue points you spent years setting.",
    ],
    how: [
      {
        heading: "A patched copy, not a rebuild",
        paragraphs: [
          "Export takes the XML file you imported, copies it, and changes only the values you changed in CuePoint. Hot cues, memory cues, beat grids and everything else Rekordbox wrote are carried over exactly as they were.",
        ],
      },
      {
        heading: "Read the preview, then export",
        paragraphs: [
          "A preview says what will be written before anything is: where the file goes, how many tracks get your values field by field, and each playlist. It also tells you if the file you imported has changed since. The button says what it will do, for example “Export 3,880 tracks and 4 playlists”.",
          "It writes your key, tempo, genre, label, year and rating, and the Collections you tick as playlists in a folder called CuePoint. A Set you tick is one playlist in its running order, at its own folder path.",
        ],
      },
      {
        heading: "Open it in Rekordbox",
        paragraphs: [
          "Rekordbox shows the exported file as a second library, “rekordbox xml”, beside your own. Point Rekordbox at the file in its preferences and drag the playlists or tracks you want into your collection. You can write keys as Rekordbox does, or as Camelot (8A).",
        ],
      },
    ],
    shot: "export",
    doesNot: [
      "It never writes over the file you imported, and refuses it as a destination. The export is always a new file you choose.",
      "It does not write into Rekordbox's database.",
      "It does not export tags, notes or favorites. Rekordbox's XML has nowhere to put them.",
      "It does not put your audio files in the export. To put values into the files themselves, use Write tags to files, after a preview.",
    ],
    guide: { page: "rekordbox-export", label: "Read the export guide" },
    related: ["clean", "library"],
  },
];

export function featureBySlug(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}
