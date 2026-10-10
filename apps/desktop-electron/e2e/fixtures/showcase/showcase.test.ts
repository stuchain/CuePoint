/**
 * The made-up library the website's pictures are taken from (SITE-04).
 *
 * About 300 tracks, every one with a key, a tempo and a file; playlists that
 * point at tracks that exist; no name that is a real artist's or label's; and
 * the same library every time, so the pictures can be retaken and compared.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import realNames from "./real-names.json";
import {
  beatportFixture,
  buildShowcase,
  rekordboxXml,
  removeWritten,
  seedPlan,
  writeShowcase,
  writeWav,
  type Showcase,
} from "./showcase";

const here = path.dirname(fileURLToPath(import.meta.url));

const REAL = new Set([...realNames.artists, ...realNames.labels].map((n) => n.toLowerCase()));
const REAL_TITLES = new Set(realNames.titles.map((n) => n.toLowerCase()));

/** A title without its mix: "Glass Tide (Extended Mix)" -> "glass tide". */
function baseTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function trackElements(xml: string): string[] {
  const collection = /<COLLECTION[^>]*>([\s\S]*?)<\/COLLECTION>/.exec(xml)![1]!;
  return collection.match(/<TRACK\b[^>]*>/g) ?? [];
}

function attr(element: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(element)?.[1];
}

describe("the showcase library", () => {
  const showcase: Showcase = buildShowcase();

  it("holds about 300 tracks in about 8 playlists", () => {
    expect(showcase.tracks.length).toBeGreaterThanOrEqual(280);
    expect(showcase.tracks.length).toBeLessThanOrEqual(320);
    expect(showcase.playlists.length).toBeGreaterThanOrEqual(7);
    expect(showcase.playlists.length).toBeLessThanOrEqual(10);
  });

  it("names nothing real: no artist, label or title is a well-known one", () => {
    expect(REAL.size).toBeGreaterThan(100);
    for (const track of showcase.tracks) {
      for (const name of [track.artist, track.label, track.title]) {
        const lower = name.toLowerCase();
        expect(REAL.has(lower), `${name} is a real name`).toBe(false);
        for (const real of REAL) {
          // a real name inside an invented one ("Drumcode Nights") is still the real name
          if (real.length >= 5) expect(lower.includes(real), `${name} contains ${real}`).toBe(false);
        }
      }
    }
    // the Beatport side invents its own names too
    const fixture = beatportFixture(showcase);
    for (const page of Object.values(fixture.pages)) {
      for (const real of REAL) if (real.length >= 5) expect(page.toLowerCase().includes(real), `a page names ${real}`).toBe(false);
    }
  });

  it("titles no track after a well-known song", () => {
    expect(REAL_TITLES.size).toBeGreaterThan(40);
    const titles = showcase.tracks.map((t) => t.title);
    // Discover's chart and the pages Clean compares against carry titles of their own
    const fixture = beatportFixture(showcase);
    for (const match of JSON.stringify(fixture.json.api).matchAll(/"name":"([^"]*)"/g)) titles.push(match[1]!);
    for (const page of Object.values(fixture.pages)) titles.push(/<h1>([^<]*)<\/h1>/.exec(page)![1]!);
    expect(titles.length).toBeGreaterThan(showcase.tracks.length);
    for (const title of titles) expect(REAL_TITLES.has(baseTitle(title)), `${title} is a well-known song`).toBe(false);
  });

  it("gives every track a key, a tempo, a length and a file, in the XML Rekordbox would write", () => {
    const xml = rekordboxXml(showcase, "/Users/dj/Music");
    const elements = trackElements(xml);
    expect(elements.length).toBe(showcase.tracks.length);
    for (const element of elements) {
      expect(attr(element, "Tonality")).toMatch(/^[A-G][#b]?m?$/);
      expect(Number(attr(element, "AverageBpm"))).toBeGreaterThan(100);
      expect(Number(attr(element, "TotalTime"))).toBeGreaterThan(120);
      expect(attr(element, "Location")).toMatch(/^file:\/\/localhost\/Users\/dj\/Music\/.+\.wav$/);
      expect(attr(element, "Name")).toBeTruthy();
      expect(attr(element, "Artist")).toBeTruthy();
      expect(attr(element, "Label")).toBeTruthy();
      expect(attr(element, "Genre")).toBeTruthy();
      expect(Number(attr(element, "Year"))).toBeGreaterThan(2000);
      expect(["0", "51", "102", "153", "204", "255"]).toContain(attr(element, "Rating"));
    }
    // every track has a beat grid and two to four cues
    const bodies = xml.split(/<TRACK\b(?=[^>]*TrackID)/).slice(1);
    for (const body of bodies) {
      expect((body.match(/<TEMPO\b/g) ?? []).length).toBe(1);
      const cues = (body.match(/<POSITION_MARK\b/g) ?? []).length;
      expect(cues).toBeGreaterThanOrEqual(2);
      expect(cues).toBeLessThanOrEqual(4);
    }
  });

  it("points every playlist at tracks that exist, with names a DJ would use", () => {
    const ids = new Set(showcase.tracks.map((t) => t.id));
    for (const playlist of showcase.playlists) {
      expect(playlist.trackIds.length).toBeGreaterThan(5);
      for (const id of playlist.trackIds) expect(ids.has(id), `${playlist.name} -> ${id}`).toBe(true);
      expect(new Set(playlist.trackIds).size).toBe(playlist.trackIds.length);
      expect(playlist.name).toMatch(/^[A-Z]/);
    }
    const xml = rekordboxXml(showcase, "/Users/dj/Music");
    for (const playlist of showcase.playlists) expect(xml).toContain(`Name="${playlist.name.replace(/&/g, "&amp;")}"`);
  });

  it("is the same library every time", () => {
    const again = buildShowcase();
    expect(JSON.stringify(again)).toBe(JSON.stringify(showcase));
    expect(rekordboxXml(again, "/x")).toBe(rekordboxXml(showcase, "/x"));
    expect(JSON.stringify(beatportFixture(again))).toBe(JSON.stringify(beatportFixture(showcase)));
    expect(JSON.stringify(seedPlan(again))).toBe(JSON.stringify(seedPlan(showcase)));
  });

  it("plans most tracks matched with a key, some to review, some with no match, and one playlist left live", () => {
    const plan = seedPlan(showcase);
    const total = showcase.tracks.length;
    expect(plan.accepted.length).toBeGreaterThan(total * 0.7);
    expect(plan.review.length).toBeGreaterThanOrEqual(8);
    expect(plan.noMatch.length).toBeGreaterThanOrEqual(4);
    for (const row of plan.accepted) expect(row.key).toMatch(/^[A-G][#b]? (Major|Minor)$/);
    for (const row of plan.review) expect(row.candidates.length).toBe(2);
    const live = showcase.playlists.find((p) => p.name === showcase.livePlaylist)!;
    expect(live).toBeDefined();
    const planned = new Set([...plan.accepted, ...plan.review, ...plan.noMatch].map((r) => r.trackId));
    for (const id of live.trackIds) expect(planned.has(id), `live track ${id} is seeded`).toBe(false);
  });

  it("serves Beatport pages for the live playlist: most exact, a few to review, one with nothing", () => {
    const fixture = beatportFixture(showcase);
    const live = showcase.playlists.find((p) => p.name === showcase.livePlaylist)!;
    const searched = fixture.json.searches.length;
    expect(searched).toBe(live.trackIds.length - 1);
    for (const search of fixture.json.searches) {
      for (const url of search.urls) expect(fixture.json.pages[url], url).toBeDefined();
    }
    for (const file of Object.values(fixture.json.pages)) expect(fixture.pages[file], file).toContain("<h1>");
    const twoCandidates = fixture.json.searches.filter((s) => s.urls.length === 2).length;
    expect(twoCandidates).toBeGreaterThanOrEqual(2);
    expect(twoCandidates).toBeLessThanOrEqual(5);
    // Discover's catalog answers: genres, a chart by one of the library's artists, its tracks
    const artists = new Set(showcase.tracks.map((t) => t.artist));
    const chart = fixture.json.api.find((a) => a.path === "catalog/charts")!;
    expect(artists.has(chart.body.results[0].artist.name)).toBe(true);
    expect(fixture.json.api.some((a) => /^catalog\/charts\/\d+\/tracks$/.test(a.path))).toBe(true);
  });
});

describe("writing the library to disk", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes a valid WAV whose length is the one asked for", () => {
    dir = mkdtempSync(path.join(tmpdir(), "showcase-wav-"));
    const file = path.join(dir, "a.wav");
    writeWav(file, { seed: 7, seconds: 2, bpm: 128 });
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 16).toString()).toBe("WAVEfmt ");
    const rate = bytes.readUInt32LE(24);
    const channels = bytes.readUInt16LE(22);
    const dataLength = bytes.readUInt32LE(40);
    expect(dataLength).toBe(rate * channels * 2 * 2);
    expect(bytes.length).toBe(44 + dataLength);
    // two different seeds, two different pictures
    writeWav(path.join(dir, "b.wav"), { seed: 8, seconds: 2, bpm: 128 });
    expect(readFileSync(path.join(dir, "b.wav")).equals(bytes)).toBe(false);
  });

  it("writes the XML, the Beatport fixture and one audio file per track", () => {
    dir = mkdtempSync(path.join(tmpdir(), "showcase-lib-"));
    const showcase = buildShowcase();
    const written = writeShowcase(dir, showcase, { audioSeconds: 1 });
    expect(statSync(written.xml).size).toBeGreaterThan(10_000);
    expect(statSync(written.beatportFixture).size).toBeGreaterThan(100);
    for (const track of showcase.tracks) expect(statSync(path.join(written.music, track.file)).size).toBeGreaterThan(44);
    const json = JSON.parse(readFileSync(written.beatportFixture, "utf-8"));
    for (const file of Object.values(json.pages) as string[]) expect(statSync(path.join(path.dirname(written.beatportFixture), file)).size).toBeGreaterThan(0);
  });

  it("takes away only what it wrote, and the folders it made once they are empty", () => {
    dir = mkdtempSync(path.join(tmpdir(), "showcase-rm-"));
    // the root and Music were there before, with a file of the DJ's own in Music
    const music = path.join(dir, "Music");
    mkdirSync(music);
    const theirs = path.join(music, "mine.wav");
    writeFileSync(theirs, "not ours");
    const written = writeShowcase(dir, buildShowcase(), { audioSeconds: 1 });
    expect(written.dirs).not.toContain(music);
    expect(written.dirs).toContain(path.join(dir, "beatport"));
    expect(written.files).toContain(written.xml);
    removeWritten(written);
    expect(existsSync(theirs)).toBe(true);
    expect(existsSync(written.xml)).toBe(false);
    expect(existsSync(written.seedPlan)).toBe(false);
    expect(existsSync(path.join(dir, "beatport"))).toBe(false);
    expect(existsSync(music)).toBe(true);
    expect(existsSync(dir)).toBe(true);
  });

  it("ships the list of real names next to the generator", () => {
    expect(statSync(path.join(here, "real-names.json")).isFile()).toBe(true);
  });
});
