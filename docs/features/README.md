# CuePoint Features

This folder documents **all** features of the CuePoint app—large and small. Each document describes:

1. **What the feature is** (high-level)
2. **How it is implemented** (with code references)

Since Phase 7 the desktop app matches library tracks from **Clean**
([user guide](../user-guide/clean.md), DEC-071). The file-based processing, preflight and
export pages describe the CLI, and their status line says so. Screens of the
desktop app are documented in the [user guide](../user-guide/), and its
architecture in [Architecture](../development/architecture.md).

## Feature index

| Area | Document | Description |
|------|----------|-------------|
| Core | [rekordbox-parsing.md](rekordbox-parsing.md) | Parse Rekordbox XML, extract tracks and playlists |
| Core | [query-generation.md](query-generation.md) | Generate search queries from track title/artist |
| Core | [mix-parsing.md](mix-parsing.md) | Parse mix/remix info from titles for scoring |
| Core | [beatport-search-and-fetch.md](beatport-search-and-fetch.md) | Beatport search and track page fetching |
| Core | [matching-and-scoring.md](matching-and-scoring.md) | Match candidates and score with guards/bonuses |
| Core | [text-processing.md](text-processing.md) | Title sanitization and normalization |
| Processing | [processor-service.md](processor-service.md) | Track processing pipeline, workers, progress |
| Processing | [preflight.md](preflight.md) | Pre-run validation of XML and playlists |
| Processing | [checkpoint-and-resume.md](checkpoint-and-resume.md) | Save/resume progress, incremental mode |
| Export | [csv-and-excel-export.md](csv-and-excel-export.md) | CSV/Excel output, main/candidates/queries |
| Export | [data-integrity.md](data-integrity.md) | Schema, checksums, audit log, backups |
| Config | [configuration.md](configuration.md) | Config service, YAML, presets (fast/turbo/myargs) |
| UI | [The CuePoint window](../user-guide/the-window.md#keyboard-shortcuts) | Keyboard shortcuts, themes, focus (user guide) |
| CLI | [cli-and-arguments.md](cli-and-arguments.md) | CLI processor, all arguments, migrate |
| Reliability | [reliability-and-performance.md](reliability-and-performance.md) | Retry, circuit breaker, guardrails |
| Updates | [update-system.md](update-system.md) | How the desktop app finds, downloads and installs a new version |
| Support | [Diagnostics and support](../user-guide/troubleshooting.md#diagnostics-and-support) | Support bundle, Log Viewer, Diagnostics (user guide) |
