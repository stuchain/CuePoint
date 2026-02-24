# Frequently Asked Questions

Common questions and where to find answers.

## User Questions

### What is CuePoint?

CuePoint enriches Rekordbox XML playlists with Beatport metadata (BPM, key, artists, etc.). See [Quick Start](../getting-started/quick-start.md).

### How do I get started?

1. Export your Rekordbox collection as XML
2. Import the XML in CuePoint
3. Process to fetch Beatport metadata
4. Review and export results

See [First Steps](../getting-started/first-steps.md) and [Workflows](../user-guide/workflows.md).

### What do match scores mean?

Scores above 80% are usually reliable. See [Glossary](../user-guide/glossary.md) for terms like *candidate*, *confidence*, and *low-confidence*.

### Something went wrong. Where do I look?

See [Troubleshooting](../user-guide/troubleshooting.md) for common errors and fixes.

### Does inCrate find tracks on Beatport the same way as inKey?

Yes. When inCrate enriches your inventory (fills in missing labels from Beatport), it uses the **full inKey pipeline**:

- **Same processing:** `IProcessorService.process_track(idx, track)` — same query generation (`make_search_queries`), matcher (`best_beatport_match`), scoring, guards, and early exit as inKey.
- **Same parallelism:** Worker count comes from **processing.track_workers** (capped by **performance.max_workers**). With more than one worker, enrichment runs in a `ThreadPoolExecutor` just like inKey’s playlist processing.

So track search, matching, and parallel workers are identical to inKey.

### Where can I see inCrate import progress logs?

During XML import, the app logs each phase (parsing, DB write, enrichment). To see them:

- **Log file:** Open the app’s log file (e.g. **Help → Open logs folder**, then open `cuepoint.log`). Search for `inCrate import:` to see lines like:
  - `inCrate import: starting streaming parse of …`
  - `inCrate import: parsing progress — N tracks so far`
  - `inCrate import: parse complete — N tracks`
  - `inCrate import: progress_cb(total=-1) -> Parsing XML... (N tracks)`
  - `inCrate import: done — imported=…, enriched=…`
- **Log level:** If you don’t see these, ensure logging level is **Info** or **Debug** in Settings.

### What happens when I click Discover?

When you click **Discover** in inCrate, the app does the following (in a background thread so the UI stays responsive):

1. **Your choices**  
   It uses the **genres you selected** in “Genres (multi-select)” and a fixed date range: **charts** = past month (roughly 31 days to today), **new releases** = last 30 days.

2. **Charts branch**  
   - Reads **library artists** from your inventory (the Rekordbox collection you imported).  
   - For **each selected genre**, calls the Beatport API to list charts in that date range.  
   - For each chart, checks if the **chart author** is one of your library artists.  
   - If yes, fetches that chart’s detail and adds **every track** on the chart to the result.  
   So you only get chart tracks from DJs who are already in your collection.

3. **New releases branch**  
   - Reads **library labels** from your inventory (labels that were filled in during import/enrichment).  
   - For each label, looks up the **Beatport label ID** (search by name), then asks the API for **releases in the last 30 days**.  
   - For each release, adds all its **tracks** to the result.  
   So you get new releases only from labels that appear in your collection.

4. **Combine and dedupe**  
   Chart tracks and new-release tracks are merged, then **deduplicated by Beatport track ID** (each track appears once). Chart tracks are listed first, then new releases.

5. **Show results**  
   The resulting list is shown in the **Results** table. You can **Export CSV** or **Add to playlist** (Beatport) from there.

**Requirements:** You need an **inventory** (Import a Rekordbox XML first) and a valid **Beatport API token** in Settings → inCrate. If you select no genres, the charts branch returns 0 tracks; new releases still run for all your library labels.

### Where can I see inCrate Discover progress and logs?

When you click **Discover**, the UI shows a progress bar and status text (e.g. “Charts: 2/5 genres”, “New releases: 1/3 labels”). Full logs are written to the same log file as import:

- **Log file:** Help → Open logs folder, then open `cuepoint.log`. Search for `inCrate discovery:` to see:
  - `inCrate discovery: user clicked Discover — genres=…, from=…, to=…`
  - `inCrate discovery: thread run() started — genres=…, from=…, to=…, days=…`
  - `inCrate discovery: charts branch — N genres, …`
  - `inCrate discovery: progress_cb -> Charts: 2/5 genres` (and similar for releases)
  - `inCrate discovery: done — charts=…, releases=…, combined=…, deduped=…`
  - `inCrate discovery: finished — N tracks`
- **Log level:** Use **Info** or **Debug** (Debug shows per-genre/per-label steps).

### What formats can I export?

CSV, JSON, and Excel. See [Features](../user-guide/features.md).

## Developer Questions

### How do I run tests?

```bash
python scripts/run_tests.py --unit
python scripts/run_tests.py --all
```

See [Testing Strategy](../development/testing-strategy.md).

### How do I add new match rules?

See [Match Rules & Scoring](../development/match-rules-and-scoring.md).

### How do I update Beatport parsing?

See [Beatport Parsing](../development/beatport-parsing.md).

### Where do I start contributing?

See [Contributing](../../.github/CONTRIBUTING.md) and [Developer Setup](../development/developer-setup.md).

---

*Last updated: 2026-02-03*
