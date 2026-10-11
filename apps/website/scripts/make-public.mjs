/**
 * SITE-13: turns the checkout into the public build by setting `PUBLIC` to true in site.config.ts.
 * Only the deploy job runs it, so every other build stays a preview with noindex (DEC-141). It fails
 * when the line is not there, so the deploy never ships a preview by mistake.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINE = /^export const PUBLIC\s*(:\s*boolean\s*)?=\s*false;/m;

/** The source with PUBLIC set to true; throws if the flag's line is missing. */
export function makePublic(source) {
  if (!LINE.test(source)) throw new Error('make-public: no "export const PUBLIC = false;" line in site.config.ts');
  return source.replace(LINE, (_line, type) => `export const PUBLIC${type ? `: boolean ` : " "}= true;`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = join(HERE, "..", "site.config.ts");
  writeFileSync(path, makePublic(readFileSync(path, "utf8")));
  console.log(`make-public: PUBLIC is true in ${path}`);
}
