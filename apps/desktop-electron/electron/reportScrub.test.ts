import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  OUTPUT_TAIL_ATTACHMENTS,
  scrubAttachment,
  scrubEvent,
  scrubText,
  type ScrubContext,
} from "./reportScrub";

/**
 * The TypeScript scrubber against the shared corpus and its property test (REPORT-02, DEC-127).
 *
 * `src/tests/unit/reporting/test_scrub.py` reads the same fixture files; the two scrubbers must
 * give the same output on every entry.
 */

interface RawContext {
  home: string | null;
  user_name: string | null;
  app_roots: string[];
  tokens: string[];
}
interface CorpusEntry {
  name: string;
  ctx: RawContext;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}

const FIXTURES = fileURLToPath(new URL("../../../src/tests/fixtures/reporting/", import.meta.url));

function load(name: string): CorpusEntry[] {
  const file = FIXTURES + name;
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf-8")) as CorpusEntry[]) : [];
}

function toContext(raw: RawContext): ScrubContext {
  return { home: raw.home, userName: raw.user_name, appRoots: raw.app_roots, tokens: raw.tokens };
}

const corpus = load("scrub_corpus.json");
// Part B's raise-site entries join the run as soon as their file exists.
const entries = [...corpus, ...load("raise_site_events.json")];

describe("scrub corpus", () => {
  it("is not empty", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(50);
  });

  it.each(entries.map((e) => [e.name, e] as const))("%s", (_name, entry) => {
    const original = structuredClone(entry.input);
    expect(scrubEvent(entry.input, toContext(entry.ctx))).toEqual(entry.expected);
    expect(entry.input).toEqual(original);
  });
});

describe("scrub helpers", () => {
  const ctx: ScrubContext = { home: "/Users/anna", userName: "anna", appRoots: [], tokens: [] };

  it("scrubs text by the message rule", () => {
    expect(scrubText("Cannot open '/Users/anna/a.flac'", ctx)).toBe("Cannot open '<home>/<file>.flac'");
    expect(scrubText("Track 'Strobe' failed", ctx)).toBe("Track '<value>' failed");
  });

  it("keeps only the output tails, line by line", () => {
    expect([...OUTPUT_TAIL_ATTACHMENTS]).toEqual(["engine-output.txt", "player-output.txt"]);
    const text = "start /Users/anna/Music/a.flac\nBearer abc.def\r\nplayed 'Strobe'";
    for (const name of OUTPUT_TAIL_ATTACHMENTS) {
      expect(scrubAttachment(name, text, ctx)).toBe(
        "start <home>/<dir>/<file>.flac\nBearer <token>\r\nplayed '<value>'",
      );
    }
    expect(scrubAttachment("config.json", "{}", ctx)).toBeNull();
    expect(scrubAttachment("engine-output.txt.bak", text, ctx)).toBeNull();
  });

  it("scrubs tokens and quotes with an empty context", () => {
    const empty: ScrubContext = { home: null, userName: null, appRoots: [], tokens: [] };
    expect(scrubText("a 'b' token=zzz", empty)).toBe("a '<value>' token=<token>");
  });
});

// A seeded generator, so a failure repeats. No dependency: mulberry32.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = ["anna", "dj_mike", "Joel", "samuel99", "mar\u00eda"];
const WORDS = [
  "Strobe",
  "Don't Stop",
  "Caf\u00e9 del Mar",
  "\u591c\u306e\u97f3\u697d",
  "Rock 'n Roll",
  "DJ's Choice",
  "Friday Night Mix",
  "mau5trap",
  "Resident Advisor",
  "Closer \u2014 Extended",
  "Nu Disco 2024",
  "O'Brien's Waltz",
  "Lovin' You (Ol' Skool Mix)",
  "Rock 'n' Roll",
];
const SUFFIXES = ["", " Remix", " (Club Mix)"];
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-_";

interface Scenario {
  user: string;
  home: string;
  values: string[];
  token: string;
}

function scenario(rand: () => number): Scenario {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const user = pick(USERS);
  const home = pick([`C:\\Users\\${user}`, `/Users/${user}`, `/home/${user}`, `D:/Users/${user}`]);
  let values = [0, 1, 2, 3].map(() => pick(WORDS) + pick(SUFFIXES));
  // A library value never contains the user's name, so "no user name left" is checkable.
  values = values.filter((v) => !v.toLowerCase().includes(user.toLowerCase()));
  if (values.length === 0) values = ["Strobe"];
  const length = 12 + Math.floor(rand() * 29);
  let token = "tk";
  for (let i = 0; i < length; i++) token += TOKEN_ALPHABET[Math.floor(rand() * TOKEN_ALPHABET.length)];
  return { user, home, values, token };
}

/** Quote as Python's repr does: double quotes when the value holds an apostrophe. */
function q(value: string): string {
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

function buildEvent(s: Scenario): Record<string, unknown> {
  const sep = s.home.includes("\\") ? "\\" : "/";
  const [title, artist, label, playlist] = [0, 1, 2, 3].map((i) => s.values[i % s.values.length]);
  const path = `${s.home}${sep}Music${sep}House${sep}2024${sep}track.flac`;
  const quotedPath = q(`${s.home}${sep}Music${sep}${playlist}${sep}${title}.flac`);
  return {
    message: `Track ${q(title)} by \u201c${artist}\u201d not in ${q(playlist)} at ${path} for ${s.user} token=${s.token}`,
    logentry: { message: "bad %s at %s", formatted: `bad ${title} at ${path}`, params: [title, path] },
    exception: {
      values: [
        {
          type: "ValueError",
          value: `label ${q(label)} missing in ${quotedPath}; Bearer ${s.token}`,
          stacktrace: {
            frames: [
              { filename: "x.py", abs_path: path, vars: { title, home: s.home, user: s.user } },
            ],
          },
        },
      ],
    },
    extra: {
      track_title: title,
      playlistName: playlist,
      track: { artist, label, n: 3 },
      note: `${title} - ${artist}`,
      where: quotedPath,
      session: s.token,
    },
    contexts: { job: { playlist, file: path }, device: { name: s.user } },
    breadcrumbs: [
      { category: "log", message: `opened ${q(title)} from ${path}`, data: { artist, path } },
      { category: "ui.click", message: `${title} ${artist}` },
    ],
    server_name: `${s.user}-laptop`,
    user: { username: s.user },
    tags: { where: path, playlist },
  };
}

describe("scrub property", () => {
  it("leaves nothing personal in any generated event", () => {
    const rand = prng(20261007);
    for (let n = 0; n < 300; n++) {
      const s = scenario(rand);
      const ctx: ScrubContext = { home: s.home, userName: s.user, appRoots: [], tokens: [s.token] };
      const event = buildEvent(s);
      const before = structuredClone(event);
      const out = JSON.stringify(scrubEvent(event, ctx));
      expect(event).toEqual(before);
      const haystack = out.toLowerCase();
      const hint = JSON.stringify(s);
      expect(haystack.includes(s.user.toLowerCase()), hint).toBe(false);
      expect(haystack.includes(s.home.toLowerCase()), hint).toBe(false);
      expect(haystack.includes(s.home.replaceAll("\\", "\\\\").toLowerCase()), hint).toBe(false);
      expect(out.includes(s.token), hint).toBe(false);
      for (const value of s.values) {
        if (value.length >= 3) expect(haystack.includes(value.toLowerCase()), hint + value).toBe(false);
        // Every word of a value is gone too, not only the whole value.
        for (const word of value.toLowerCase().split(/[^\p{L}\p{N}_]+/u)) {
          if (word.length < 3) continue;
          const found = new RegExp(`(?<![\\p{L}\\p{N}_])${word}(?![\\p{L}\\p{N}_])`, "u").test(haystack);
          expect(found, hint + word).toBe(false);
        }
      }
    }
  });
});

describe("scrub review fixes", () => {
  const pathological = [
    "'a ".repeat(33_000),
    "'a' ".repeat(25_000),
    '"'.repeat(100_000),
    "\u2018a ".repeat(33_000),
    "a".repeat(100_000),
    "/a".repeat(50_000),
    "\\".repeat(100_000),
    "token=".repeat(17_000),
    "%2F".repeat(33_000),
    "eyJ".repeat(33_000),
    "<home>/a ".repeat(9_000),
    "anna ".repeat(20_000),
  ];

  it.each(pathological.map((text, i) => [`input-${i}`, text] as const))(
    "scrubs a 100 KB pathological input in linear time: %s",
    (_name, text) => {
      const ctx: ScrubContext = { home: "/Users/anna", userName: "anna", appRoots: [], tokens: ["tokentoken"] };
      const started = performance.now();
      scrubText(text, ctx);
      expect(performance.now() - started).toBeLessThan(1000);
    },
  );

  it("leaves nothing of a home folder with a space", () => {
    const ctx: ScrubContext = { home: "C:\\Users\\Anna Smith", userName: "Anna", appRoots: [], tokens: [] };
    for (const text of [
      "open C:\\Users\\Anna Smith\\Music\\Daft Punk\\x.flac",
      "open c:/users/ANNA SMITH/Music/x.flac",
      "'C:\\Users\\Anna Smith\\Music\\x.flac' failed",
    ]) {
      const out = scrubText(text, ctx).toLowerCase();
      expect(out).not.toContain("smith");
      expect(out).not.toContain("anna");
    }
  });
});
