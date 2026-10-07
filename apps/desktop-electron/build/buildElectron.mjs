// Bundles Electron main into electron-dist/main.mjs (REPORT-07).
//
// What the CLI call this replaces could not do portably: bake the commit in. CI sets
// CUEPOINT_BUILD_COMMIT; `electron/buildInfo.ts` reads it back as `__CUEPOINT_COMMIT__` and reports it
// as Sentry's `dist`. With it unset the build records no commit. The source map is written beside the
// bundle with no `sourceMappingURL` comment: CI uploads it to Sentry and deletes it before packing.
import { build } from "esbuild";

const commit = (process.env.CUEPOINT_BUILD_COMMIT ?? "").trim();

await build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  format: "esm",
  outfile: "electron-dist/main.mjs",
  sourcemap: "external",
  define: { __CUEPOINT_COMMIT__: JSON.stringify(commit) },
  logLevel: "info",
});
