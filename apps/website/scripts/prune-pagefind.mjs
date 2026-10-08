#!/usr/bin/env node
/**
 * After `pagefind --site dist` (SITE-09): deletes the files of Pagefind's own search UI and its highlighter,
 * which the site never loads (GuideSearch.astro draws its own box and results), and the language-neutral
 * wasm. What stays is what search needs: pagefind.js, its worker, the entry file, the index and fragments,
 * and the wasm of each language the index uses.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UNUSED = [/^pagefind-(component-ui|modular-ui|ui|highlight)\.js$/, /\.css$/, /^wasm\.unknown\.pagefind$/];

/** Removes the unused files from `<dist>/pagefind`; returns their names. */
export function prunePagefind(dist) {
  const dir = join(dist, "pagefind");
  if (!existsSync(dir)) throw new Error(`prune-pagefind: ${dir} does not exist; run pagefind first`);
  const removed = readdirSync(dir).filter((name) => UNUSED.some((re) => re.test(name)));
  for (const name of removed) rmSync(join(dir, name));
  return removed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  console.log(`prune-pagefind: removed ${prunePagefind(dist).join(", ") || "nothing"}`);
}
