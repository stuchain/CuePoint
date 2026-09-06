/**
 * afterSign: notarize and staple the signed .app (PLAYER-01, macOS pass row 2).
 *
 * Apple's rule is that a distributed bundle is notarized as a whole, so this
 * runs after electron-builder has signed the outer app - by which point the
 * sidecars signed in `signNestedBinaries.cjs` are already inside it. Stapling
 * matters as much as submitting: without the ticket, first launch on a machine
 * with no network shows the "cannot be opened" dialog even though the app
 * passed notarization.
 *
 * With no credentials this is a no-op that says so, because an unsigned local
 * `npm run pack` and the credential-less macOS CI leg both have to keep
 * working. It refuses only in the one case that would otherwise ship something
 * broken: credentials present but the app unsigned.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function isSigned(appPath) {
  try {
    execFileSync("codesign", ["--verify", "--strict", appPath], {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

exports.default = async function notarizeApp(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  if (!fs.existsSync(appPath)) return;

  const appleId = process.env.APPLE_ID;
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_NOTARYTOOL_KEY_ID;
  const key = process.env.APPLE_NOTARYTOOL_KEY;
  const issuer = process.env.APPLE_NOTARYTOOL_ISSUER_ID;

  const viaAppleId = Boolean(appleId && password && teamId);
  const viaApiKey = Boolean(keyId && key && issuer);

  if (!viaAppleId && !viaApiKey) {
    console.log(
      "  • notarization skipped: no Apple credentials in the environment. " +
        "This build is for local use and Gatekeeper will reject it elsewhere.",
    );
    return;
  }

  if (!isSigned(appPath)) {
    throw new Error(
      "Notarization credentials are set but the app is not signed. Set CSC_LINK " +
        "and CSC_KEY_PASSWORD (or CSC_NAME) so the bundle is signed before it is submitted.",
    );
  }

  // notarytool takes an archive, not a bundle.
  const zipPath = `${appPath}.notarize.zip`;
  execFileSync(
    "ditto",
    ["-c", "-k", "--keepParent", "--sequesterRsrc", appPath, zipPath],
    { stdio: "inherit" },
  );

  const credentials = viaApiKey
    ? ["--key", key, "--key-id", keyId, "--issuer", issuer]
    : ["--apple-id", appleId, "--password", password, "--team-id", teamId];

  try {
    console.log("  • submitting to Apple's notary service (this takes minutes)");
    execFileSync(
      "xcrun",
      ["notarytool", "submit", zipPath, ...credentials, "--wait", "--timeout", "45m"],
      { stdio: "inherit" },
    );
    execFileSync("xcrun", ["stapler", "staple", appPath], { stdio: "inherit" });
    console.log("  • notarized and stapled");
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
};
