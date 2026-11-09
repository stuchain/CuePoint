// The five showcase films, scene by scene (lengths in beats of each film's track). pro.js draws them.
const BY = "Designed and built by Stelios Vasileiou";
const PITCH = "A desktop app that gets a DJ's Rekordbox library ready for the booth.";
const FREE = "Free for Windows, macOS and Linux.";

const LAUNCH = [
  ["library", "01 · Search", "Your whole library, instantly searchable."],
  ["player", "02 · Play", "A real player with waveforms."],
  ["clean", "03 · Match", "Every track checked on Beatport."],
  ["discover", "04 · Dig", "New releases from artists you play."],
  ["prepare", "05 · Plan", "Sets planned by key and energy."],
  ["keys", "06 · Mix", "The key wheel finds what mixes."],
  ["statistics", "07 · Know", "Your library at a glance."],
  ["save", "08 · Tag", "Clean tags, written to your files."],
  ["export", "09 · Export", "Straight back into Rekordbox."],
  ["settings", "10 · Yours", "Themes and sizes, your way."],
];
const STEPS = [
  ["library", "Open", "Read your Rekordbox library."],
  ["clean", "Match", "Check every track on Beatport."],
  ["prepare", "Plan", "Plan the set by key and energy."],
  ["save", "Tag", "Write clean tags to the files."],
  ["export", "Export", "Send it all back to Rekordbox."],
];

/**
 * The showcase's own framing: Know lands on the Files and Beatport counts of the Health tab; Tag lands on the ticked
 * tags as Sync is pressed, then holds on "Synced 30 files".
 */
const SHOWCASE_FRAME = {
  statistics: { focus: [340, 400], z: 2 },
  save: { from: 3.6, clipRate: 1.2, focus: [480, 400], z: 2 },
};

const BUILT = [
  { type: "diagram", beats: 12, head: "A desktop app over a local engine.", step: 0.45 },
  {
    type: "stats", beats: 12, label: "Built to be trusted", step: 1.5,
    rows: [
      { big: "20,000+", to: 20000, text: "automated tests, Python and TypeScript" },
      { big: "3 systems", text: "Windows, macOS and Linux, all tested in CI" },
      { big: "Backed up", text: "before any change to your library or files" },
      { big: "Open source", text: "Apache 2.0, on GitHub" },
    ],
  },
  { type: "end", beats: 8, line: FREE, git: true },
];

export const FILMS = {
  /**
   * The showcase: the opening of "why" (first person, now with the digging), the ten features of "launch" with the
   * window raised under its headline, and the ending of "builder", at the launch film's pace. Underscore from 40.82 s
   * (the beat returns on the first feature), lengthened by joining its groove from 19.22 s on at 86.42 s.
   */
  showcase: {
    bpm: 100,
    poster: 28,
    topY: 150,
    winY: 440,
    scenes: [
      {
        type: "statement", beats: 16, bg: "wipe-library-before", one: true, morph: true,
        lines: [
          { text: "Before every set, I spent hours fixing my Rekordbox library and digging for new tracks." },
          { text: "Missing keys. Wrong versions. Half-done tags. Endless digging.", cls: "muted", at: 6 },
          { text: "So I built the tool I wanted.", at: 11.5 },
        ],
      },
      ...LAUNCH.map(([feature, label, head], i) => ({ type: "feature", beats: 8, feature, label, head, dots: [i + 1, 10], rate: 1.2, fit: true, morphed: i === 0, ...SHOWCASE_FRAME[feature] })),
      ...BUILT,
    ],
  },
  /** 1 · Product launch: a title, the ten features one headline each, the end card. Underscore from 45.62 s. */
  launch: {
    bpm: 100,
    poster: 20.4,
    scenes: [
      { type: "title", beats: 8, line: PITCH, by: BY },
      ...LAUNCH.map(([feature, label, head], i) => ({ type: "feature", beats: 6, feature, label, head, dots: [i + 1, 10], rate: 1.2 })),
      { type: "end", beats: 8, line: FREE, git: true },
    ],
  },
  /** 2 · Case study: the problem, five steps in order, the same library after. Technology from 72.53 s. */
  case: {
    bpm: 125,
    poster: 9.5,
    scenes: [
      { type: "statement", beats: 6, bg: "wipe-library-before", lines: [{ text: "Before every gig," }, { text: "the library needs work.", cls: "muted", at: 1.5 }] },
      { type: "still", beats: 6, still: "wipe-library", label: "Before", head: "Keys missing. Tracks never matched.", focus: [900, 330], z: 2.4, zoomAt: 2.5 },
      ...STEPS.map(([feature, word, head], i) => ({ type: "feature", beats: 8, feature, label: `Step ${i + 1} of 5 · ${word}`, head, dots: [i + 1, 5], zoomAt: 4, rate: 1.2 })),
      { type: "wipe", beats: 10, still: "wipe-library", label: "After", head: "Same library, ready for the booth.", focus: [900, 330], z: 2.4, zoomAt: 6, wipeAt: 1, wipeBeats: 4 },
      { type: "end", beats: 8, line: FREE, git: true },
    ],
  },
  /** 3 · Builder's showcase: the product in five moments, how it is built, the numbers. Technology from 72.53 s. */
  builder: {
    bpm: 125,
    poster: 22,
    scenes: [
      { type: "title", beats: 12, line: PITCH, by: BY },
      ...[
        ["clean", "Match", "Matches every track on Beatport."],
        ["prepare", "Plan", "Plans sets by key and energy."],
        ["discover", "Dig", "Digs new releases from your artists."],
        ["keys", "Mix", "Finds what mixes on the key wheel."],
        ["export", "Export", "Writes it all back to Rekordbox."],
      ].map(([feature, word, head]) => ({ type: "feature", beats: 6, feature, label: `The product · ${word}`, head, rate: 1.4 })),
      { type: "diagram", beats: 16, head: "A desktop app over a local engine." },
      {
        type: "stats", beats: 12, label: "Built to be trusted",
        rows: [
          { big: "20,000+", to: 20000, text: "automated tests, Python and TypeScript" },
          { big: "3 systems", text: "Windows, macOS and Linux, all tested in CI" },
          { big: "Backed up", text: "before any change to your library or files" },
          { big: "Open source", text: "Apache 2.0, on GitHub" },
        ],
      },
      { type: "end", beats: 8, line: FREE, git: true, by: BY },
    ],
  },
  /** 4 · A DJ's evening in one take: real speed, full frame, documentary lower-thirds. Underscore from 45.62 s. */
  evening: {
    bpm: 100,
    poster: 17,
    scenes: [
      { type: "statement", beats: 8, lines: [{ text: "One evening before a gig." }, { text: "One app.", cls: "muted", at: 2.5 }] },
      ...[
        ["library", "21:04", "Find tonight's tracks.", 4.5],
        ["player", "21:09", "Listen through the waveforms.", 1.5],
        ["clean", "21:15", "Check every match on Beatport.", 14.0],
        ["discover", "21:28", "Dig what's new from your artists.", 5.0],
        ["prepare", "21:41", "Plan the set by key and energy.", 3.0],
        ["keys", "21:52", "Find what mixes next.", 1.0],
        ["save", "22:03", "Write clean tags to the files.", 2.5],
        ["export", "22:10", "Back into Rekordbox. Ready.", 1.2],
      ].map(([feature, time, head, from]) => ({ type: "doc", beats: 8, feature, time, head, from })),
      { type: "end", beats: 8, line: FREE },
    ],
  },
  /** 5 · Why I built it: first-person lines, then what it does in his words. Underscore from 40.82 s. */
  why: {
    bpm: 100,
    poster: 12,
    scenes: [
      {
        type: "statement", beats: 16, bg: "wipe-library-before",
        lines: [
          { text: "Before every set, I spent hours fixing my Rekordbox library." },
          { text: "Missing keys. Wrong versions. Half-done tags.", cls: "muted", at: 6 },
          { text: "So I built the tool I wanted.", at: 11 },
        ],
      },
      ...[
        ["clean", "It checks every track on Beatport."],
        ["prepare", "It plans my sets by key and energy."],
        ["discover", "It finds new music from artists I already play."],
        ["export", "And it writes everything back to Rekordbox."],
      ].map(([feature, head]) => ({ type: "feature", beats: 6, feature, label: "CuePoint", head, rate: 1.2 })),
      { type: "statement", beats: 6, lines: [{ text: "It's free and open source, for every DJ." }, { text: "Stelios Vasileiou", cls: "sign", at: 2 }] },
      { type: "end", beats: 8, line: FREE, git: true },
    ],
  },
};
