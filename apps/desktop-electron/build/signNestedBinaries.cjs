/**
 * afterPack: sign the bundled sidecars, inside out (PLAYER-01's flagged risk).
 *
 * CuePoint ships two pieces of third-party/first-party native code inside the
 * app bundle that electron-builder does not treat as part of the Electron app:
 *
 *   Contents/Resources/player/mpv.app   - the mpv sidecar (a nested .app)
 *   Contents/Resources/engine/*         - the PyInstaller engine sidecar
 *
 * Both arrive signed by somebody else (mpv's CI) or ad-hoc (PyInstaller), and
 * notarization rejects a bundle containing code that is not signed by the
 * submitting team with the hardened runtime enabled. Signing has to happen
 * inside out: nested code first, then electron-builder signs the outer app.
 * That ordering is why this runs in afterPack rather than afterSign - by
 * afterSign the outer signature already exists, and re-signing anything inside
 * it would invalidate it.
 *
 * With no signing identity configured this is a no-op that says so. Local
 * `npm run pack` and the credential-less macOS CI leg must keep working; an
 * unsigned build is a legitimate build, it just cannot be distributed.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** Deepest paths first, so nested code is signed before whatever contains it. */
function machOTargets(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        // A nested bundle is signed as a unit, after its own contents.
        if (/\.(app|framework|bundle)$/.test(entry.name)) found.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const isExecutable = (fs.statSync(full).mode & 0o111) !== 0;
      if (isExecutable || /\.(dylib|so)$/.test(entry.name)) found.push(full);
    }
  };
  walk(root);
  return found;
}

exports.default = async function signNestedBinaries(context) {
  if (context.electronPlatformName !== "darwin") return;

  const identity =
    process.env.CSC_NAME || process.env.CUEPOINT_SIGN_IDENTITY || "";
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const resources = path.join(
    context.appOutDir,
    appName,
    "Contents",
    "Resources",
  );

  const roots = ["player", "engine"]
    .map((name) => path.join(resources, name))
    .filter((dir) => fs.existsSync(dir));

  if (roots.length === 0) {
    console.log("  • nested sidecar signing: nothing bundled, skipped");
    return;
  }

  if (!identity) {
    console.log(
      "  • nested sidecar signing skipped: no CSC_NAME/CUEPOINT_SIGN_IDENTITY. " +
        "The build is unsigned and cannot be notarized or distributed.",
    );
    return;
  }

  const entitlements = path.join(__dirname, "entitlements.mac.plist");
  const targets = roots.flatMap(machOTargets);

  for (const target of targets) {
    execFileSync(
      "codesign",
      [
        "--force",
        "--sign", identity,
        "--options", "runtime",
        "--timestamp",
        "--entitlements", entitlements,
        target,
      ],
      { stdio: "inherit" },
    );
  }
  console.log(`  • signed ${targets.length} nested sidecar binaries`);
};
