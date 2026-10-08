/**
 * The comparison pages (SITE-08, DEC-197): /compare/<tool>/. What each tool does next to what CuePoint
 * does, in plain facts.
 *
 * The rules (DEC-197):
 * - Every fact about another tool (`other`) links the public page it was read on and carries the date it
 *   was checked. Nothing is from memory, a review or a rumor. A fact that could not be read on the tool's
 *   own pages is left out, not guessed.
 * - No ranking, no ratings, no quotes of reviews, no price that is not on the page we link.
 * - Every page says what CuePoint does not do.
 * - What CuePoint does is held to the user guide, like every other page.
 * - The user reviews each page before launch (SITE-13).
 *
 * To re-check a page: read each `source`, fix the text if it changed, and set `checked` to today.
 * `compare.test.ts` holds the shape; the dates are the proof of when someone last looked.
 */

/** The day every fact below was last read on the tool's own page. */
export const COMPARE_CHECKED = "2026-10-08";

export interface Source {
  readonly url: string;
  /** What the page is called, as the link says it. */
  readonly label: string;
}

export interface OtherFact {
  readonly text: string;
  readonly source: Source;
  /** ISO date this fact was read on `source`. */
  readonly checked: string;
}

export interface CompareRow {
  readonly topic: string;
  readonly other: OtherFact;
  /** What CuePoint does on the same point. */
  readonly cuepoint: string;
}

export interface CompareTool {
  readonly slug: string;
  readonly name: string;
  /** Who makes it, as the tool's own page says. */
  readonly maker: string;
  /** The hostnames its facts may be linked from. */
  readonly hosts: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly heading: string;
  /** One or two sentences under the heading. */
  readonly intro: string;
  /** A line for the index. */
  readonly summary: string;
  readonly rows: readonly CompareRow[];
  /** What CuePoint does not do, that a reader of this page might expect. */
  readonly cuepointDoesNot: readonly string[];
  /** Who might prefer the other tool, said fairly. */
  readonly chooseOther: string;
  /** Who might prefer CuePoint. */
  readonly chooseCuePoint: string;
}

export const compareHref = (slug: string): string => `compare/${slug}/`;

const at = (url: string, label: string): Source => ({ url, label });
const fact = (text: string, source: Source): OtherFact => ({ text, source, checked: COMPARE_CHECKED });

const LEXICON_HOME = at("https://www.lexicondj.com/", "Lexicon's home page");
const LEXICON_PRICING = at("https://www.lexicondj.com/pricing", "Lexicon's pricing page");
const MIK_HOME = at("https://mixedinkey.com/", "Mixed In Key's home page");
const MIK_MORE = at("https://mixedinkey.com/learn-more/", "Mixed In Key 11's page");
const MIK_REKORDBOX = at("https://mixedinkey.com/integration/rekordbox-integration/", "Mixed In Key's Rekordbox page");
const MIK_WORKFLOW = at(
  "https://mixedinkey.com/workflows/use-mixed-in-key-with-rekordbox/",
  "Mixed In Key's guide to using it with Rekordbox",
);
const OKS_HOME = at("https://www.openkeyscan.com/", "OpenKeyScan's home page");
const REKORDCLOUD = at("https://rekord.cloud/", "rekordcloud's home page");

export const COMPARE_TOOLS: readonly CompareTool[] = [
  {
    slug: "lexicon",
    name: "Lexicon",
    maker: "rekordcloud",
    hosts: ["lexicondj.com", "rekord.cloud"],
    title: "CuePoint and Lexicon compared | CuePoint",
    description:
      "CuePoint and Lexicon (from rekordcloud) side by side: what each does with your DJ library, the DJ apps each works with, and what CuePoint does not do.",
    heading: "CuePoint and Lexicon (rekordcloud)",
    intro:
      "Both help you look after a DJ library. Every statement about Lexicon below comes from its own public pages, with the date we read it. What CuePoint does comes from its user guide.",
    summary: "Library management across DJ apps, next to CuePoint's Beatport matching for Rekordbox.",
    rows: [
      {
        topic: "Who makes it",
        other: fact(
          "rekordcloud's home page lists Lexicon, TrackHack, OpenKeyScan and SonoVault as its products. If you searched for rekordcloud, Lexicon is its library management suite for DJs.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint is free and open source, under the Apache 2.0 license.",
      },
      {
        topic: "What it is",
        other: fact("Lexicon's home page says: “Organize, clean and upgrade your DJ library.”", LEXICON_HOME),
        cuepoint:
          "CuePoint matches your Rekordbox tracks to Beatport, fills in keys and other values, finds duplicates and missing files, and sends the result back to Rekordbox.",
      },
      {
        topic: "Which DJ apps",
        other: fact(
          "Lexicon lists Rekordbox, Serato, Traktor, VirtualDJ, Engine DJ and djay Pro, and converts playlists, cue points and beatgrids between them.",
          LEXICON_HOME,
        ),
        cuepoint: "CuePoint works with Rekordbox only. It reads the collection you export from Rekordbox as XML.",
      },
      {
        topic: "Duplicates and missing files",
        other: fact(
          "Lexicon finds duplicate tracks, and broken or missing tracks. Its pricing page lists Find Duplicates under the Ultimate plan.",
          LEXICON_PRICING,
        ),
        cuepoint: "Clean groups possible duplicates and lists missing files, free. It never merges or deletes anything.",
      },
      {
        topic: "Missing tags and artwork",
        other: fact(
          "Lexicon finds missing tags and album art. Its pricing page lists Find Missing Tags & Album Art under the Ultimate plan.",
          LEXICON_PRICING,
        ),
        cuepoint:
          "CuePoint looks each track up on Beatport and gives it Beatport's key, and offers its tempo, genre, label and year. It reads artwork from your files and, for accepted matches, from Beatport.",
      },
      {
        topic: "Cue points",
        other: fact("Lexicon has a Generate Cue Points tool that creates cues in bulk.", LEXICON_HOME),
        cuepoint: "CuePoint does not create cue points. It keeps the cues and beat grids Rekordbox wrote exactly as they were.",
      },
      {
        topic: "Phone apps",
        other: fact("Lexicon has apps for iPhone and Android.", LEXICON_HOME),
        cuepoint: "CuePoint is a desktop app only.",
      },
      {
        topic: "Computers",
        other: fact("Lexicon says it runs on Windows and macOS.", LEXICON_HOME),
        // support-policy.md: Windows 10+ (x64), macOS 12+ on Apple Silicon (an Intel build is planned), Linux experimental
        cuepoint:
          "CuePoint runs on Windows and on Apple Silicon Macs, and there is an experimental Linux build. The Download page says what is available.",
      },
      {
        topic: "Price",
        other: fact(
          "Lexicon's pricing page shows a Free plan with library conversion, Essential from $10.49 a month or $249 for a lifetime, and Ultimate from $20.99 a month or $499 for a lifetime.",
          LEXICON_PRICING,
        ),
        cuepoint: "CuePoint is free.",
      },
    ],
    cuepointDoesNot: [
      "It does not convert a library between DJ apps. It works with Rekordbox only.",
      "It does not create cue points or set beat grids.",
      "It has no phone app and no cloud storage.",
      "It does not watch a folder for new tracks.",
    ],
    chooseOther:
      "If you use more than one DJ app, or want to move a library from one to another, Lexicon is built for that and CuePoint is not.",
    chooseCuePoint:
      "If you play from Rekordbox and want its keys and other values checked against Beatport, with every match reviewable and nothing deleted, CuePoint is built for that. You can also use both.",
  },
  {
    slug: "mixed-in-key",
    name: "Mixed In Key",
    maker: "Mixed In Key",
    hosts: ["mixedinkey.com"],
    title: "CuePoint and Mixed In Key compared | CuePoint",
    description:
      "CuePoint and Mixed In Key side by side: where each gets a track's key, what they write into Rekordbox, energy ratings, cue points, and what CuePoint lacks.",
    heading: "CuePoint and Mixed In Key",
    intro:
      "Both can give your tracks a key you can mix by. Every statement about Mixed In Key below comes from its own public pages, with the date we read it. What CuePoint does comes from its user guide.",
    summary: "Key and energy analysis from the audio, next to keys from Beatport matches.",
    rows: [
      {
        topic: "What it is",
        other: fact(
          "Mixed In Key's home page describes Mixed In Key as: “Discover the key and BPM of any track to create harmonically perfect DJ sets.”",
          MIK_HOME,
        ),
        cuepoint:
          "CuePoint matches your tracks to Beatport and fills in what is missing or wrong, then sends it back to Rekordbox.",
      },
      {
        topic: "Where the key comes from",
        other: fact(
          "Mixed In Key 11 says to “Analyze your music collection”. It calls its key detection “the world's most precise key-detection technology.”",
          MIK_MORE,
        ),
        cuepoint:
          "CuePoint does not work out a key from the audio. A track's key is the one you typed, or the key of its accepted Beatport match. A track Beatport does not have has no key until you give it one.",
      },
      {
        topic: "Energy",
        other: fact(
          "Mixed In Key's home page says its Energy Level ratings “show you how danceable each track is.”",
          MIK_HOME,
        ),
        cuepoint: "CuePoint has no energy rating.",
      },
      {
        topic: "Cue points",
        other: fact(
          "Mixed In Key 11 says it “will give you up to 8 automatic Cue Points per track.”",
          MIK_MORE,
        ),
        cuepoint: "CuePoint does not create cue points. It keeps the ones Rekordbox has.",
      },
      {
        topic: "How its results get into Rekordbox",
        other: fact(
          "Mixed In Key's Rekordbox page says to analyze your files in Mixed In Key, add them to Rekordbox, then reload their tags, and that Key and Energy results are updated.",
          MIK_REKORDBOX,
        ),
        cuepoint:
          "CuePoint writes a new Rekordbox XML file for you to open in Rekordbox, with your cues and beat grids kept. It can also write tags into your files, after a preview. Rekordbox shows those after you choose Reload Tag.",
      },
      {
        topic: "Cue points in Rekordbox",
        other: fact(
          "Mixed In Key's guide says cue points are not part of reloading tags: “Cue Points require the Rekordbox XML import workflow.”",
          MIK_WORKFLOW,
        ),
        cuepoint:
          "CuePoint's export is a patched copy of the XML you imported, so the cues and beat grids Rekordbox wrote are carried over exactly as they were.",
      },
      {
        topic: "Where the results show in Rekordbox",
        other: fact(
          "By default Mixed In Key's key results go to Rekordbox's Key column and its Comments column. You can change this in its Update Tags settings.",
          MIK_REKORDBOX,
        ),
        cuepoint: "CuePoint's export writes the key into the key field of the new XML file, in the notation you choose.",
      },
      {
        topic: "Camelot notation",
        other: fact("Mixed In Key's home page lists a Camelot Wheel for harmonic mixing.", MIK_HOME),
        cuepoint:
          "CuePoint shows a track's key in Camelot notation, such as 8A, and says “No Beatport key” when a track has none. Rekordbox's own key is shown as not used.",
      },
      {
        topic: "Price",
        other: fact(
          "Mixed In Key 11 is sold as a one-time purchase. The pages we read show no amount; its shop has the price.",
          MIK_MORE,
        ),
        cuepoint: "CuePoint is free.",
      },
    ],
    cuepointDoesNot: [
      "It does not work out a key from the audio. It cannot key a track Beatport does not have.",
      "It does not rate a track's energy.",
      "It does not create cue points.",
      "It has no tools for making music or mashups.",
    ],
    chooseOther:
      "If your tracks are not on Beatport, or you want a key worked out from the sound itself, plus energy ratings and automatic cue points, Mixed In Key does that and CuePoint does not.",
    chooseCuePoint:
      "If your tracks are on Beatport and you want Beatport's key, tempo, genre, label and year checked against Rekordbox with every match reviewable, CuePoint does that for free. The two do not conflict, so you can use both.",
  },
  {
    slug: "openkeyscan",
    name: "OpenKeyScan",
    maker: "rekordcloud",
    hosts: ["openkeyscan.com", "rekord.cloud"],
    title: "CuePoint and OpenKeyScan compared | CuePoint",
    description:
      "CuePoint and rekordcloud's OpenKeyScan side by side: how each gets a track's key, where it works offline, what it writes, and what CuePoint does not do.",
    heading: "CuePoint and OpenKeyScan (rekordcloud)",
    intro:
      "Both can give a track a key. Every statement about OpenKeyScan below comes from its own public pages or its maker's, with the date we read it. What CuePoint does comes from its user guide.",
    summary: "A free key detector that listens to the audio, next to keys from Beatport.",
    rows: [
      {
        topic: "Who makes it",
        other: fact(
          "rekordcloud's home page lists OpenKeyScan, with Lexicon, TrackHack and SonoVault, among its products, and calls OpenKeyScan a free, open-source desktop app.",
          REKORDCLOUD,
        ),
        cuepoint: "CuePoint is free and open source, under the Apache 2.0 license.",
      },
      {
        topic: "What it is",
        other: fact("OpenKeyScan's page describes it as “a free, open-source key detector.”", OKS_HOME),
        cuepoint:
          "CuePoint is a free, open-source desktop app that does more than keys: it matches tracks to Beatport, finds duplicates and missing files, discovers new music and plans sets.",
      },
      {
        topic: "Where the key comes from",
        other: fact(
          "OpenKeyScan says it turns the audio into a spectrogram and uses a neural network to recognize harmonic patterns in it.",
          OKS_HOME,
        ),
        cuepoint:
          "CuePoint does not work out a key from the audio. It takes the key from the accepted Beatport match, or from you.",
      },
      {
        topic: "Offline",
        other: fact("OpenKeyScan says it runs “completely offline on your machine.”", OKS_HOME),
        cuepoint:
          "Your library stays on your computer. CuePoint goes online to read Beatport (matching, artwork, Discover) and, unless you turn it off, to send error reports.",
      },
      {
        topic: "What it writes",
        other: fact(
          "rekordcloud says OpenKeyScan “writes results directly into your files for Rekordbox, Serato and Traktor.”",
          REKORDCLOUD,
        ),
        cuepoint:
          "CuePoint writes into your files only when you choose Write tags to files, after a preview, with a record that lets every file be restored. Its export to Rekordbox is a new XML file.",
      },
      {
        topic: "Price",
        other: fact("OpenKeyScan says it is “100% free, forever.”", OKS_HOME),
        cuepoint: "CuePoint is free.",
      },
    ],
    cuepointDoesNot: [
      "It does not work out a key from the audio. A track Beatport does not have gets no key from CuePoint.",
      "It does not work offline for matching. Looking tracks up on Beatport needs a connection.",
      "It works with Rekordbox only, not Serato or Traktor.",
    ],
    chooseOther:
      "If you want a key worked out from the sound of a track and written into the file for Rekordbox, Serato and Traktor, OpenKeyScan is made for that, and it runs offline.",
    chooseCuePoint:
      "If you want Beatport's key and metadata checked against your Rekordbox library, with everything reviewable, CuePoint is made for that. For a track Beatport does not have, you can type the key yourself.",
  },
];

export function compareBySlug(slug: string): CompareTool | undefined {
  return COMPARE_TOOLS.find((t) => t.slug === slug);
}
