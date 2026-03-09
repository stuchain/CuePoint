# Features

## Two tools

CuePoint offers two tools from the start screen:

- **inKey** — Beatport metadata enrichment for Rekordbox playlists. Load an XML export, match tracks to Beatport, and export clean metadata (key, BPM, label, genre, etc.) with a full audit trail. This is the main flow described in the rest of this page.
- **inCrate** — Music digging workflow: build an **inventory** from your full Rekordbox collection, discover **Beatport genre charts** from artists in your library and **new releases** from your labels (last 30 days), and add tracks to a **Beatport playlist** (e.g. one playlist per run).

For inCrate requirements and implementation details, see [inCrate spec](../incrate-spec.md) and [Feature implementation designs (inCrate)](../feature/README.md).

## Core Features

### XML Import
Import Rekordbox XML files to get started. Supports standard Rekordbox XML format.

### Beatport Enrichment
Automatically enrich tracks with Beatport metadata including:
- Artist names
- Track titles
- Release information
- BPM
- Key
- Genre
- Label

### Export Options
Export results in multiple formats:
- **CSV**: For spreadsheets and data analysis
- **JSON**: For programmatic access
- **Excel**: For detailed analysis with formatting

### Match Scoring
Intelligent matching algorithm that:
- Compares track titles and artists
- Handles remixes and variations
- Provides confidence scores
- Flags potential mismatches

## Advanced Features

### Filtering and Search
- Real-time search across all tracks
- Filter by match score
- Filter by artist, title, or genre
- Save filter presets

### Performance Monitoring
- Track processing performance
- Query execution times
- Cache hit rates
- Performance reports

### Support Tools
- Generate support bundles
- Export logs
- System diagnostics
- Error reporting
- Export preflight reports (JSON)

## Supported Environments and Limits

- **Supported OS**: Windows 10+ (x64), macOS 12+ (Intel/Apple Silicon)
- **Rekordbox export**: XML export format from recent Rekordbox versions
- **File size guidance**: XML exports <= 100MB recommended (larger files can be slower)
- **Support policy**: See `docs/user-guide/support-policy.md` for update cadence and EOL policy

## Keyboard Shortcuts

- `Ctrl+P` / `Cmd+P`: Process tracks
- `Ctrl+E` / `Cmd+E`: Export
- `Ctrl+F` / `Cmd+F`: Focus search
- `Ctrl+O` / `Cmd+O`: Open XML file
- `Ctrl+Q` / `Cmd+Q`: Quit application

