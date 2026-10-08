/**
 * The Sentry SDK loads in a packaged app (REPORT-07).
 *
 * electron-builder 25's dependency tree nests `@sentry/browser-utils` under `@sentry/browser` in
 * `app.asar`, where `@sentry/replay` cannot find it; loading `@sentry/electron/main` then throws and
 * main sets no reporting up. `build.files` copies the package to the top level as well.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(here, "..");

interface FileSet {
  from?: string;
  to?: string;
}

describe("packaged dependencies", () => {
  it("ships @sentry/browser-utils at the top level of node_modules", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, "package.json"), "utf-8"));
    const sets = (pkg.build.files as (string | FileSet)[]).filter((f): f is FileSet => typeof f !== "string");
    expect(sets).toContainEqual(
      expect.objectContaining({
        from: "node_modules/@sentry/browser-utils",
        to: "node_modules/@sentry/browser-utils",
      }),
    );
  });

  it("copies from a package that is installed where the file set says", () => {
    const manifest = path.join(DESKTOP_ROOT, "node_modules", "@sentry", "browser-utils", "package.json");
    expect(JSON.parse(fs.readFileSync(manifest, "utf-8")).name).toBe("@sentry/browser-utils");
  });
});
