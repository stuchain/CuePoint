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
- **macOS**: macOS 12+ (Intel and Apple Silicon)

## Rekordbox Export Expectations

- **Format**: Rekordbox XML export
- **Content**: Playlists and track entries present in the XML
- **Version**: Recent Rekordbox versions (exported using standard XML export)

## File Size Guidance

- Recommended XML export size is **<= 100MB**.
- Larger exports are supported but may take longer to parse and process.

## Update Cadence

- Minor improvements and fixes are released regularly as needed.
- Critical security fixes are targeted within **7 days** of disclosure.

## Support Window

- The latest major release and the previous minor release are supported.

## Support Diagnostics

When reporting issues, include a **support bundle** for faster resolution:

1. **Help > Support & Diagnostics > Export Support Bundle** – Creates a ZIP with:
   - `diagnostics.json` – App version, OS, config summary
   - `logs/` – Application logs
   - `crashes/` – Crash logs (if any)
   - `config.yaml` – Sanitized configuration

2. **Report Issue** – Opens GitHub with pre-filled version/OS; optionally generates a bundle to attach.

3. **CLI**: Run ID and log path are printed at start and end. Use `--debug` for extra detail when reproducing.

## Log Locations

- **Logs**: `~/.cuepoint/logs/cuepoint.log` (CLI) or app data `Logs/` (GUI)
- **Crash logs**: `Logs/crashes/crash-YYYYMMDD-HHMMSS.log`
- **Retention**: 5 log files (5MB each), 10 crash files
