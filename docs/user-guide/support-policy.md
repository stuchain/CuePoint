# Support Policy

This page defines supported environments, support windows, and end-of-life (EOL) expectations.

## Response Time Expectations (SLA)

| Priority | Description | Response Target |
| --- | --- | --- |
| **P0** | Crash, data loss, security vulnerability | 24 hours |
| **P1** | Major functionality broken, no workaround | 48 hours |
| **P2** | Minor issue, workaround exists | 5 business days |

For detailed triage and escalation procedures, see [Support SLA](../policy/support-sla.md) and the [Support SLA Playbook](../policy/support-sla.md).

## Supported Platforms

- **Windows**: Windows 10 or newer, 64-bit (x64).
- **macOS**: macOS 14 or newer on Apple Silicon, macOS 15 or newer on Intel. The bundled mpv player runs on nothing older, so the app does not open there (DEC-296). Both chips have their own download.
- **Linux**: Experimental. CI builds an AppImage and runs the automated checks on it, including the packaged app's tests; nobody checks it by hand before a release. It ships without the bundled player (no mpv binary is pinned for Linux) and does not update itself. Report issues, but they are not guaranteed a fix.

A platform is **supported** when CI tests it and it is recommended for everyday use. It is **experimental** when it may work but is not guaranteed. Anything else is unsupported: not tested, use at your own risk.

CuePoint's builds are not signed: Windows may show SmartScreen's warning and macOS may call the app damaged. [Getting started](getting-started.md#install) says what to do.

## Largest Supported Library

CuePoint supports a Rekordbox library of up to **50,000 tracks**. The scale run (`scale.yml`) measures 50,000 tracks on all four systems above (Windows, Linux, a Mac with Apple Silicon, an Intel Mac): importing, browsing, searching, the Statistics page, the file check and the packaged app's start, each held to a time limit. [Performance](performance.md) has what that costs on each system.

A library of 100,000 tracks is above the reference. It is measured on each system and the numbers are published, but they are not held to a limit, and a slowdown there is not a defect. Past 100,000 nothing is measured.

## Running From Source

To run CuePoint from source or use the CLI, you need Python 3.11 or newer. CI tests Python 3.11 and 3.12 on Windows, macOS and Linux; `.python-version` pins the version used for development. Older Pythons are not supported.

## What CI Tests

- `desktop-electron.yml` builds and tests the desktop app on four legs: Windows x64, Linux x64, macOS on Apple Silicon and macOS on Intel. For a release it also runs the end-to-end tests against the packaged app.
- `scale.yml` runs the 50,000-track measurements on the same four legs every Monday, by hand when asked, and before a normal release is published.
- `release-gates.yml` runs the unit and integration tests on the same three systems with Python 3.11 and 3.12.
- `test.yml` runs the test suite, lint and type checks.

Before each major release, the full suite runs on every supported OS, and the checks that need a person (a screen reader, an installed update, the first run) are done by hand on Windows and on an Apple Silicon Mac. The Intel Mac is covered by CI and not by hand (DEC-308). The [known issues](../release/known-issues.md) list what a release ships with. New OS versions and new Rekordbox versions are checked when they ship: run the integration tests with sample XML, then update this page and the [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md), and add the change to the release notes.

## Rekordbox File Expectations

- **Format**: Rekordbox file (XML)
- **Content**: Playlists and track entries present in the XML
- **Version**: Recent Rekordbox versions (saved with Rekordbox's standard XML export command). The [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md) lists the versions that are supported and experimental.

## File Size Guidance

- Recommended Rekordbox file size is **<= 100MB**.
- CuePoint rejects a Rekordbox file larger than 100 MiB (104,857,600 bytes); it does not parse it. Files close to the limit take longer to parse and process.

## Update Cadence

- Minor improvements and fixes are released regularly as needed.
- Critical security fixes are targeted within **7 days** of disclosure.

## Support Window

- The latest major release and the previous minor release are supported.

## Support Diagnostics

When reporting issues, include a **help file** for faster resolution. **Help > Get help** is the one place for it: write a note and press **Send note** to send it with the app's version, or save the help file and attach it to a [GitHub issue](https://github.com/stuchain/CuePoint/issues/new?template=bug_report.yml). Your sign-in and your user folder name are left out of the file.

1. **Help > Get help > Save a help file…** – Creates a ZIP with:
   - `diagnostics.json` – App version, OS, config summary
   - `logs/` – Application logs
   - `crashes/` – Crash logs (if any)
   - `config.yaml` – Sanitized configuration

2. **CLI**: `python main.py --export-support-bundle` writes the same help file. Run ID and log path are printed at start and end. Use `--debug` for extra detail when reproducing.

## Log Locations

- **Logs**: `~/.cuepoint/logs/cuepoint.log` (CLI) or app data `Logs/` (GUI)
- **Crash logs**: `Logs/crashes/crash-YYYYMMDD-HHMMSS.log`
- **Retention**: 5 log files (5MB each), 10 crash files
