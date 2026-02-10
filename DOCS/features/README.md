# CuePoint Features

This folder documents **all** features of the CuePoint app—large and small. Each document describes:

1. **What the feature is** (high-level)
2. **How it is implemented** (with code references)

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
| UI | [main-window-and-navigation.md](main-window-and-navigation.md) | Main window, file/playlist selection, mode |
| UI | [progress-and-results.md](progress-and-results.md) | Progress widget, results view, pause/cancel |
| UI | [shortcuts-and-themes.md](shortcuts-and-themes.md) | Keyboard shortcuts, themes, focus |
| UI | [dialogs-and-help.md](dialogs-and-help.md) | Settings, run summary, onboarding, about |
| UI | [status-bar-history-batch.md](status-bar-history-batch.md) | Status bar, history view, batch playlist UI |
| Update | [update-system.md](update-system.md) | Check, download, install updates (macOS/Windows) |
| CLI | [cli-and-arguments.md](cli-and-arguments.md) | CLI processor, all arguments, migrate |
| Reliability | [reliability-and-performance.md](reliability-and-performance.md) | Retry, circuit breaker, guardrails |
| Support | [support-and-diagnostics.md](support-and-diagnostics.md) | Support bundle, log viewer, crash handler |
