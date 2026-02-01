# Getting Started

This guide walks through the first successful run, including onboarding, preflight, and outputs.

## First Run

1. Launch CuePoint and complete the onboarding tour.
2. Export a Rekordbox XML file (File → Export Collection).
3. Select the XML file in CuePoint.
4. Choose a playlist from the dropdown.
5. Click **Start Processing**.

## Preflight Checks

Before processing starts, CuePoint validates:
- XML file exists and is readable.
- Playlist exists and has tracks.
- Output folder is writable and has space.

Errors must be fixed. Warnings can be bypassed with **Proceed Anyway**.

## Outputs

Outputs are saved to the default exports folder:
- Windows: `Downloads/CuePoint Exports`
- macOS: `Downloads/CuePoint Exports`

Use the run summary to open the output folder or copy the summary.

## CLI Quick Start

```
python main.py --xml "collection.xml" --playlist "My Playlist"
```

Optional flags:
- `--output-dir PATH`
- `--preflight-only` (or `--dry-run`)
- `--run-summary-json PATH`
- `--preflight-report PATH`

## Configuration Examples

```yaml
product:
  onboarding_seen: false
  preflight_enabled: true
  last_xml_path: ""
  last_output_dir: ""
  default_playlist: ""

run_summary:
  write_json: true
  json_path: ""
```

## Help & Privacy

Use Help → Privacy for a summary of data handling and controls.
