# Update System

## Current status

**CuePoint does not currently ship in-app updates.** Users update by downloading a new
installer from [Releases](https://github.com/stuchain/CuePoint/releases).

The previous in-app update flow (check → "Update Available" dialog → download → install) was
built on PySide6/Qt. When the desktop app moved to Electron, that flow was never wired into the
Electron shell, and PySide6 was dropped from the default requirements — so the code could not run
at all in the shipped application. The Qt update manager, dialogs, downloader, installer and
platform launchers have been removed rather than left in place describing a feature that did not
work.

An Electron-native replacement (for example `electron-updater` against the existing appcast) is
planned but not yet scheduled.

## What still exists

The Qt-free appcast and versioning logic was **kept**, because release tooling and tests depend
on it:

| File | Role |
| --- | --- |
| `src/cuepoint/update/update_checker.py` | Fetches an appcast over HTTPS, parses the Sparkle-namespace XML (version, shortVersionString, enclosure url, length, `sparkle:edSignature`, `sparkle:sha256`), and reports whether a newer **base version** (X.Y.Z) is available |
| `src/cuepoint/update/version_utils.py` | Version parsing and comparison. Only a strictly greater base version counts as an update, so `1.0.0-feb10` is not offered over `1.0.0-feb1` |
| `src/cuepoint/update/security.py` | `FeedIntegrityVerifier` (HTTPS-only feed enforcement) and `PackageIntegrityVerifier` (SHA-256 checksum verification) |
| `src/cuepoint/update/signature_verifier.py` | Package signature/checksum verification helpers |
| `src/cuepoint/update/update_preferences.py` | Update preference storage (skip version, check on startup) |

Consumers:

- `scripts/generate_appcast.py` — generates the Sparkle XML feed published to gh-pages by the
  release workflow, including `sparkle:sha256` computed from the artifact
- `scripts/inspect_appcast.py` — inspects a published appcast
- `scripts/test_pre_release.py` — pre-release validation
- `src/cuepoint/services/security_service.py` — HTTPS URL validation via `FeedIntegrityVerifier`
- `src/tests/unit/update/` — appcast channel and checksum/HTTPS verification tests

## Appcast generation and channels

Appcast generation is unchanged and still part of the release pipeline. See
[design-two-appcast-feeds-test-stable.md](../release/design-two-appcast-feeds-test-stable.md) for
the test/stable channel split, and [checksum-signing.md](../release/checksum-signing.md) for how
artifact checksums are produced and optionally signed.

## When in-app updates return

A future Electron-native updater should reuse the existing appcast feed and the verification
helpers above rather than reintroducing a parallel implementation. The security properties to
preserve are: HTTPS-only feed and download URLs, and SHA-256 verification of the downloaded
artifact before it is executed.
