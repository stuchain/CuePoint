# Data Processing Notice — CuePoint

**Version 1.0 — 2026-02-03**  
**Last updated**: 2026-10-07

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

You can clear the cache and logs from **Help > Privacy...** in the application.

## Data Transmitted (Network Requests)

CuePoint makes network requests **only when you initiate actions** that require them:

| Action | Data Transmitted | Recipient | Purpose |
| --- | --- | --- | --- |
| Beatport lookups | Track title, artist (search queries) | Beatport / third-party search | Metadata enrichment |
| DuckDuckGo search | Search query (track metadata) | DuckDuckGo | Fallback metadata search |

These requests go **directly from your device** to the third-party service. CuePoint does not proxy or store this data on its own servers.

### Error reports

Released builds of the desktop app send an error report when CuePoint hits an unexpected error, unless you turn it off in **Settings → Privacy → Send error reports**.

| Data Transmitted | Recipient | Purpose |
| --- | --- | --- |
| The error and its message, where in the code it happened, a short description of each of the last steps before it, CuePoint's version and build, your operating system and basic hardware details, and for an engine or player crash the scrubbed tail of its output. File, folder, track, artist, label and playlist names, the notes and tags you keep in CuePoint, tokens, and your user and computer names are removed by rules applied on your computer before sending. A note you send with Help → Report a problem is sent as you write it. | Sentry (sentry.io), EU region | Finding and fixing bugs |

**Sentry is the one processor** of this data, acting for the CuePoint project. It is the only service that receives error reports. Reports are kept for as long as Sentry keeps error events on our plan (30 days on the free plan, 90 days on a paid one). The CLI never sends error reports. See the [Privacy Notice](privacy-notice.md) for the full list.

## Data NOT Stored Remotely

CuePoint **does not** store your library, files or collection on remote servers. All processing is local. The only data CuePoint sends to a service of its own choosing is the scrubbed error reports described above (Sentry), which you can turn off. Third-party services (Beatport, DuckDuckGo, GitHub) have their own privacy policies governing data they receive.

## Data Retention

- **Logs**: Retained per rotation policy (typically 7 days); configurable.
- **Cache**: Retained until cleared or evicted by size limits.
- **Exports**: Retained in the directory you choose; you control deletion.

## Your Rights

- **Clear data**: Use Help → Privacy to clear cache, logs, and config.
- **Turn off error reports**: Settings → Privacy → Send error reports; it takes effect at once.
- **Opt out of network**: Avoid Beatport/DuckDuckGo features if you prefer no external requests.
- **Local-only use**: You can use CuePoint with local XML processing and manual exports without any network requests.

## Related Documents

- [Privacy Notice](privacy-notice.md) — Full privacy policy
- [Telemetry Policy](telemetry.md) — Telemetry and analytics (usage telemetry is CLI-only and opt-in; the desktop app's error reports are described there)

## Contact

For questions about data processing, open an issue in the CuePoint repository.
