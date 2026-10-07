# Dev Sandbox Guide

Design 10.9. Running against sample data without affecting production.

## Sample Data Location

| Type | Path |
| --- | --- |
| Rekordbox XML | `src/tests/fixtures/rekordbox/` |
| Beatport HTML | `src/tests/fixtures/beatport/` |

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
python src/main.py --xml src/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out sandbox_out

# With debug logs
python src/main.py --xml src/tests/fixtures/rekordbox/minimal.xml --playlist "Test Playlist" --out sandbox_out --debug
```

## Running GUI with Sample Data

1. Start the renderer dev server: `cd apps/desktop-electron && npm run dev:renderer`. `npm run electron:dev` loads it from `http://localhost:5173`, so it needs the server running. To skip the dev server, use `npm run electron:start`, which builds the renderer first.
2. In a second terminal, start the shell: `cd apps/desktop-electron && npm run electron:dev`
3. In **Library**, choose **Import a collection...** and pick `src/tests/fixtures/rekordbox/minimal.xml` (or `small.xml`)
4. In **Clean**, choose **Show what is not matched**, then **Match all**, and review the results

Matching asks Beatport, so it needs the network.

## Offline Testing (No Network)

Integration tests use mocked HTTP. For manual offline testing:

- Use `--dry-run` if supported, or
- Mock `requests` / `cuepoint.data.beatport` in a local test script

## Output Location

Default output: `CuePoint_Output/` in user Documents (or as configured). For sandbox runs, `--out sandbox_out` sets the output file base name (a timestamp is added), and `--output-dir sandbox_out` writes to a folder in the project directory.

## Fixture Policy

- Use **synthetic data only** (no real user data)
- Document fixture changes in commit messages
- See [Fixtures README](https://github.com/stuchain/CuePoint/blob/main/src/tests/fixtures/README.md)
