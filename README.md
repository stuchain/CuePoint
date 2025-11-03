# CuePoint - Rekordbox → Beatport Metadata Enricher

A sophisticated Python tool that automatically matches tracks from your Rekordbox playlists to Beatport, enriching your collection with accurate metadata including keys, BPM, labels, genres, release information, and more.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [Usage](#usage)
6. [How It Works](#how-it-works)
7. [Output Files](#output-files)
8. [Configuration](#configuration)
9. [Command-Line Options](#command-line-options)
10. [Troubleshooting](#troubleshooting)
11. [Project Structure](#project-structure)
12. [Advanced Topics](#advanced-topics)

---

## Overview

CuePoint reads a Rekordbox XML export file, extracts tracks from a specified playlist, and for each track:

1. **Generates multiple search queries** based on title and artist information
2. **Searches Beatport** using DuckDuckGo, direct Beatport search, and browser automation
3. **Evaluates candidates** using sophisticated similarity scoring
4. **Selects the best match** using fuzzy matching, guards, and bonuses
5. **Outputs comprehensive CSV files** with matches, candidates, and queries

The tool uses **multi-threading** for parallel processing and implements **time budgets** to balance accuracy with performance.

---

## Features

### Core Functionality

- ✅ **Automatic Track Matching**: Finds Beatport matches for Rekordbox tracks with high accuracy
- ✅ **Multi-Query Search**: Generates intelligent query variants to maximize match probability
- ✅ **Fuzzy String Matching**: Uses RapidFuzz for robust title/artist similarity scoring
- ✅ **Remix Detection**: Special handling for remixes, extended mixes, and special variants
- ✅ **Parallel Processing**: Multi-threaded track and candidate processing for speed
- ✅ **Re-Search Feature**: Automatically re-searches unmatched tracks with enhanced settings
- ✅ **Comprehensive Logging**: Detailed CSV outputs for matches, candidates, and queries

### Output Information

For each matched track, you get:

- **Track Metadata**: Title, artists, key (musical key + Camelot notation)
- **Release Information**: Year, BPM, label, genres, release name, release date
- **Match Quality**: Similarity scores, confidence labels, match details
- **Beatport Links**: Direct URLs and track IDs for easy access

### Smart Features

- **Subset Match Prevention**: Prevents "Sun" from matching "Son of Sun"
- **Mix Type Matching**: Prioritizes correct mix variants (remix vs original vs extended)
- **Special Phrase Detection**: Handles custom parenthetical phrases like "(Ivory Re-fire)"
- **Artist Extraction**: Extracts artist names from title when not provided separately
- **Title Cleaning**: Removes noise like [F], [3] prefixes that hurt matching

---

## Installation

### Requirements

- Python 3.8 or higher
- Rekordbox XML export file (export from Rekordbox → File → Export Collection in XML Format)

### Dependencies

Install required packages:

```bash
pip install -r requirements.txt
```

After installing, set up Playwright browser binaries:

```bash
playwright install chromium
```

**Note**: This downloads the Chromium browser used for automated web scraping. This is required for the browser automation feature that finds JavaScript-rendered content on Beatport.

---

## Quick Start

1. **Export your Rekordbox collection**:
   - Open Rekordbox
   - File → Export Collection in XML Format
   - Save as `collection.xml` in your project directory

2. **Run the enricher**:
   ```bash
   python main.py --xml collection.xml --playlist "My Playlist" --auto-research
   ```
   
   Note: Default settings are already optimized! Use `--myargs` for ultra-aggressive settings if you need maximum coverage.

3. **Check the output**:
   - Results are in the `output/` directory
   - Open `{playlist_name} (timestamp).csv` to see matches

---

## Usage

### Basic Usage

```bash
python main.py --xml collection.xml --playlist "Playlist Name" --out output.csv
```

### Recommended Usage (Default Settings Are Already Optimized)

```bash
python main.py --xml collection.xml --playlist "My Playlist" --auto-research
```

**Flags Explained**:
- `--auto-research`: Automatically re-searches unmatched tracks without prompting
- `--myargs`: Ultra-aggressive preset (optional) - goes beyond defaults for maximum coverage

**Note**: Default settings already include:
- Browser automation enabled
- High parallelism (15 candidate workers, 12 track workers)
- 45-second time budget per track
- 40 queries per track
- Optimized scoring thresholds

### Full Example

```bash
python main.py \
  --xml collection.xml \
  --playlist "Techno Mix 2024" \
  --myargs \
  --auto-research \
  --out techno_mix_2024.csv \
  --verbose
```

### Batch Processing Multiple Playlists

Create a simple script to process multiple playlists:

```bash
#!/bin/bash
for playlist in "Playlist 1" "Playlist 2" "Playlist 3"; do
  python main.py --xml collection.xml --playlist "$playlist" --auto-research --out "${playlist}.csv"
done
```

---

## How It Works

### Architecture Overview

The matching pipeline consists of several stages:

```
1. XML Parsing (rekordbox.py)
   ↓
2. Track Processing (processor.py)
   ├─ Title Cleaning & Normalization (text_processing.py)
   ├─ Artist Extraction (if needed)
   ├─ Query Generation (query_generator.py)
   │  ├─ Priority queries (full title + artists)
   │  ├─ N-gram queries (title fragments)
   │  ├─ Remix-specific queries
   │  └─ Special phrase queries
   ↓
3. Candidate Search (beatport_search.py, beatport.py)
   ├─ DuckDuckGo search
   ├─ Direct Beatport search
   └─ Browser automation (fallback)
   ↓
4. Matching & Scoring (matcher.py)
   ├─ Title similarity (RapidFuzz)
   ├─ Artist similarity
   ├─ Bonuses (key, year, mix type)
   ├─ Penalties (subset matches, mix mismatches)
   └─ Guards (reject false positives)
   ↓
5. Output Generation (processor.py)
   ├─ Main results CSV
   ├─ Review CSV (low scores)
   ├─ Candidates CSV (all evaluated)
   └─ Queries CSV (all executed)
```

### Matching Algorithm

The matching process uses a **multi-layered approach**:

1. **Query Generation**: Creates 10-40+ query variants per track
   - Priority queries: Full title + artist combinations
   - N-gram queries: Title word sequences (1-3 words)
   - Remix queries: Special handling for remix variants
   - Reverse queries: "Artist Title" when "Title Artist" fails

2. **Candidate Collection**: Fetches candidates from multiple sources
   - DuckDuckGo search (fast, broad coverage)
   - Direct Beatport search (more accurate for remixes)
   - Browser automation (finds JavaScript-rendered content)

3. **Scoring**: Calculates similarity scores
   - Title similarity: 0-100 (weighted 55%)
   - Artist similarity: 0-100 (weighted 45%)
   - Bonuses: +2 for exact key match, +2 for exact year match
   - Penalties: Mix type mismatches, subset matches

4. **Guards**: Rejects false positives
   - Subset match prevention ("Sun" ≠ "Son of Sun")
   - Mix type validation (remix vs original)
   - Special phrase validation (must match custom phrases)

5. **Early Exit**: Stops searching when excellent match found
   - Score ≥ 90: Immediate acceptance (optimized threshold)
   - Score ≥ 88 after 5+ queries: Fast exit for strong partial matches

### Example: How a Track Gets Matched

**Input Track**:
- Title: "[8-9] Tighter (CamelPhat Remix)"
- Artists: "HOSH"

**Processing Steps**:

1. **Title Cleaning**: Removes `[8-9]` → `"Tighter (CamelPhat Remix)"`

2. **Query Generation** (sample):
   ```
   1. "Tighter CamelPhat Remix HOSH"
   2. "Tighter HOSH CamelPhat Remix"
   3. "Tighter CamelPhat"
   4. "Tighter HOSH"
   5. "Tighter" (title-only, as fallback)
   ```

3. **Candidate Search**: Finds 50+ Beatport tracks for each query

4. **Scoring** (example candidate):
   - Title: "Tighter (feat. Jalja) CamelPhat Extended Remix"
   - Title similarity: 85% (high match on "Tighter", "CamelPhat")
   - Artist similarity: 75% (HOSH not in artists, but CamelPhat matches)
   - Mix type: Extended Remix vs Remix (minor penalty)
   - **Final Score: 81.0** (acceptable match)

5. **Guard Check**: Passes (not a subset, mix type acceptable)

6. **Result**: Match accepted, written to CSV

---

## Output Files

All output files are written to the `output/` directory with timestamps to prevent overwriting.

### Main Results File: `{name} (timestamp).csv`

**One row per track** with best match (or empty if no match).

**Columns**:
- `playlist_index`: Track position in playlist (1-based)
- `original_title`: Title from Rekordbox
- `original_artists`: Artists from Rekordbox
- `beatport_title`: Matched Beatport title
- `beatport_artists`: Matched Beatport artists
- `beatport_key`: Musical key (e.g., "E Major")
- `beatport_key_camelot`: Camelot notation (e.g., "12B")
- `beatport_year`: Release year
- `beatport_bpm`: BPM
- `beatport_label`: Record label
- `beatport_genres`: Genres (comma-separated)
- `beatport_release`: Release/album name
- `beatport_release_date`: Release date
- `beatport_track_id`: Beatport track ID
- `beatport_url`: Direct URL to track
- `title_sim`: Title similarity score (0-100)
- `artist_sim`: Artist similarity score (0-100)
- `match_score`: Final match score (0-200+)
- `confidence`: Confidence label (low/medium/high)
- `search_query_index`: Which query found the match
- `search_stop_query_index`: Which query caused early exit
- `candidate_index`: Which candidate was selected

### Review File: `{name} (timestamp)_review.csv`

**Tracks needing manual review** (low scores, weak matches, no matches).

**Additional Column**:
- `review_reason`: Comma-separated reasons (e.g., "score<70,weak-artist-match")

**Review Reasons**:
- `score<70`: Match score below 70 (questionable match)
- `weak-artist-match`: Artist similarity < 35% with no token overlap
- `no-candidates`: No match found at all

### Candidates File: `{name} (timestamp)_candidates.csv`

**All candidates evaluated** for all tracks (comprehensive log).

**Use Cases**:
- Analyze why a track matched incorrectly
- See alternative candidates that were rejected
- Understand scoring differences

**Key Columns**:
- `candidate_url`: Beatport URL
- `title_sim`, `artist_sim`: Individual similarity scores
- `base_score`: Score before bonuses
- `final_score`: Score after bonuses/penalties
- `guard_ok`: Whether candidate passed guard checks ("Y"/"N")
- `reject_reason`: Why candidate was rejected (if any)
- `winner`: Whether this candidate was the final match ("Y"/"N")

### Queries File: `{name} (timestamp)_queries.csv`

**All queries executed** for all tracks (audit log).

**Use Cases**:
- See which queries were most effective
- Debug why a track didn't match
- Optimize query generation

**Key Columns**:
- `search_query_text`: The actual query executed
- `candidate_count`: How many candidates were found
- `elapsed_ms`: Time spent on this query
- `is_winner`: Whether this query found the winning match ("Y"/"N")
- `winner_candidate_index`: Which candidate from this query won
- `is_stop`: Whether this query caused early exit ("Y"/"N")

---

## Configuration

### Configuration File: `config.py`

All settings are in `config.py` and can be modified. Key settings:

#### Search & Concurrency

- `MAX_SEARCH_RESULTS`: Results per query (default: 50)
- `CANDIDATE_WORKERS`: Parallel candidate fetching threads (default: 8)
- `TRACK_WORKERS`: Parallel track processing threads (default: 1)
- `PER_TRACK_TIME_BUDGET_SEC`: Max time per track (default: 25s)

#### Similarity & Scoring

- `TITLE_WEIGHT`: Title similarity weight (default: 0.55 = 55%)
- `ARTIST_WEIGHT`: Artist similarity weight (default: 0.45 = 45%)
- `MIN_ACCEPT_SCORE`: Minimum score to accept match (default: 70)

#### Early Exit

- `EARLY_EXIT_SCORE`: Stop if candidate reaches this score (default: 90)
- `EARLY_EXIT_MIN_QUERIES`: Minimum queries before early exit (default: 8)

#### Query Generation

- `TITLE_GRAM_MAX`: Maximum N-gram size (default: 2)
- `MAX_QUERIES_PER_TRACK`: Hard cap on queries (default: 40)
- `REMIX_MAX_QUERIES`: Max queries for remix tracks (default: 30)

### Configuration Presets

**Default Settings**: Already optimized with:
- Browser automation enabled
- High parallelism (15 candidate workers, 12 track workers)
- 45-second time budget, 40 queries per track
- Optimized scoring and early exit thresholds

**Optional Presets** (via command-line flags):

- `--myargs`: Ultra-aggressive preset - goes beyond defaults for maximum coverage (slower, finds more)
- `--fast`: Faster defaults (fewer results, shorter time budgets)
- `--turbo`: Maximum speed (aggressive optimizations)
- `--exhaustive`: Maximum accuracy (more queries, longer time budgets)
- `--all-queries`: Run every query variation (very slow, most thorough)

See `main.py` for preset definitions (can be customized).

---

## Command-Line Options

### Required Arguments

- `--xml PATH`: Path to Rekordbox XML export file
- `--playlist NAME`: Name of playlist to process (must match exactly)

### Optional Arguments

- `--out FILENAME`: Base filename for output CSV (default: `beatport_enriched.csv`)
- `--myargs`: Ultra-aggressive preset - goes beyond defaults for maximum coverage (optional)
- `--auto-research`: Automatically re-search unmatched tracks (recommended)
- `--fast`: Faster defaults (safe)
- `--turbo`: Maximum speed (be gentle)
- `--exhaustive`: Maximum accuracy (more queries, longer time)
- `--all-queries`: Run every query variation
- `--verbose`: Verbose logging
- `--trace`: Very detailed per-candidate logs
- `--seed N`: Random seed for determinism (default: 0)

### Examples

```bash
# Basic run
python main.py --xml collection.xml --playlist "My Playlist"

# Recommended run (optimized settings + auto re-search)
python main.py --xml collection.xml --playlist "My Playlist" --auto-research

# Fast run (fewer results, shorter time)
python main.py --xml collection.xml --playlist "My Playlist" --fast

# Exhaustive run (maximum accuracy, slower)
python main.py --xml collection.xml --playlist "My Playlist" --exhaustive

# Verbose logging
python main.py --xml collection.xml --playlist "My Playlist" --verbose

# Custom output filename
python main.py --xml collection.xml --playlist "My Playlist" --out my_results.csv
```

---

## Troubleshooting

### No Matches Found

**Problem**: Many tracks show "No match candidates found."

**Solutions**:
1. Use `--auto-research` to re-search with enhanced settings
2. Check review file (`*_review.csv`) for tracks needing attention
3. Verify playlist name matches exactly (case-sensitive)
4. Try `--exhaustive` for maximum search depth
5. Check if tracks exist on Beatport manually

### Low Match Scores

**Problem**: Matches found but scores are low (< 70).

**Solutions**:
1. Review the `*_candidates.csv` file to see alternative candidates
2. Check `review_reason` in review file for specific issues
3. Verify original track data is accurate
4. Consider lowering `MIN_ACCEPT_SCORE` in `config.py` (not recommended)

### Incorrect Matches

**Problem**: Tracks are matching incorrectly (wrong remix, wrong artist).

**Solutions**:
1. Check `*_candidates.csv` to see why the wrong candidate was selected
2. Review guard rejections (`reject_reason` column)
3. Verify original track title/artist data is correct
4. Check review file for flagged problematic matches

### Slow Performance

**Problem**: Processing is very slow.

**Solutions**:
1. Use `--fast` or `--turbo` presets
2. Reduce `TRACK_WORKERS` to 1 (sequential processing)
3. Enable caching: `ENABLE_CACHE = True` in `config.py` (enabled by default)
4. Reduce `MAX_SEARCH_RESULTS` or `PER_TRACK_TIME_BUDGET_SEC`

**Note**: HTTP response caching (`requests-cache`) is included in `requirements.txt` and enabled by default.

### Unicode/Encoding Errors

**Problem**: Errors displaying non-ASCII characters (accents, special characters).

**Solutions**:
- The tool handles Unicode automatically with fallbacks
- If issues persist, check your terminal encoding
- CSV files use UTF-8 encoding (open in Excel/Google Sheets)

---

## Project Structure

```
CuePoint/
├── main.py                 # CLI entry point, argument parsing, presets
├── config.py               # Configuration settings and constants
├── processor.py            # Main orchestration (parsing, processing, output)
├── matcher.py              # Matching and scoring logic
├── query_generator.py      # Search query generation
├── beatport_search.py      # Beatport search implementation (direct + browser)
├── beatport.py             # Beatport scraping and parsing
├── rekordbox.py            # Rekordbox XML parsing
├── text_processing.py      # Text normalization and similarity
├── mix_parser.py           # Mix/remix phrase extraction
├── utils.py                # Logging and timestamp utilities
├── output/                 # Output directory (created automatically)
│   └── *.csv              # Generated CSV files
├── collection.xml          # Rekordbox XML export (user-provided)
├── README.md               # This file
└── requirements.txt        # Python dependencies
```

### Module Responsibilities

- **main.py**: CLI interface, argument parsing, preset application
- **processor.py**: Orchestrates entire pipeline, CSV output, re-search feature
- **matcher.py**: Core matching algorithm, scoring, guards, early exit
- **query_generator.py**: Generates intelligent search query variants
- **beatport_search.py**: Multi-method Beatport search (DuckDuckGo, direct, browser)
- **beatport.py**: Scrapes and parses Beatport track pages
- **rekordbox.py**: Parses Rekordbox XML, extracts playlists and tracks
- **text_processing.py**: Normalizes text, calculates similarities
- **mix_parser.py**: Extracts mix type information (remix, extended, etc.)
- **config.py**: All configuration settings in one place
- **utils.py**: Shared utility functions (logging, timestamps)

---

## Advanced Topics

### Customizing Query Generation

Edit `query_generator.py` to modify query generation:

- Add custom query patterns
- Adjust N-gram generation
- Modify remix query logic

### Customizing Scoring

Edit `matcher.py` to modify scoring:

- Adjust similarity weights
- Add custom bonuses/penalties
- Modify guard logic

### Adding Search Methods

Edit `beatport_search.py` to add new search methods:

- Add new API endpoints
- Implement alternative search engines
- Add custom scraping logic

### Performance Tuning

For large playlists (100+ tracks):

1. **Caching**: Enabled by default (`ENABLE_CACHE = True` in `config.py`, `requests-cache` included in requirements)
2. **Increase Parallelism**: Set `TRACK_WORKERS = 8` or higher
3. **Adjust Time Budgets**: Increase `PER_TRACK_TIME_BUDGET_SEC` if matches are missed
4. **Batch Processing**: Process playlists in smaller batches

### Reproducibility

Use `--seed N` for deterministic results:

```bash
python main.py --xml collection.xml --playlist "Playlist" --seed 42
```

Same seed + same input = same output (useful for testing).

---

## Tips & Best Practices

1. **Use `--myargs` preset**: Optimized for typical use cases
2. **Enable `--auto-research`**: Automatically finds more matches
3. **Review the review file**: Check `*_review.csv` for problematic matches
4. **Check candidates file**: Use `*_candidates.csv` to understand scoring
5. **Enable caching**: Speeds up repeated runs significantly
6. **Process in batches**: For very large playlists, process smaller subsets
7. **Verify critical matches**: Manually check high-value tracks
8. **Use verbose logging**: `--verbose` helps debug issues

---

## License

This project is provided as-is for personal use.

---

## Contributing

Contributions welcome! Areas for improvement:

- Additional search methods
- Improved remix detection
- Better handling of edge cases
- Performance optimizations
- Documentation improvements

---

## Support

For issues or questions:

1. Check the troubleshooting section
2. Review output files (`*_review.csv`, `*_candidates.csv`)
3. Enable verbose logging (`--verbose`)
4. Check existing issues/PRs

---

**Happy Matching! 🎵**
