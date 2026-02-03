# Data Processing Notice — CuePoint

**Version 1.0 — 2026-02-03**  
**Last updated**: 2026-02-03

## Summary

This notice describes what data CuePoint processes, where it is stored, and where it is transmitted. CuePoint is a local-first application; the majority of processing happens on your device.

## Data Stored Locally

CuePoint stores the following data **on your device only**:

| Data Type | Location | Purpose | Retention |
| --- | --- | --- | --- |
| Configuration | App config directory | Settings, preferences | Until cleared by user |
| Cache | App cache directory | Cached search results, derived data | Until cleared or evicted |
| Logs | App logs directory | Application logs (sanitized) | Per rotation policy (e.g., 7 days) |
| Exports | User-chosen directory | CSV, Excel, JSON outputs | User-controlled |

You can clear cache, logs, and reset config from **Help → Privacy** in the application.

## Data Transmitted (Network Requests)

CuePoint makes network requests **only when you initiate actions** that require them:

| Action | Data Transmitted | Recipient | Purpose |
| --- | --- | --- | --- |
| Beatport lookups | Track title, artist (search queries) | Beatport / third-party search | Metadata enrichment |
| DuckDuckGo search | Search query (track metadata) | DuckDuckGo | Fallback metadata search |
| Update check | App version, OS (if enabled) | GitHub / update server | Check for updates |

These requests go **directly from your device** to the third-party service. CuePoint does not proxy or store this data on its own servers.

## Data NOT Stored Remotely

CuePoint **does not** store any user data on remote servers. All processing is local. Third-party services (Beatport, DuckDuckGo, GitHub) have their own privacy policies governing data they receive.

## Data Retention

- **Logs**: Retained per rotation policy (typically 7 days); configurable.
- **Cache**: Retained until cleared or evicted by size limits.
- **Exports**: Retained in the directory you choose; you control deletion.

## Your Rights

- **Clear data**: Use Help → Privacy to clear cache, logs, and config.
- **Opt out of network**: Disable update checking; avoid Beatport/DuckDuckGo features if you prefer no external requests.
- **Local-only use**: You can use CuePoint with local XML processing and manual exports without any network requests.

## Related Documents

- [Privacy Notice](privacy-notice.md) — Full privacy policy
- [Telemetry Policy](telemetry.md) — Telemetry and analytics (none in v1.0)

## Contact

For questions about data processing, open an issue in the CuePoint repository.
