#!/usr/bin/env node
/**
 * Builds the site twice more, from release data fixtures instead of the real data, so
 * e2e/download.spec.ts tests the download page in both states whatever GitHub holds today (SITE-07):
 *
 *   dist-fixture/  from e2e/fixtures/releases-with-release.json  (a normal release exists)
 *   dist-none/     from e2e/fixtures/releases-none-yet.json      (before 1.0.0)
 *
 * RELEASES_JSON names the fixture and switches off the real read (scripts/fetch-releases.mjs).
 * `npm run build:fixture` and the e2e suite's pre-step always rebuild; `--if-missing` builds only
 * what is not there yet.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const BUILDS = [
  { outDir: "dist-fixture", json: "e2e/fixtures/releases-with-release.json" },
  { outDir: "dist-none", json: "e2e/fixtures/releases-none-yet.json" },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const { outDir, json } of BUILDS) {
    if (process.argv.includes("--if-missing") && existsSync(join(ROOT, outDir, "download", "index.html"))) {
      console.log(`build-fixture: ${outDir}/ is already built.`);
      continue;
    }
    // Not `npm run build -- --outDir`: that only reaches the last command of the build script. Each step
    // is named here, so a longer `build` script (SITE-09 added the search index) cannot misdirect it.
    const env = { ...process.env, RELEASES_JSON: json };
    const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: "inherit", env });
    const steps = [
      [join(ROOT, "scripts", "sync-tokens.mjs")],
      [join(ROOT, "scripts", "sync-assets.mjs")],
      [join(ROOT, "node_modules", "astro", "bin", "astro.mjs"), "build", "--outDir", outDir],
      [join(ROOT, "node_modules", "pagefind", "lib", "runner", "bin.cjs"), "--site", outDir],
      [join(ROOT, "scripts", "prune-pagefind.mjs"), outDir],
    ];
    let result = { status: 0 };
    for (const step of steps) {
      result = run(step);
      if (result.status !== 0) break;
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
