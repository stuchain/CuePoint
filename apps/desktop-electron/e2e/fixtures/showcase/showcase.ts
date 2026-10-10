/**
 * A made-up DJ library for the website's pictures (SITE-04).
 *
 * `buildShowcase()` invents about 300 tracks (artists, titles, labels, keys,
 * tempos by genre, years, ratings, play counts, comments, lengths, a beat grid
 * and two to four cues each) and nine playlists a DJ would keep, from one seed,
 * so the same library comes out every time. Nothing in it is real:
 * `showcase.test.ts` holds every name against `real-names.json`.
 *
 * `writeShowcase()` writes it to disk at capture time: the Rekordbox XML, one
 * short generated WAV per track (so the waveforms draw, each a different
 * picture), and a Beatport fixture (`beatport-fixture.json`, pages and covers;
 * the format is `src/cuepoint/data/beatport_fixture.py`'s) that lets the app
 * match one playlist for real. The rest of the matches are seeded straight into
 * the app's database by `seedPlan()` and `SEED_MATCHES_PY`, the way
 * `e2e/camelotWheel.spec.ts` does, since a track's key is its accepted match's
 * (DEC-201). None of it is committed; `e2e/capture/showcase.spec.ts` builds it
 * into a folder and deletes it after the pictures are taken.
 */
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

export const SHOWCASE_SEED = 20261009;

// ---------------------------------------------------------------------------
// The random source: mulberry32, small and the same on every machine.

type Rng = () => number;

function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
const between = (r: Rng, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
const chance = (r: Rng, p: number): boolean => r() < p;
const weighted = <T extends { weight: number }>(r: Rng, items: readonly T[]): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let at = r() * total;
  for (const item of items) {
    at -= item.weight;
    if (at <= 0) return item;
  }
  return items[items.length - 1]!;
};

// ---------------------------------------------------------------------------
// The musical facts.

/** Camelot code -> Beatport's spelling and Rekordbox's. */
export const KEYS: readonly { camelot: string; beatport: string; rekordbox: string }[] = [
  { camelot: "1A", beatport: "Ab Minor", rekordbox: "Abm" },
  { camelot: "2A", beatport: "Eb Minor", rekordbox: "Ebm" },
  { camelot: "3A", beatport: "Bb Minor", rekordbox: "Bbm" },
  { camelot: "4A", beatport: "F Minor", rekordbox: "Fm" },
  { camelot: "5A", beatport: "C Minor", rekordbox: "Cm" },
  { camelot: "6A", beatport: "G Minor", rekordbox: "Gm" },
  { camelot: "7A", beatport: "D Minor", rekordbox: "Dm" },
  { camelot: "8A", beatport: "A Minor", rekordbox: "Am" },
  { camelot: "9A", beatport: "E Minor", rekordbox: "Em" },
  { camelot: "10A", beatport: "B Minor", rekordbox: "Bm" },
  { camelot: "11A", beatport: "F# Minor", rekordbox: "F#m" },
  { camelot: "12A", beatport: "Db Minor", rekordbox: "Dbm" },
  { camelot: "1B", beatport: "B Major", rekordbox: "B" },
  { camelot: "2B", beatport: "F# Major", rekordbox: "F#" },
  { camelot: "3B", beatport: "Db Major", rekordbox: "Db" },
  { camelot: "4B", beatport: "Ab Major", rekordbox: "Ab" },
  { camelot: "5B", beatport: "Eb Major", rekordbox: "Eb" },
  { camelot: "6B", beatport: "Bb Major", rekordbox: "Bb" },
  { camelot: "7B", beatport: "F Major", rekordbox: "F" },
  { camelot: "8B", beatport: "C Major", rekordbox: "C" },
  { camelot: "9B", beatport: "G Major", rekordbox: "G" },
  { camelot: "10B", beatport: "D Major", rekordbox: "D" },
  { camelot: "11B", beatport: "A Major", rekordbox: "A" },
  { camelot: "12B", beatport: "E Major", rekordbox: "E" },
];

interface Genre {
  name: string;
  bpm: [number, number];
  length: [number, number];
  weight: number;
  beatportId: number;
}

const GENRES: readonly Genre[] = [
  { name: "House", bpm: [122, 126], length: [360, 450], weight: 5, beatportId: 5 },
  { name: "Tech House", bpm: [124, 129], length: [330, 420], weight: 4, beatportId: 11 },
  { name: "Melodic House & Techno", bpm: [120, 125], length: [390, 480], weight: 4, beatportId: 90 },
  { name: "Techno (Peak Time / Driving)", bpm: [128, 136], length: [330, 420], weight: 3, beatportId: 6 },
  { name: "Deep House", bpm: [118, 123], length: [360, 450], weight: 3, beatportId: 12 },
  { name: "Progressive House", bpm: [122, 128], length: [390, 480], weight: 2, beatportId: 15 },
  { name: "Minimal / Deep Tech", bpm: [125, 130], length: [360, 450], weight: 2, beatportId: 14 },
  { name: "Afro House", bpm: [118, 124], length: [360, 450], weight: 2, beatportId: 89 },
  { name: "Drum & Bass", bpm: [170, 176], length: [270, 360], weight: 2, beatportId: 1 },
  { name: "Breaks", bpm: [128, 136], length: [300, 390], weight: 1, beatportId: 9 },
  { name: "Trance", bpm: [134, 140], length: [390, 480], weight: 1, beatportId: 7 },
  { name: "Indie Dance", bpm: [112, 122], length: [300, 390], weight: 1, beatportId: 37 },
];

/** Invented performers. None is a real act; the test holds them against real-names.json. */
const ARTISTS: readonly string[] = [
  "Marlo Vance", "Ines Quill", "Saltwater Choir", "Dorian Pell", "Kessa Nyx", "Twelve Lanterns",
  "Oona Vesper", "Halden Rey", "Low Harbor Club", "Tobias Ferrand", "Amsel", "Pavo Rael",
  "Nadir Okafor", "Lumen Sisters", "Rook & Tallow", "Esme Calloway", "Sable Traffic", "Kito Varela",
  "Hollow Meridian", "Delphi Marr", "Ivo Castellan", "Nocturne Union", "Tamsin Vale", "Ferris Low",
  "Anouk Dreyer", "Rhodes & Wren", "Silo Nine", "Yara Sotelo", "Caspian Hale", "Milla Oberon",
  "Linden Fray", "Orsolya Pike", "Cordova Drift", "Eben Vosk", "Bryn Satter", "Astrid Mallory",
  "Kaelo", "Quillmoor", "Ren Okabe", "The Paper Tides", "Faux Aurora", "Madsen & Ro", "Vesna Kord",
  "Half Moon Tenants", "Lucan Avery", "Idris Fenn", "Noor Alvez", "Sibel Kuray", "Oskar Lindh",
  "Petra Solano", "Vireo", "Jonas Ferrell", "Calla Rune", "Mireille Dax", "Tarquin Ashby",
  "Ludo Breckner", "Ayla Voss", "Benedikt Haro", "Cosima Lark", "Theron Blake", "Zadie Ferro",
  "Elias Marchetti", "Fenna Ruys", "Gideon Pask", "Harriet Cole", "Ilse Varden", "Joss Kemble",
];

/** Invented labels, each with a home genre. */
const LABELS: readonly { name: string; genre: string }[] = [
  { name: "Nightfall Audio", genre: "House" },
  { name: "Tideline Records", genre: "Deep House" },
  { name: "Harbor Street", genre: "House" },
  { name: "Monochrome Hours", genre: "Techno (Peak Time / Driving)" },
  { name: "Low Orbit Music", genre: "Melodic House & Techno" },
  { name: "Ninefold", genre: "Techno (Peak Time / Driving)" },
  { name: "Blue Cinder", genre: "Tech House" },
  { name: "Paper Moon Trax", genre: "Tech House" },
  { name: "Saltmarsh", genre: "Afro House" },
  { name: "Static Garden", genre: "Minimal / Deep Tech" },
  { name: "Late Shift Union", genre: "Tech House" },
  { name: "Kelvin Audio", genre: "Melodic House & Techno" },
  { name: "Deep Crescent", genre: "Deep House" },
  { name: "Northline Records", genre: "Progressive House" },
  { name: "Soft Signal", genre: "Indie Dance" },
  { name: "Umbra Trax", genre: "Techno (Peak Time / Driving)" },
  { name: "Red Lantern Music", genre: "Afro House" },
  { name: "Cobalt & Co.", genre: "Breaks" },
  { name: "Vellmark Records", genre: "Melodic House & Techno" },
  { name: "Pale Fire Recordings", genre: "Progressive House" },
  { name: "Bellwether Music", genre: "Trance" },
  { name: "Sunder", genre: "Drum & Bass" },
  { name: "Driftwood Audio", genre: "Drum & Bass" },
  { name: "Lighthouse Nine", genre: "House" },
  { name: "Glasshouse Tapes", genre: "Indie Dance" },
  { name: "Faraday Recordings", genre: "Minimal / Deep Tech" },
  { name: "Quarterlight", genre: "Melodic House & Techno" },
  { name: "Inland Sea", genre: "Deep House" },
];

const TITLE_FIRST = [
  "Glass", "Velvet", "Low", "Night", "Hollow", "Amber", "Silver", "Northern", "Slow", "Paper", "Blue",
  "Quiet", "Electric", "Last", "First", "Open", "Broken", "Golden", "Distant", "Deep", "Lunar", "Salt",
  "Winter", "Summer", "Static", "Hidden", "Second", "Marble", "Cold", "Violet", "Iron", "Early",
];
const TITLE_SECOND = [
  "Meridian", "Harbor", "Horizon", "Signal", "Tide", "Lantern", "Current", "Orbit", "Window", "Cathedral",
  "Garden", "Satellite", "Monsoon", "Pulse", "Corridor", "Mirror", "Compass", "Island", "Voltage",
  "Season", "Parade", "Theatre", "Lagoon", "Delta", "Frequency", "Weekend", "Pattern", "Daylight",
  "Afterglow", "Reverie", "Interlude", "Drift", "Echoes", "Shelter", "Motion", "Halo", "Morning", "Rush",
  "Return", "Arcade", "Causeway", "Ember", "Meadow",
];

const COMMENTS = [
  "opener", "big drop at 2:40", "vocal, mix out early", "closing track", "works after the breakdown",
  "peak time only", "long intro, cue at 0:32", "pairs with Low Harbor", "needs a re-edit", "sunset",
  "crowd favourite", "loop the break", "intro has no kick", "play from hot cue B", "ends cold",
];

// ---------------------------------------------------------------------------
// The library.

export interface Cue {
  /** Rekordbox's Num: -1 a memory cue, 0-7 hot cues A-H. */
  num: number;
  start: number;
  name: string;
  colour?: [number, number, number];
}

export interface ShowcaseTrack {
  /** The TrackID in the XML; the app gives it its own id on import. */
  id: number;
  title: string;
  /** The title without its mix: what the search carries and the Beatport page is named. */
  baseTitle: string;
  mix: string;
  artist: string;
  remixer: string;
  label: string;
  genre: string;
  /** Camelot, the one the whole library agrees on. */
  camelot: string;
  /** Rekordbox's own key, right most of the time and never used (DEC-201). */
  tonality: string;
  bpm: number;
  year: number;
  rating: number;
  playCount: number;
  comment: string;
  durationSeconds: number;
  dateAdded: string;
  gridStart: number;
  cues: Cue[];
  /** The WAV's name under the music folder. */
  file: string;
  /** How long the generated audio is; one track is as long as it says it is. */
  audioSeconds: number;
  audioSeed: number;
}

export interface ShowcasePlaylist {
  name: string;
  trackIds: number[];
}

export interface Showcase {
  tracks: ShowcaseTrack[];
  playlists: ShowcasePlaylist[];
  /** The playlist left unmatched for the app to match through the Beatport fixture. */
  livePlaylist: string;
  /** The track the player plays in the pictures: its audio is full length. */
  playedTrackId: number;
  /** The Beatport covers the fixture serves, by number. */
  covers: number;
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function beatsToSeconds(bpm: number, beats: number): number {
  return (60 / bpm) * beats;
}

const HOT_CUE_COLOURS: readonly [number, number, number][] = [
  [40, 226, 20],
  [48, 90, 255],
  [255, 140, 0],
  [222, 68, 207],
];

function makeCues(r: Rng, bpm: number, gridStart: number, duration: number): Cue[] {
  const cues: Cue[] = [{ num: -1, start: gridStart, name: "" }];
  const introBars = pick(r, [8, 16, 16, 32]);
  cues.push({ num: 0, start: gridStart + beatsToSeconds(bpm, introBars * 4), name: "Intro end", colour: HOT_CUE_COLOURS[0] });
  const count = between(r, 2, 4);
  if (count >= 3) {
    const dropBars = introBars + pick(r, [16, 32]);
    cues.push({ num: 1, start: gridStart + beatsToSeconds(bpm, dropBars * 4), name: "Drop", colour: HOT_CUE_COLOURS[1] });
  }
  if (count >= 4) {
    const outro = Math.max(duration - beatsToSeconds(bpm, 32 * 4), 90);
    cues.push({ num: 2, start: Math.round(outro * 1000) / 1000, name: "Outro", colour: HOT_CUE_COLOURS[2] });
  }
  return cues.filter((cue) => cue.start < duration);
}

function isoDate(r: Rng, fromYear: number, toYear: number): string {
  const year = between(r, fromYear, toYear);
  const month = between(r, 1, year === 2026 ? 9 : 12);
  const day = between(r, 1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildShowcase(seed: number = SHOWCASE_SEED): Showcase {
  const r = rng(seed);
  const artistGenre = new Map<string, string>();
  for (const artist of ARTISTS) artistGenre.set(artist, weighted(r, GENRES).name);
  const byGenre = (genre: string) => LABELS.filter((l) => l.genre === genre);

  const titles = new Set<string>();
  const tracks: ShowcaseTrack[] = [];
  const count = 300;
  for (let id = 1; id <= count; id += 1) {
    const artist = pick(r, ARTISTS);
    const genre = chance(r, 0.8) ? GENRES.find((g) => g.name === artistGenre.get(artist))! : weighted(r, GENRES);
    const labels = byGenre(genre.name);
    const label = labels.length && chance(r, 0.85) ? pick(r, labels).name : pick(r, LABELS).name;
    let baseTitle: string;
    do baseTitle = `${pick(r, TITLE_FIRST)} ${pick(r, TITLE_SECOND)}`;
    while (titles.has(baseTitle));
    titles.add(baseTitle);
    const mixRoll = r();
    let mix = "";
    let remixer = "";
    if (mixRoll < 0.25) mix = "Original Mix";
    else if (mixRoll < 0.37) mix = "Extended Mix";
    else if (mixRoll < 0.45) {
      remixer = pick(r, ARTISTS.filter((a) => a !== artist));
      mix = `${remixer} Remix`;
    }
    const title = mix ? `${baseTitle} (${mix})` : baseTitle;
    const key = pick(r, KEYS);
    // Rekordbox disagrees with Beatport one time in six, which is why it is not used.
    const tonality = chance(r, 1 / 6) ? pick(r, KEYS).rekordbox : key.rekordbox;
    const bpm = between(r, genre.bpm[0], genre.bpm[1]);
    const durationSeconds = between(r, genre.length[0], genre.length[1]);
    const gridStart = Math.round((0.05 + r() * 0.5) * 1000) / 1000;
    const ratingRoll = r();
    const rating = ratingRoll < 0.3 ? 0 : ratingRoll < 0.35 ? 2 : ratingRoll < 0.55 ? 3 : ratingRoll < 0.85 ? 4 : 5;
    const playCount = chance(r, 0.25) ? 0 : Math.floor(r() * r() * 60);
    tracks.push({
      id,
      title,
      baseTitle,
      mix,
      artist,
      remixer,
      label,
      genre: genre.name,
      camelot: key.camelot,
      tonality,
      bpm,
      year: between(r, 2015, 2026),
      rating,
      playCount,
      comment: chance(r, 0.35) ? pick(r, COMMENTS) : "",
      durationSeconds,
      dateAdded: isoDate(r, 2019, 2026),
      gridStart,
      cues: makeCues(r, bpm, gridStart, durationSeconds),
      file: `${artist} - ${title}.wav`.replace(/[\\/:*?"<>|]/g, "-"),
      audioSeconds: between(r, 20, 32),
      audioSeed: Math.floor(r() * 1e9),
    });
  }

  const ids = (filter: (t: ShowcaseTrack) => boolean, max: number): number[] => {
    const found = tracks.filter(filter).map((t) => t.id);
    // a stable shuffle from the seed, then the first `max`
    for (let i = found.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [found[i], found[j]] = [found[j]!, found[i]!];
    }
    return found.slice(0, max).sort((a, b) => a - b);
  };
  const genreIn = (...names: string[]) => (t: ShowcaseTrack) => names.includes(t.genre);
  const playlists: ShowcasePlaylist[] = [
    { name: "Friday warm-up", trackIds: ids(genreIn("Deep House", "Melodic House & Techno", "Afro House"), 32) },
    { name: "Peak time", trackIds: ids(genreIn("Techno (Peak Time / Driving)", "Tech House"), 36) },
    { name: "Sunset", trackIds: ids(genreIn("Melodic House & Techno", "Indie Dance", "Deep House"), 28) },
    { name: "Closing", trackIds: ids((t) => t.bpm <= 124 && t.genre !== "Drum & Bass", 20) },
    { name: "New this month", trackIds: ids((t) => t.dateAdded >= "2026-08-01", 18) },
    { name: "Drum & bass", trackIds: ids(genreIn("Drum & Bass"), 24) },
    { name: "Rooftop", trackIds: ids(genreIn("House", "Afro House", "Tech House"), 30) },
    { name: "Festival set", trackIds: ids(genreIn("Techno (Peak Time / Driving)", "Progressive House", "Trance"), 26) },
  ];
  // The live playlist: tracks no other playlist holds, so the seeded matches never touch it.
  const inOthers = new Set(playlists.flatMap((p) => p.trackIds));
  const live = ids((t) => !inOthers.has(t.id) && t.genre !== "Drum & Bass", 18);
  playlists.push({ name: "Fresh picks", trackIds: live });

  // The track that plays: a warm-up track with a four-cue grid, as long as it says.
  const played = tracks.find((t) => playlists[0]!.trackIds.includes(t.id) && t.cues.length === 4) ?? tracks[playlists[0]!.trackIds[0]! - 1]!;
  played.audioSeconds = played.durationSeconds;

  return { tracks, playlists, livePlaylist: "Fresh picks", playedTrackId: played.id, covers: 12 };
}

// ---------------------------------------------------------------------------
// The Rekordbox XML.

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A Rekordbox Location: `file://localhost/` and the path, URL-encoded, no leading slash. */
export function rekordboxLocation(file: string): string {
  const posix = file.replace(/\\/g, "/").replace(/^\/+/, "");
  return "file://localhost/" + posix.split("/").map((part) => encodeURIComponent(part).replace(/%3A/g, ":")).join("/");
}

export function rekordboxXml(showcase: Showcase, musicDir: string): string {
  const rows = showcase.tracks.map((t) => {
    const attrs = [
      `TrackID="${t.id}"`,
      `Name="${escapeXml(t.title)}"`,
      `Artist="${escapeXml(t.artist)}"`,
      `Composer=""`,
      `Album="${escapeXml(t.baseTitle)}"`,
      `Grouping=""`,
      `Genre="${escapeXml(t.genre)}"`,
      `Kind="WAV File"`,
      `Size="${t.audioSeconds * 16_000 * 2 + 44}"`,
      `TotalTime="${t.durationSeconds}"`,
      `DiscNumber="0"`,
      `TrackNumber="0"`,
      `Year="${t.year}"`,
      `AverageBpm="${t.bpm.toFixed(2)}"`,
      `DateAdded="${t.dateAdded}"`,
      `BitRate="1411"`,
      `SampleRate="44100"`,
      `Comments="${escapeXml(t.comment)}"`,
      `PlayCount="${t.playCount}"`,
      `Rating="${t.rating * 51}"`,
      `Location="${escapeXml(rekordboxLocation(path.join(musicDir, t.file)))}"`,
      `Remixer="${escapeXml(t.remixer)}"`,
      `Tonality="${t.tonality}"`,
      `Label="${escapeXml(t.label)}"`,
      `Mix="${escapeXml(t.mix)}"`,
    ].join(" ");
    const tempo = `      <TEMPO Inizio="${t.gridStart.toFixed(3)}" Bpm="${t.bpm.toFixed(2)}" Metro="4/4" Battito="1"/>`;
    const marks = t.cues.map((cue) => {
      const colour = cue.colour ? ` Red="${cue.colour[0]}" Green="${cue.colour[1]}" Blue="${cue.colour[2]}"` : "";
      return `      <POSITION_MARK Name="${escapeXml(cue.name)}" Type="0" Start="${cue.start.toFixed(3)}" Num="${cue.num}"${colour}/>`;
    });
    return `    <TRACK ${attrs}>\n${tempo}\n${marks.join("\n")}\n    </TRACK>`;
  });
  const nodes = showcase.playlists.map(
    (p) =>
      `      <NODE Name="${escapeXml(p.name)}" Type="1" KeyType="0" Entries="${p.trackIds.length}">\n` +
      p.trackIds.map((id) => `        <TRACK Key="${id}"/>`).join("\n") +
      `\n      </NODE>`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<DJ_PLAYLISTS Version="1.0.0">\n` +
    `  <PRODUCT Name="rekordbox" Version="7.1.3" Company="AlphaTheta"/>\n` +
    `  <COLLECTION Entries="${showcase.tracks.length}">\n${rows.join("\n")}\n  </COLLECTION>\n` +
    `  <PLAYLISTS>\n    <NODE Type="0" Name="ROOT" Count="${nodes.length}">\n${nodes.join("\n")}\n    </NODE>\n  </PLAYLISTS>\n` +
    `</DJ_PLAYLISTS>\n`
  );
}

// ---------------------------------------------------------------------------
// The audio: a short tune per track, different each time, so the waveforms differ.

export interface WavSpec {
  seed: number;
  seconds: number;
  bpm: number;
}

const WAV_RATE = 16_000;

/**
 * Mono 16-bit PCM at 16 kHz: a kick on every beat, a bass note, hats off the
 * beat and a pad, under an envelope with an intro, a build, a drop and a break
 * whose lengths the seed decides. Small enough that 300 of them are a few
 * hundred megabytes, and shaped enough to look like music when drawn.
 */
export function writeWav(file: string, spec: WavSpec): void {
  const r = rng(spec.seed);
  const frames = Math.round(WAV_RATE * spec.seconds);
  const data = Buffer.alloc(frames * 2);
  const beat = 60 / spec.bpm;
  const bassHz = pick(r, [41.2, 43.65, 49, 55, 61.74, 65.41]);
  const padHz = bassHz * pick(r, [4, 6, 8]);
  const hatLevel = 0.1 + r() * 0.2;
  const kickLevel = 0.5 + r() * 0.4;
  // the sections, as fractions of the whole: intro, build, drop, break, drop
  const cut1 = 0.1 + r() * 0.15;
  const cut2 = cut1 + 0.1 + r() * 0.15;
  const cut3 = cut2 + 0.2 + r() * 0.2;
  const cut4 = cut3 + 0.08 + r() * 0.12;
  const envelope = (at: number): number => {
    if (at < cut1) return 0.25 + (at / cut1) * 0.2;
    if (at < cut2) return 0.45 + ((at - cut1) / (cut2 - cut1)) * 0.45;
    if (at < cut3) return 0.95;
    if (at < cut4) return 0.3;
    return 0.9 - Math.max(0, (at - 0.92) / 0.08) * 0.7;
  };
  for (let i = 0; i < frames; i += 1) {
    const t = i / WAV_RATE;
    const at = i / frames;
    const inBeat = t % beat;
    const kick = Math.sin(2 * Math.PI * (55 + 120 * Math.exp(-inBeat * 30)) * inBeat) * Math.exp(-inBeat * 12);
    const hat = (r() * 2 - 1) * Math.exp(-((inBeat + beat / 2) % beat) * 40);
    const bass = Math.sin(2 * Math.PI * bassHz * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * t / (beat * 8)));
    const pad = Math.sin(2 * Math.PI * padHz * t) * 0.15 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / (beat * 16)));
    const env = envelope(at);
    const drop = at >= cut2 && at < cut3 || at >= cut4;
    const mix = (drop ? kick * kickLevel : kick * kickLevel * 0.3) + hat * hatLevel + bass * 0.35 * env + pad * env;
    const sample = Math.max(-1, Math.min(1, mix * env * 0.9));
    data.writeInt16LE(Math.round(sample * 32_767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(WAV_RATE, 24);
  header.writeUInt32LE(WAV_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

// ---------------------------------------------------------------------------
// A cover, as a PNG, with no image library: blocks of two colours from the seed.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A 240 x 240 RGB PNG: a coloured field, a band and a square, from the seed. */
export function coverPng(seed: number): Buffer {
  const r = rng(seed);
  const size = 240;
  const palette: [number, number, number][] = [
    [Math.floor(r() * 120), Math.floor(r() * 80), Math.floor(60 + r() * 120)],
    [Math.floor(140 + r() * 115), Math.floor(60 + r() * 140), Math.floor(r() * 120)],
    [Math.floor(200 + r() * 55), Math.floor(200 + r() * 55), Math.floor(180 + r() * 75)],
  ];
  const bandTop = Math.floor(size * (0.3 + r() * 0.4));
  const bandHeight = Math.floor(size * (0.05 + r() * 0.15));
  const squareAt = Math.floor(size * (0.1 + r() * 0.5));
  const squareSize = Math.floor(size * (0.15 + r() * 0.2));
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      let colour = palette[0]!;
      if (y >= bandTop && y < bandTop + bandHeight) colour = palette[1]!;
      if (x >= squareAt && x < squareAt + squareSize && y >= squareAt && y < squareAt + squareSize) colour = palette[2]!;
      const at = y * (size * 3 + 1) + 1 + x * 3;
      raw[at] = colour[0];
      raw[at + 1] = colour[1];
      raw[at + 2] = colour[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const coverUrl = (n: number, size: number): string =>
  `https://geo-media.beatport.com/image_size/${size}x${size}/showcase-${String(n).padStart(2, "0")}.jpg`;

// ---------------------------------------------------------------------------
// The matches: most seeded into the database, one playlist matched for real.

export interface SeedCandidate {
  title: string;
  artists: string;
  label: string;
  genre: string;
  key: string;
  bpm: number;
  releaseName: string;
  releaseYear: number;
  artworkUrl: string;
  beatportId: string;
  url: string;
  score: number;
}

export interface SeedPlan {
  accepted: (SeedCandidate & { trackId: number; trackTitle: string; decidedAt: string })[];
  review: { trackId: number; trackTitle: string; decidedAt: string; candidates: SeedCandidate[] }[];
  noMatch: { trackId: number; trackTitle: string; decidedAt: string }[];
}

const beatportUrl = (id: number, title: string): string => `https://www.beatport.com/track/${slug(title)}/${id}`;

function candidateFor(t: ShowcaseTrack, variant: { title?: string; artists?: string; key?: string; bpm?: number; score: number; idOffset: number }, covers: number): SeedCandidate {
  const title = variant.title ?? t.title;
  const beatportId = 18_000_000 + t.id * 10 + variant.idOffset;
  return {
    title,
    artists: variant.artists ?? t.artist,
    label: t.label,
    genre: t.genre,
    key: variant.key ?? KEYS.find((k) => k.camelot === t.camelot)!.beatport,
    bpm: variant.bpm ?? t.bpm,
    releaseName: t.baseTitle,
    releaseYear: t.year,
    artworkUrl: coverUrl(((t.id + variant.idOffset) % covers) + 1, 500),
    beatportId: String(beatportId),
    url: beatportUrl(beatportId, title),
    score: variant.score,
  };
}

/** What the matcher would have decided for every track outside the live playlist. */
export function seedPlan(showcase: Showcase): SeedPlan {
  const r = rng(SHOWCASE_SEED + 1);
  const live = new Set(showcase.playlists.find((p) => p.name === showcase.livePlaylist)!.trackIds);
  const plan: SeedPlan = { accepted: [], review: [], noMatch: [] };
  for (const t of showcase.tracks) {
    if (live.has(t.id)) continue;
    const roll = r();
    const decidedAt = `2026-10-0${between(r, 1, 8)}T${String(between(r, 9, 23)).padStart(2, "0")}:${String(between(r, 0, 59)).padStart(2, "0")}:00`;
    if (roll < 0.82) {
      plan.accepted.push({ trackId: t.id, trackTitle: t.title, decidedAt, ...candidateFor(t, { score: between(r, 95, 99), idOffset: 1 }, showcase.covers) });
    } else if (roll < 0.91) {
      const otherKey = pick(r, KEYS.filter((k) => k.camelot !== t.camelot)).beatport;
      plan.review.push({
        trackId: t.id,
        trackTitle: t.title,
        decidedAt,
        candidates: [
          candidateFor(t, { title: `${t.baseTitle} (${t.mix && t.mix !== "Original Mix" ? "Original Mix" : "Extended Mix"})`, score: between(r, 86, 94), idOffset: 2 }, showcase.covers),
          candidateFor(t, { title: `${t.baseTitle} (${pick(r, ARTISTS.filter((a) => a !== t.artist))} Remix)`, key: otherKey, bpm: t.bpm + pick(r, [-2, -1, 1, 2]), score: between(r, 74, 85), idOffset: 3 }, showcase.covers),
        ],
      });
    } else if (roll < 0.96) {
      plan.noMatch.push({ trackId: t.id, trackTitle: t.title, decidedAt });
    }
    // the rest were never matched
  }
  return plan;
}

/**
 * Store the plan the way the matcher would have (the rows `match_attempts`,
 * `match_candidates` and `track_match` hold), through the app's own database.
 * Run with CUEPOINT_HOME pointing at the app's home and the plan's file as the argument.
 */
export const SEED_MATCHES_PY = `
import json, sys
from cuepoint.services import interfaces
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container

bootstrap_services()
container = get_container()
tracks = container.resolve(interfaces.ITrackRepository)
database = container.resolve(interfaces.IDatabaseService)
with open(sys.argv[1], encoding="utf-8") as handle:
    plan = json.load(handle)
by_title = {t.title: t.id for t in tracks.list_all()}

CANDIDATE_SQL = (
    "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id, url, title, artists, label,"
    " genre, key, bpm, release_name, release_year, artwork_url, score, base_score, title_sim,"
    " artist_sim, guard_ok, is_winner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
)

def attempt(conn, track_id, outcome, score, when):
    return conn.execute(
        "INSERT INTO match_attempts (track_id, started_at, finished_at, outcome, score, input_json,"
        " matcher_version) VALUES (?, ?, ?, ?, ?, '{}', 'showcase')",
        (track_id, when, when, outcome, score),
    ).lastrowid

def candidate(conn, attempt_id, rank, c, winner):
    return conn.execute(
        CANDIDATE_SQL,
        (attempt_id, rank, c["beatportId"], c["url"], c["title"], c["artists"], c["label"], c["genre"],
         c["key"], c["bpm"], c["releaseName"], c["releaseYear"], c["artworkUrl"], c["score"], c["score"] - 2,
         min(100, c["score"] + 1), 100 if rank == 0 else 70, 1 if winner else 0),
    ).lastrowid

def decide(conn, track_id, state, attempt_id, candidate_id, score, when):
    conn.execute(
        "INSERT OR REPLACE INTO track_match (track_id, state, decided_by, attempt_id, candidate_id,"
        " decided_at, candidate_score) VALUES (?, ?, 'auto', ?, ?, ?, ?)",
        (track_id, state, attempt_id, candidate_id, when, score),
    )

with database.transaction(join_existing=True) as conn:
    for row in plan["accepted"]:
        track_id = by_title[row["trackTitle"]]
        a = attempt(conn, track_id, "matched", row["score"], row["decidedAt"])
        c = candidate(conn, a, 0, row, True)
        conn.execute("UPDATE match_attempts SET best_candidate_id = ? WHERE id = ?", (c, a))
        decide(conn, track_id, "accepted", a, c, row["score"], row["decidedAt"])
    for row in plan["review"]:
        track_id = by_title[row["trackTitle"]]
        best = row["candidates"][0]
        a = attempt(conn, track_id, "matched", best["score"], row["decidedAt"])
        ids = [candidate(conn, a, rank, c, rank == 0) for rank, c in enumerate(row["candidates"])]
        conn.execute("UPDATE match_attempts SET best_candidate_id = ? WHERE id = ?", (ids[0], a))
        decide(conn, track_id, "needs_review", a, ids[0], best["score"], row["decidedAt"])
    for row in plan["noMatch"]:
        track_id = by_title[row["trackTitle"]]
        a = attempt(conn, track_id, "no_match", None, row["decidedAt"])
        decide(conn, track_id, "no_match", a, None, None, row["decidedAt"])
print("seeded", len(plan["accepted"]), "accepted,", len(plan["review"]), "to review,", len(plan["noMatch"]), "without a match")
`;

// ---------------------------------------------------------------------------
// The Beatport fixture: pages for the live playlist, covers, and Discover's catalog.

export interface BeatportFixtureJson {
  searches: { contains: string; urls: string[] }[];
  pages: Record<string, string>;
  images: Record<string, string>;
  api: { method?: string; path: string; params?: Record<string, unknown>; delay_ms?: number; body: any }[];
}

export interface BeatportFixture {
  json: BeatportFixtureJson;
  /** Page files, by the relative path the JSON names, with their HTML. */
  pages: Record<string, string>;
  /** Cover files, by relative path, with their PNG bytes. */
  covers: Record<string, Buffer>;
}

function trackPage(t: ShowcaseTrack, c: SeedCandidate, cover: number): string {
  const ld = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: c.title,
    byArtist: { "@type": "MusicGroup", name: c.artists },
    inAlbum: { "@type": "MusicAlbum", name: c.releaseName },
    datePublished: `${c.releaseYear}-06-14`,
  };
  const genreId = GENRES.find((g) => g.name === t.genre)?.beatportId ?? 5;
  const labelId = LABELS.findIndex((l) => l.name === c.label) + 40_300;
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n` +
    `  <title>${escapeXml(c.title)} by ${escapeXml(c.artists)} on Beatport</title>\n` +
    `  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n` +
    `  <meta property="og:image" content="${coverUrl(cover, 1400)}" />\n</head>\n<body>\n` +
    `  <h1>${escapeXml(c.title)}</h1>\n` +
    `  <div><span>Key</span><span>${c.key}</span></div>\n` +
    `  <div><span>BPM</span><span>${c.bpm}</span></div>\n` +
    `  <div><span>Released</span><span>${c.releaseYear}-06-14</span></div>\n` +
    `  <a href="/label/${slug(c.label)}/${labelId}">${escapeXml(c.label)}</a>\n` +
    `  <a href="/genre/${slug(c.genre)}/${genreId}">${escapeXml(c.genre)}</a>\n` +
    `  <a href="/release/${slug(c.releaseName)}/${c.beatportId}0">${escapeXml(c.releaseName)}</a>\n` +
    `</body>\n</html>\n`
  );
}

export function beatportFixture(showcase: Showcase): BeatportFixture {
  const r = rng(SHOWCASE_SEED + 2);
  const liveIds = showcase.playlists.find((p) => p.name === showcase.livePlaylist)!.trackIds;
  const live = liveIds.map((id) => showcase.tracks[id - 1]!);
  const json: BeatportFixtureJson = { searches: [], pages: {}, images: {}, api: [] };
  const pages: Record<string, string> = {};
  const covers: Record<string, Buffer> = {};

  for (let n = 1; n <= showcase.covers; n += 1) {
    const file = `covers/showcase-${String(n).padStart(2, "0")}.png`;
    covers[file] = coverPng(SHOWCASE_SEED + 100 + n);
    for (const size of [500, 1400]) json.images[coverUrl(n, size)] = file;
  }

  const addPage = (t: ShowcaseTrack, c: SeedCandidate): string => {
    const file = `pages/${c.beatportId}.html`;
    json.pages[c.url] = file;
    pages[file] = trackPage(t, c, (t.id % showcase.covers) + 1);
    return c.url;
  };

  live.forEach((t, index) => {
    // the last one finds nothing; four are close but not exact; the rest are the track itself
    if (index === live.length - 1) return;
    const review = index >= live.length - 5;
    const urls: string[] = [];
    if (review) {
      urls.push(addPage(t, candidateFor(t, { title: `${t.baseTitle} (${t.mix && t.mix !== "Original Mix" ? "Original Mix" : "Club Mix"})`, score: 0, idOffset: 2 }, showcase.covers)));
      urls.push(addPage(t, candidateFor(t, { title: `${t.baseTitle} (${pick(r, ARTISTS.filter((a) => a !== t.artist))} Remix)`, key: pick(r, KEYS).beatport, score: 0, idOffset: 3 }, showcase.covers)));
    } else {
      urls.push(addPage(t, candidateFor(t, { score: 0, idOffset: 1 }, showcase.covers)));
    }
    json.searches.push({ contains: t.baseTitle.toLowerCase(), urls });
  });

  // Discover: the genres, one chart by one of the library's artists, and its tracks.
  const house = GENRES[0]!;
  const chartArtist = pick(r, ARTISTS);
  const chartId = 880_201;
  json.api.push({
    path: "catalog/genres",
    body: { count: GENRES.length, next: null, page: "1/1", per_page: 100, results: GENRES.map((g) => ({ id: g.beatportId, name: g.name, slug: slug(g.name) })) },
  });
  json.api.push({
    path: "catalog/charts",
    params: { genre_id: house.beatportId, page: 1 },
    body: {
      count: 1,
      next: null,
      page: "1/1",
      per_page: 100,
      results: [
        {
          id: chartId,
          name: `${chartArtist} Selects`,
          slug: slug(`${chartArtist} Selects`),
          artist: { id: 301_201, name: chartArtist, slug: slug(chartArtist) },
          person: { id: 77_201, owner_name: chartArtist, owner_type: "artist" },
          genres: [{ id: house.beatportId, name: house.name, slug: slug(house.name) }],
          track_count: 6,
        },
      ],
    },
  });
  const chartTracks = Array.from({ length: 6 }, (_, i) => {
    const title = `${pick(r, TITLE_FIRST)} ${pick(r, TITLE_SECOND)}`;
    const artist = i === 0 ? chartArtist : pick(r, ARTISTS);
    const label = pick(r, LABELS.filter((l) => l.genre === "House" || l.genre === "Deep House" || l.genre === "Afro House"));
    const key = pick(r, KEYS);
    const date = `{{today-${3 + i * 4}}}`;
    return {
      id: 19_000_201 + i,
      name: title,
      mix_name: pick(r, ["Original Mix", "Extended Mix", "Original Mix"]),
      slug: slug(title),
      key: { id: KEYS.indexOf(key) + 1, name: key.beatport },
      bpm: between(r, 120, 126),
      artists: [{ id: 301_300 + i, name: artist, slug: slug(artist) }],
      remixers: [],
      genre: { id: house.beatportId, name: house.name, slug: slug(house.name) },
      release: { id: 4_500_201 + i, name: `${title} EP`, slug: slug(`${title} EP`), label: { id: 40_300 + LABELS.indexOf(label), name: label.name, slug: slug(label.name) } },
      new_release_date: date,
      publish_date: date,
    };
  });
  json.api.push({
    path: `catalog/charts/${chartId}/tracks`,
    params: { page: 1 },
    body: { count: chartTracks.length, next: null, page: "1/1", per_page: 100, results: chartTracks },
  });

  return { json, pages, covers };
}

// ---------------------------------------------------------------------------
// Writing it all.

export interface Written {
  /** The Rekordbox XML, beside the music. */
  xml: string;
  /** The folder the WAVs are in. */
  music: string;
  /** The Beatport fixture's JSON; its pages and covers are beside it. */
  beatportFixture: string;
  /** The seed plan, as JSON for SEED_MATCHES_PY. */
  seedPlan: string;
  /** Every file written, for `removeWritten`. */
  files: string[];
  /** The folders made for them, deepest first; the ones that were there already are not listed. */
  dirs: string[];
}

export interface WriteOptions {
  /** Every track's audio this long, for a quick test; by default each track has its own length. */
  audioSeconds?: number;
}

/**
 * Write the library under `root`: `root/Music/*.wav` and `root/Music/rekordbox.xml`
 * (the paths a DJ's export would show), `root/beatport/` for the fixture, and
 * `root/seed-plan.json`.
 */
export function writeShowcase(root: string, showcase: Showcase, options: WriteOptions = {}): Written {
  const music = path.join(root, "Music");
  const beatport = path.join(root, "beatport");
  const dirs: string[] = [];
  const files: string[] = [];
  const makeDir = (dir: string) => {
    if (existsSync(dir)) return;
    makeDir(path.dirname(dir));
    mkdirSync(dir);
    dirs.unshift(dir);
  };
  const write = (file: string, content: string | Buffer) => {
    writeFileSync(file, content);
    files.push(file);
  };
  makeDir(music);
  makeDir(path.join(beatport, "pages"));
  makeDir(path.join(beatport, "covers"));
  for (const t of showcase.tracks) {
    const file = path.join(music, t.file);
    writeWav(file, { seed: t.audioSeed, seconds: options.audioSeconds ?? t.audioSeconds, bpm: t.bpm });
    files.push(file);
  }
  const xml = path.join(music, "rekordbox.xml");
  write(xml, rekordboxXml(showcase, music));
  const fixture = beatportFixture(showcase);
  for (const [file, html] of Object.entries(fixture.pages)) write(path.join(beatport, file), html);
  for (const [file, png] of Object.entries(fixture.covers)) write(path.join(beatport, file), png);
  const fixtureJson = path.join(beatport, "beatport-fixture.json");
  write(fixtureJson, JSON.stringify(fixture.json, null, 2));
  const plan = path.join(root, "seed-plan.json");
  write(plan, JSON.stringify(seedPlan(showcase)));
  return { xml, music, beatportFixture: fixtureJson, seedPlan: plan, files, dirs };
}

/**
 * Take the library away again: only the files `writeShowcase` wrote, then the
 * folders it made, each only once it is empty. Anything else under the root,
 * and a root that was there before, stays.
 */
export function removeWritten(written: Written): void {
  for (const file of written.files) if (existsSync(file)) unlinkSync(file);
  for (const dir of written.dirs) {
    try {
      rmdirSync(dir);
    } catch {
      // not empty, or already gone: leave it
    }
  }
}
