# Dev Sandbox Guide

Design 10.9. Running against sample data without affecting production.

## Sample Data Location

| Type | Path |
| --- | --- |
| Rekordbox XML | `SRC/tests/fixtures/rekordbox/` |
| Beatport HTML | `SRC/tests/fixtures/beatport/` |

## Sample XML Files

| File | Description |
| --- | --- |
| `minimal.xml` | Small, minimal structure |
| `small.xml` | Slightly larger |
| `single_playlist_10_tracks.xml` | One playlist, 10 tracks |
| `benchmark_1k.xml` | 1k tracks (performance testing) |
| `benchmark_10k.xml` | 10k tracks (stress testing) |

## Running CLI with Sample Data

```bash
# Activate venv first
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux

# Process minimal XML
python SRC/main.py --xml SRC/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out sandbox_out

# With debug logs
set CUEPOINT_DEBUG=1   # Windows
# export CUEPOINT_DEBUG=1  # macOS/Linux
python SRC/main.py --xml SRC/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out sandbox_out
```

## Running GUI with Sample Data

1. Launch GUI: `python SRC/gui_app.py`
2. File > Import XML
3. Select `SRC/tests/fixtures/rekordbox/minimal.xml` (or `small.xml`)
4. Choose a playlist from the dropdown
5. Process and review results

## Offline Testing (No Network)

Integration tests use mocked HTTP. For manual offline testing:

- Use `--dry-run` if supported, or
- Mock `requests` / `cuepoint.data.beatport` in a local test script

## Output Location

Default output: `CuePoint_Output/` in user Documents (or as configured). For sandbox runs, use `--out sandbox_out` to write to project directory.

## Fixture Policy

- Use **synthetic data only** (no real user data)
- Document fixture changes in commit messages
- See [Fixtures README](https://github.com/stuchain/CuePoint/blob/main/SRC/tests/fixtures/README.md)
