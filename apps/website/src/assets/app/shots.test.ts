/**
 * The app's pictures (SITE-04): every shot in shots.json has a file for every theme the site offers,
 * every PNG in this folder is a listed shot, every id is a slot the pages know, and each picture's
 * pixel size is the window's size times the capture scale (read from the PNG header, no decoder).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_SHOTS } from "../../data/home";
import shots from "./shots.json";

const here = path.dirname(fileURLToPath(import.meta.url));

interface Shot {
  alt: string;
  width: number;
  height: number;
  scale: number;
}
const listed = shots as { themes: string[]; shots: Record<string, Shot> };

/** A PNG's pixel size from its IHDR chunk, the first chunk after the 8-byte signature. */
function pngSize(file: string): { width: number; height: number } {
  const head = readFileSync(file).subarray(0, 24);
  expect(head.subarray(1, 4).toString(), `${file} is a PNG`).toBe("PNG");
  expect(head.subarray(12, 16).toString()).toBe("IHDR");
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const files = readdirSync(here).filter((f) => f.endsWith(".png"));

describe("shots.json and the pictures beside it", () => {
  it("ships one theme, the site's (DEC-222)", () => {
    expect(listed.themes).toEqual(["neoDark"]);
  });

  it("every shot is a slot the pages know, with honest alt text and the app's window size", () => {
    for (const [id, shot] of Object.entries(listed.shots)) {
      expect(Object.keys(APP_SHOTS), id).toContain(id);
      expect(shot.alt.length, id).toBeGreaterThan(20);
      expect([shot.width, shot.height], id).toEqual([1280, 800]);
      expect([1, 2], id).toContain(shot.scale);
    }
    expect(Object.keys(listed.shots).length).toBeGreaterThanOrEqual(9);
  });

  it("every shot has a file for every theme, and every file is a shot", () => {
    const expected = new Set<string>();
    for (const id of Object.keys(listed.shots)) for (const theme of listed.themes) expected.add(`${id}-${theme}.png`);
    expect(new Set(files)).toEqual(expected);
  });

  it("every picture's pixel size is the window times the scale", () => {
    for (const [id, shot] of Object.entries(listed.shots)) {
      for (const theme of listed.themes) {
        const size = pngSize(path.join(here, `${id}-${theme}.png`));
        expect(size, `${id}-${theme}`).toEqual({ width: shot.width * shot.scale, height: shot.height * shot.scale });
      }
    }
  });

  it("has a picture for every slot the home page defines, so no page shows a placeholder", () => {
    for (const id of ["window", "clean", "clean-compare", "library", "keys", "discover", "statistics", "prepare", "waveforms", "export"]) {
      expect(listed.shots[id], id).toBeDefined();
    }
  });
});
