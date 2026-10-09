# Key and Certificate Management

How signing keys and credentials are stored, which ones the build reads, and how to rotate them. For the release steps themselves, see the [Release Deployment Runbook](release-deployment-runbook.md).

## What the build reads

The Electron build signs and notarizes the macOS app only when the environment holds credentials. The two scripts are `apps/desktop-electron/build/signNestedBinaries.cjs` (signs the bundled sidecars) and `apps/desktop-electron/build/notarize.cjs` (notarizes and staples the app). Without credentials they print a note and skip, so a local `npm run pack` and the CI builds still work and produce unsigned apps.

| Variable | Read by | What it is |
| --- | --- | --- |
| `CSC_NAME` or `CUEPOINT_SIGN_IDENTITY` | `signNestedBinaries.cjs` | The signing identity used to sign the mpv player and the engine sidecar. |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | electron-builder (named in the error `notarize.cjs` raises) | The Developer ID Application certificate and its password, used to sign the outer app. `CSC_NAME` can stand in for them when the certificate is in the keychain. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | `notarize.cjs` | Apple ID credentials for notarization. All three are needed. |
| `APPLE_NOTARYTOOL_KEY_ID`, `APPLE_NOTARYTOOL_KEY`, `APPLE_NOTARYTOOL_ISSUER_ID` | `notarize.cjs` | App Store Connect API key credentials for notarization. All three are needed. `APPLE_NOTARYTOOL_KEY` is passed straight to `notarytool --key`. |

`notarize.cjs` uses the API key if it is complete, and the Apple ID credentials otherwise. If either set is present but the app is not signed, it stops with an error instead of submitting a broken build.

No workflow in `.github/workflows/` sets any of these today. The secrets the workflows use are the automatic `GITHUB_TOKEN`, which `publish-gh-pages-site.yml` and `docs-check.yml` read, and `SENTRY_AUTH_TOKEN` (below). A signed and notarized macOS build therefore comes from a machine where you set the variables above before running `npm run dist`. If you move signing into a workflow, add the secrets under **Settings > Secrets and variables > Actions** and pass them as environment variables to the `npm run dist` step.

## No build is signed (DEC-170)

No build is signed with a certificate. Windows builds are unsigned: nothing in the repository configures Windows code signing, so SmartScreen may warn on a first download. The Macs carry only the ad hoc signature that the `afterPack` hook gives the bundle, so Gatekeeper blocks a first download until the user clears the quarantine flag (see the [user guide](../user-guide/getting-started.md#install)). The release workflow reads no signing secret.

The unsigned state shapes the updater (see `docs/features/update-system.md`):

- Windows updates through `electron-updater`, which accepts an unsigned installer when no publisher is configured. Each download is checked against the SHA-512 in the release's manifest.
- The Macs do not use `electron-updater`, because its Squirrel.Mac installer refuses an unsigned app. CuePoint downloads the chip's zip itself, checks its SHA-512, size, version and chip, and swaps the app after quit. A file the app downloads itself carries no quarantine flag, so Gatekeeper does not stop the new copy.

### If an Apple Developer account is added later

An account would change four things:

1. **Sign** the app with a Developer ID Application certificate: set `CSC_LINK` and `CSC_KEY_PASSWORD` (or `CSC_NAME`) as repository secrets and pass them to the build, so the hooks above sign the outer app and the sidecars with a real identity.
2. **Notarize** it: set the Apple ID or App Store Connect API key variables so `notarize.cjs` submits and staples the app.
3. **Check the result** with `verify_macos_bundle.py --expect-hardened-runtime` (see [Checking a macOS build](release-deployment-runbook.md#checking-a-macos-build)), and revisit the release workflow's Mac check, which runs without it today.
4. **Move the Macs to `electron-updater`**, which works for a signed app, and retire CuePoint's own Mac installer.

Windows signing is a separate certificate and is not covered here.

## The Sentry auth token

`SENTRY_AUTH_TOKEN` is a repository secret read by one step only: **Upload source maps to Sentry** in `desktop-electron.yml`. The job's environment carries just a flag saying whether the secret exists (`HAS_SENTRY_TOKEN`); the token itself is in that step's own `env:`, so `npm ci` install scripts, pip, pytest, the e2e app and the engine never see it. The step runs only on `push` events (not pull requests, so a fork or an unmerged change cannot reach it) and only when the secret is set.

- **What it can do:** `sentry-cli sourcemaps inject` runs locally; `sourcemaps upload` sends main's and the renderer's source maps to the `electron` project of the `cuepoint` organization. Create the token as an organization or internal-integration token limited to **Project: Read & Write** and **Release: Admin** (the scopes source map upload needs), and nothing else. With it someone could upload maps for any release of that project, so treat it like a signing credential.
- **Rotate:** create a new token in Sentry, replace the secret under **Settings > Secrets and variables > Actions**, run the workflow on a push and check that the step is green and the new release shows its files in Sentry (**Settings > Source Maps**), then revoke the old token. Rotate straight away if it may have leaked or someone with access leaves.
- **A failed upload** does not stop the installers on a branch push (`continue-on-error`), but it fails a release build (`release.yml` calls the build with `release: true`), because a release without readable stack traces should be noticed.

## Principles

- **Keep keys out of the repository.** Do not commit `.p12`, `.pfx`, `.p8` or `.pem` files, or any password. Use a CI secret store or your local keychain.
- **Rotate on schedule or incident.** Rotate certificates and API keys before they expire, and straight away after a suspected compromise or when someone with access leaves.
- **Limit access.** Only maintainers should be able to create release tags and read CI secrets. Review the list of people with admin access from time to time.
- **Back up keys safely.** Keep an encrypted copy of each certificate and API key in a password manager or other encrypted storage. Apple lets you download an App Store Connect API key (`.p8`) once only.

## Rotation

1. Get the new certificate or API key from the Apple Developer account (the certificate, or **Users and Access > Keys** in App Store Connect).
2. Set it in the build environment, or replace the secret if you keep it in GitHub.
3. Build a test release with `npm run dist` and confirm the app is signed and notarized (see [Checking a macOS build](release-deployment-runbook.md#checking-a-macos-build)).
4. Remove or archive the old credential after the check passes.
5. Record the rotation date and reason in your own notes.

## Checksums

`scripts/generate_sha256_sums.py` writes `SHA256SUMS-<leg>.txt` for every build leg (see the runbook), and each one lists the files at the top of that leg's `release/` folder. The name carries the leg (`windows-x64`, `linux-x64`, `macos-arm64`, `macos-x64`), so the release workflow attaches them as they are. The files are not signed, and no workflow or script signs them. To check a download, run `sha256sum -c --ignore-missing SHA256SUMS-linux-x64.txt` on Linux, or `shasum -a 256 -c --ignore-missing SHA256SUMS-macos-arm64.txt` on macOS, from the folder that holds the files. The `--ignore-missing` flag skips the files you did not download. On Windows, compare each line with the output of `Get-FileHash -Algorithm SHA256 <file>`.

If you decide to sign the checksum file, a detached signature made with `gpg --detach-sign --armor SHA256SUMS-<leg>.txt` is enough. Publish the signature and your public key next to the release. Treat that as a manual step until a script does it.
