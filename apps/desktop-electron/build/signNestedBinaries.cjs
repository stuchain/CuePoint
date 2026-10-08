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
 * With no signing identity configured the whole bundle is signed ad hoc (DIST-02,
 * DEC-170). electron-builder 25 signs nothing without an identity, and it has
 * already edited the app's Info.plist by now, so the seal Electron shipped with
 * is broken and `codesign --verify --deep --strict` would fail. Ad hoc signing
 * is not a distributable signature - no certificate, so Gatekeeper still blocks
 * the app on other Macs - but it makes the bundle verify, and it keeps the
 * hardened runtime and entitlements the build is configured with. The order is
 * the same inside out: sidecars, then Electron's frameworks and helpers, then
 * the app. With an identity, only the sidecars are signed here (below) and
 * electron-builder signs the rest.
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

/** The arguments for one `codesign` call. `timestamp` is `--timestamp` for a real identity. */
function codesignArgs(identity, entitlements, target, timestamp) {
  return [
    "--force",
    "--sign", identity,
    "--options", "runtime",
    timestamp,
    "--entitlements", entitlements,
    target,
  ];
}

/**
 * Everything an ad hoc signature covers, in signing order: the sidecars with the
 * entitlements the identity path gives them, Electron's frameworks and helpers
 * with the inherit entitlements, then the outer app.
 */
function adHocPlan(appPath, sidecarRoots) {
  const entitlements = path.join(__dirname, "entitlements.mac.plist");
  const inherit = path.join(__dirname, "entitlements.mac.inherit.plist");
  const frameworks = path.join(appPath, "Contents", "Frameworks");
  const plan = sidecarRoots
    .flatMap(machOTargets)
    .map((target) => ({ target, entitlements }));
  if (fs.existsSync(frameworks)) {
    for (const target of machOTargets(frameworks)) {
      plan.push({ target, entitlements: inherit });
    }
  }
  plan.push({ target: appPath, entitlements });
  return plan;
}

/** `deps.exec` is for tests; electron-builder calls this with the context only. */
exports.default = async function signNestedBinaries(context, deps = {}) {
  if (context.electronPlatformName !== "darwin") return;
  const exec = deps.exec || execFileSync;

  const identity =
    process.env.CSC_NAME || process.env.CUEPOINT_SIGN_IDENTITY || "";
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const resources = path.join(appPath, "Contents", "Resources");

  const roots = ["player", "engine"]
    .map((name) => path.join(resources, name))
    .filter((dir) => fs.existsSync(dir));

  if (!identity) {
    const plan = adHocPlan(appPath, roots);
    for (const { target, entitlements } of plan) {
      exec("codesign", codesignArgs("-", entitlements, target, "--timestamp=none"), {
        stdio: "inherit",
      });
    }
    console.log(
      `  • signed ${plan.length} items ad hoc (no CSC_NAME/CUEPOINT_SIGN_IDENTITY). ` +
        "The build verifies but cannot be notarized or distributed.",
    );
    return;
  }

  if (roots.length === 0) {
    console.log("  • nested sidecar signing: nothing bundled, skipped");
    return;
  }

  const entitlements = path.join(__dirname, "entitlements.mac.plist");
  const targets = roots.flatMap(machOTargets);

  for (const target of targets) {
    exec("codesign", codesignArgs(identity, entitlements, target, "--timestamp"), {
      stdio: "inherit",
    });
  }
  console.log(`  • signed ${targets.length} nested sidecar binaries`);
};

exports.adHocPlan = adHocPlan;
