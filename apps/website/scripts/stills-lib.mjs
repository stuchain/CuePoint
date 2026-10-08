/**
 * What the stills are made from (SITE-05, fact 8). `npm run stills` renders each scene's resting frame
 * in every theme and records, in src/assets/stills/manifest.json, a hash of the sources that decide how
 * a still looks. The test in stills.test.mjs fails when a scene has no still for a theme, or when the
 * recorded hash no longer matches the sources: render the stills again and commit them.
 *
 * A hash, not a modification time: git does not keep mtimes, so a checkout makes every file "new".
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const STILLS_DIR = join(ROOT, "src", "assets", "stills");
export const MANIFEST = join(STILLS_DIR, "manifest.json");
const THREE = join(ROOT, "src", "three");

/** The files in src/three/scenes/ that are scenes (not the registry, the types or tests). */
export function sceneNames() {
  return readdirSync(join(THREE, "scenes"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts" && f !== "types.ts")
    .map((f) => f.slice(0, -3))
    .sort();
}

/** The theme ids, read from src/lib/themes.ts (the one list the switch and the stills share). */
export function themeIds() {
  const source = readFileSync(join(ROOT, "src", "lib", "themes.ts"), "utf8");
  const block = source.match(/export const THEMES = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error("themes.ts: THEMES not found");
  return [...block[1].matchAll(/id:\s*"(\w+)"/g)].map((m) => m[1]);
}

/** Files only some scenes read, beyond the shared ones (a scene's hash must not change for files it does not use). */
const EXTRA_SOURCES = {
  opening: ["src/three/pixel-font.ts", "src/three/phases.ts"],
};

/** The files whose content changes how a scene's still looks. Paths are relative to the app root. */
export function sourceFiles(scene) {
  return [
    ...(EXTRA_SOURCES[scene] ?? []),
    `src/three/scenes/${scene}.ts`,
    "src/three/scenes/types.ts",
    "src/three/voxel.ts",
    "src/three/pixel.ts",
    "src/three/palette.ts",
    "src/three/renderer.ts",
    "src/three/still.ts",
    "src/three/still-size.ts",
    "src/styles/tokens.generated.css",
    // the render settings: a change to how the stills are made makes them stale too
    "scripts/stills.mjs",
  ];
}

/** The three.js version the lockfile installs: a new version can change a render. */
export function threeVersion() {
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const version = lock.packages?.["node_modules/three"]?.version;
  if (!version) throw new Error("stills: three is not in package-lock.json");
  return version;
}

/** SHA-256 over the sources' paths and content, with line endings normalised. */
export function sourceHash(scene) {
  const hash = createHash("sha256");
  hash.update(`three@${threeVersion()}\n`);
  for (const rel of sourceFiles(scene)) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) throw new Error(`stills: source file ${rel} is missing`);
    hash.update(`${rel}\n`);
    hash.update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function stillPath(scene, theme) {
  return join(STILLS_DIR, `${scene}-${theme}.png`);
}

export function readManifest() {
  return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
}

/** Problems with the committed stills; empty when every scene has a current still in every theme. */
export function stillProblems() {
  const problems = [];
  const manifest = readManifest();
  for (const scene of sceneNames()) {
    for (const theme of themeIds()) {
      if (!existsSync(stillPath(scene, theme))) problems.push(`${scene}-${theme}.png is missing`);
    }
    const recorded = manifest[scene]?.sourceHash;
    if (!recorded) problems.push(`${scene} has no recorded source hash in manifest.json`);
    else if (recorded !== sourceHash(scene)) problems.push(`${scene}'s stills are older than its source (hash differs)`);
  }
  return problems;
}
