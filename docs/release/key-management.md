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

No workflow in `.github/workflows/` sets any of these today. The only secret the workflows use is the automatic `GITHUB_TOKEN`, which `publish-gh-pages-site.yml` and `docs-check.yml` read. A signed and notarized macOS build therefore comes from a machine where you set the variables above before running `npm run dist`. If you move signing into a workflow, add the secrets under **Settings > Secrets and variables > Actions** and pass them as environment variables to the `npm run dist` step.

Windows builds are unsigned for now: nothing in the repository configures Windows code signing (DEC-145).

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

`scripts/generate_sha256_sums.py` writes a `SHA256SUMS.txt` for every build leg (see the runbook), and each one lists every file in that leg's `release/` folder. The legs use the same file name, so rename them when you attach them to a release: `SHA256SUMS-windows.txt`, `SHA256SUMS-macos.txt` and `SHA256SUMS-linux.txt`. The files are not signed, and no workflow or script signs them. To check a download, run `sha256sum -c --ignore-missing SHA256SUMS-linux.txt` on Linux, or `shasum -a 256 -c --ignore-missing SHA256SUMS-macos.txt` on macOS, from the folder that holds the files. The `--ignore-missing` flag skips the files you did not download. On Windows, compare each line with the output of `Get-FileHash -Algorithm SHA256 <file>`.

If you decide to sign the checksum file, a detached signature made with `gpg --detach-sign --armor SHA256SUMS.txt` is enough. Publish the signature and your public key next to the release. Treat that as a manual step until a script does it.
