import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIST = join(import.meta.dirname, "..", "dist");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Every page in dist/ as a path relative to the base: "" for the home page, "a/" for a/index.html,
 * "404.html" for a page that is a file. The e2e suite opens each of these.
 */
export function distPages(): string[] {
  if (!existsSync(DIST)) throw new Error("dist/ does not exist: run `npm run build` before the e2e suite");
  return walk(DIST)
    .map((f) => relative(DIST, f).split(sep).join("/"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => (f === "index.html" ? "" : f.endsWith("/index.html") ? f.slice(0, -"index.html".length) : f))
    .sort();
}
