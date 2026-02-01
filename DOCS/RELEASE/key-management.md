# Key and Certificate Management

Design: 02 Release Engineering and Distribution (2.2, 2.13). Key storage, rotation, and usage for release signing.

## Principles

- **Store certs in CI secrets only.** Use GitHub Actions secrets (or your CI’s secret store) for code-signing certificates and notary credentials. Never commit private keys or passwords to the repository.
- **No keys in repo.** Do not add `.p12`, `.pfx`, `.pem`, or password files to version control.
- **Rotate on schedule or incident.** Rotate signing keys/certs at least annually, or immediately after a suspected compromise or personnel change.
- **Document access.** Record who can create/update release tags and who has access to CI secrets. Restrict tag creation and secret access to maintainers.

## Required Secrets (when signing is enabled)

See [GitHub Secrets Setup](../GUIDES/github-secrets-setup.md) for step-by-step configuration.

- **macOS**: `MACOS_SIGNING_CERT_P12`, `MACOS_SIGNING_CERT_PASSWORD`, `APPLE_DEVELOPER_ID`, `APPLE_TEAM_ID`, `APPLE_NOTARYTOOL_ISSUER_ID`, `APPLE_NOTARYTOOL_KEY_ID`, `APPLE_NOTARYTOOL_KEY`
- **Windows**: `WINDOWS_CERT_PFX`, `WINDOWS_CERT_PASSWORD`

Secrets are only used for tag-triggered (release) builds. Workflows skip signing when secrets are not set.

## Rotation

1. Obtain a new certificate/key (Apple Developer, Windows CA, or notary API key).
2. Add the new secret in GitHub (Settings → Secrets and variables → Actions).
3. Run a test release (e.g. a pre-release tag) and confirm signing and notarization succeed.
4. Remove or archive the old secret.
5. Document the rotation date and reason (e.g. in this file or a changelog).

## Checksum file signing (optional)

Design 2.17: “Sign checksum file if possible.” You can sign `SHA256SUMS` with GPG so users can verify integrity:

- **How-to**: See [Checksum signing (GPG)](checksum-signing.md) for creating a key, signing locally, and using CI with the `GPG_PRIVATE_KEY` secret.
- **When no key**: Publishing `SHA256SUMS` without a signature is acceptable; integrity is still improved by checksum verification of artifacts.

## References

- Design: `DOCS/prerelease/designs/02-release-engineering-and-distribution.md` (2.2, 2.13, 2.49).
- Setup: [GitHub Secrets Setup](../GUIDES/github-secrets-setup.md).
- No-signing option: [Step 10 No Signing Guide](../GUIDES/step-10-no-signing-guide.md).
