# Privacy Notice — CuePoint v1.0

**Last updated**: 2026-10-07

**Applies to**: CuePoint v1.0

## Summary (plain language)
- CuePoint v1.0 has **no analytics and no usage tracking**.
- Released builds **send an error report** to Sentry (EU region) when CuePoint hits an unexpected error, **unless you turn it off** in **Settings → Privacy → Send error reports**. It takes effect at once. Reports are cleaned on your computer before they are sent, so that they do not include your file, folder, track, artist, label or playlist names, the notes and tags you keep in CuePoint, or tokens.
- CuePoint processes your Rekordbox collection **locally on your device**.
- CuePoint makes network requests **only when you initiate actions** that require it (e.g., Beatport lookups).
- CuePoint stores some data **locally** (settings, cache, logs). You can clear it from **Help → Privacy**.

## Who we are
CuePoint is an open-source desktop application maintained by the CuePoint project contributors.

## Information we collect
### Error reports (on by default; you can turn them off)
When CuePoint hits an unexpected error, a released build sends one error report so we can find and fix the bug. Reports are on by default. Builds you run from source do not send them (unless a developer sets that up by hand), and the command-line tool (CLI) never sends them.

**A report carries:**
- the kind of error and its message, with file and folder names, your user, home and computer names, and track, artist, label and playlist names removed by rules applied on your computer before sending;
- where in CuePoint's code it happened (the stack trace);
- a short description of each of the last steps before it (for example a screen was opened, a job failed), cleaned the same way;
- CuePoint's version and build, and basic details about your computer: operating system and version, processor and graphics hardware, memory, language and time zone;
- when the engine (the part of CuePoint that does the work) or the audio player stops unexpectedly, the last lines of what it wrote, with the same removals applied;
- if you use **Help → Report a problem**, the note you write there, CuePoint's version and the id of the last report. That is sent only when you press Send, and the note is sent exactly as you write it, so leave out anything you don't want read.

**A report is built not to carry** (the note you choose to send with Report a problem is the one exception): file or folder names (a path is reduced to its depth and file extension), your user, home or computer name, track, artist, label or playlist names, the notes and tags you keep in CuePoint, tokens or passwords, the values of variables in the code, your library or Rekordbox collection, screenshots, recordings or memory dumps. The app sends no user id, name or email, and does not put your IP address in a report. As with any server you connect to, Sentry receives the network address a request comes from.

**Where it goes:** to Sentry (sentry.io), in Sentry's EU region. Sentry is the only service that receives error reports.

**How long it is kept:** for as long as Sentry keeps error events on our plan: 30 days on the free plan, 90 days on a paid one, after which Sentry deletes them. We read reports only to fix bugs.

**How to turn it off:** **Settings → Privacy → Send error reports**, or **Help → Privacy → Change in Settings**. It takes effect at once, with no restart: nothing is sent after that, and nothing is saved to send later. A report that has already reached Sentry stays there until Sentry deletes it.

CuePoint's CLI has its own usage telemetry, which is separate, opt-in and off unless you enable it (see the [Telemetry Policy](telemetry.md)).

### User-initiated network requests
CuePoint may make network requests when you use features that require them:
- **Beatport lookups**: when you run processing/search that queries Beatport for metadata.
- **DuckDuckGo** (if you use the related search integration): user-initiated.
- **Update checking**: if/when you use update checking features (and when enabled).

These requests go directly from your device to the third-party service.

## How we use information
- **Local processing**: to parse your Rekordbox XML and generate results/exports.
- **Caching** (optional/local): to speed up repeated lookups.
- **Logging** (optional/local): to help diagnose issues. Logs are **sanitized** to avoid recording secrets/tokens.

We do not sell or rent personal information.

## What is stored on your device
CuePoint may store the following **locally**:
- **Configuration**: app settings and preferences.
- **Library database**: your imported Rekordbox library — track details and file
  paths — together with anything CuePoint records about it, such as tags,
  ratings, notes, match decisions and change history. Stored at
  `~/.cuepoint/cuepoint.db`.
- **Cache**: cached responses/derived data to improve performance.
- **Logs**: application logs (rotated; sanitized).
- **Exports**: files you export (CSV/Excel/JSON) to a location you choose.

You can manage and delete local data in the app:
- **Help → Privacy**: clear cache/logs/config and set “clear on exit” options.
  These do **not** touch the library database: clearing a cache should never
  delete your library, tags or ratings. To remove it, delete
  `~/.cuepoint/cuepoint.db` yourself.

## Support bundles
A support bundle (**Help → Export support bundle**) is a file you create and choose
whether to share. It contains diagnostics, sanitized logs and your configuration
with secrets redacted.

It does **not** contain your library database. Bundles include only a summary of
its shape — schema version, pending migrations and row counts — never track
titles, artists, file paths, tags, ratings or notes.

## Your choices and controls
- Clear cache/logs/config from **Help → Privacy**.
- Optionally enable “clear cache on exit” and “clear logs on exit”.
- Turn error reports off in **Settings → Privacy → Send error reports**.

## Third-party services
CuePoint may interact with third-party services you choose to use (e.g., Beatport, DuckDuckGo, GitHub hosting for updates), and sends error reports to Sentry unless you turn them off. Their privacy practices are governed by their own policies.

## Changes to this notice
If data practices change in a future version, this notice will be updated and the “Last updated” date will change.

## Contact
For privacy questions or concerns, please open an issue in the CuePoint repository.
