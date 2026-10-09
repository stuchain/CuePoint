# Support Policy

This page defines supported environments, support windows, and end-of-life (EOL) expectations.

## Response Time Expectations (SLA)

| Priority | Description | Response Target |
| --- | --- | --- |
| **P0** | Crash, data loss, security vulnerability | 24 hours |
| **P1** | Major functionality broken, no workaround | 48 hours |
| **P2** | Minor issue, workaround exists | 5 business days |

For detailed triage and escalation procedures, see [Support SLA](../policy/support-sla.md) and the [Support SLA Playbook](../security/support-sla-playbook.md).

## Supported Platforms

- **Windows**: Windows 10+ (x64)
- **macOS**: macOS 12+ (Apple Silicon and Intel)
- **Linux**: Experimental. CI builds an AppImage and the community tests it. It ships without the bundled player (no mpv binary is pinned for Linux). Report issues, but they are not guaranteed a fix.

A platform is **supported** when CI tests it and it is recommended for everyday use. It is **experimental** when it may work but is not guaranteed. Anything else is unsupported: not tested, use at your own risk.

## Running From Source

To run CuePoint from source or use the CLI, you need Python 3.11 or newer. CI tests Python 3.11 and 3.12 on Windows, macOS and Linux; `.python-version` pins the version used for development. Older Pythons are not supported.

## What CI Tests

- `desktop-electron.yml` builds and tests the desktop app on `ubuntu-latest`, `windows-latest` and `macos-latest`.
- `release-gates.yml` runs the unit and integration tests on the same three systems with Python 3.11 and 3.12.
- `test.yml` runs the test suite, lint and type checks.

Before each major release, the full suite runs on every supported OS. New OS versions and new Rekordbox versions are checked when they ship: run the integration tests with sample XML, then update this page and the [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md), and add the change to the release notes.

## Rekordbox Export Expectations

- **Format**: Rekordbox XML export
- **Content**: Playlists and track entries present in the XML
- **Version**: Recent Rekordbox versions (exported using standard XML export). The [Rekordbox Compatibility Matrix](../schema/rekordbox-compatibility-matrix.md) lists the versions that are supported and experimental.

## File Size Guidance

- Recommended XML export size is **<= 100MB**.
- CuePoint rejects an XML export larger than 100 MiB (104,857,600 bytes); it does not parse it. Exports close to the limit take longer to parse and process.

## Update Cadence

- Minor improvements and fixes are released regularly as needed.
- Critical security fixes are targeted within **7 days** of disclosure.

## Support Window

- The latest major release and the previous minor release are supported.

## Support Diagnostics

When reporting issues, include a **support bundle** for faster resolution:

1. **Help > Troubleshooting > Export support bundle...** – Creates a ZIP with:
   - `diagnostics.json` – App version, OS, config summary
   - `logs/` – Application logs
   - `crashes/` – Crash logs (if any)
   - `config.yaml` – Sanitized configuration

2. **CLI**: `python main.py --export-support-bundle` writes the same bundle. Run ID and log path are printed at start and end. Use `--debug` for extra detail when reproducing.

## Log Locations

- **Logs**: `~/.cuepoint/logs/cuepoint.log` (CLI) or app data `Logs/` (GUI)
- **Crash logs**: `Logs/crashes/crash-YYYYMMDD-HHMMSS.log`
- **Retention**: 5 log files (5MB each), 10 crash files
