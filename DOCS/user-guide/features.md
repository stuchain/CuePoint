# Features

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

