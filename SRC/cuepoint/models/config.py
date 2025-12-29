#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Configuration settings and constants for Rekordbox → Beatport metadata enricher

This module contains all configuration settings that control the behavior of the
metadata enrichment process. Settings can be overridden via command-line presets
(--fast, --turbo, --myargs), YAML configuration files (--config), or modified programmatically.

Key configuration categories:
1. Search & Concurrency: How many results to fetch, how many parallel workers
2. Similarity & Scoring: Weighting factors for title vs artist matching
3. Early Exit: When to stop searching for a track (performance optimization)
4. Query Generation: Controls for generating search query variants
5. Search Strategy: Which search methods to use (DuckDuckGo, direct Beatport, browser)
6. Timeouts & Limits: Network timeouts and query/candidate limits

YAML Configuration File Support:
Settings can be loaded from a YAML file using the --config flag. The configuration
file uses a nested structure that maps to the flat SETTINGS dictionary. Settings
loaded from YAML are merged with defaults, and can still be overridden by CLI flags.

Example config.yaml structure:
    performance:
      candidate_workers: 15
      track_workers: 12
      time_budget_sec: 45
      max_search_results: 50

    matching:
      min_accept_score: 70
      early_exit_score: 90

    query_generation:
      title_gram_max: 2
      max_queries_per_track: 40
"""

import os

import requests  # type: ignore[import-untyped]

# -----------------------------
# Main Configuration Dictionary
# -----------------------------
# All settings are stored in this dictionary and can be overridden by command-line
# presets or programmatic modifications. Default values are balanced for typical use.
SETTINGS = {
    # ========================================================================
    # SEARCH & CONCURRENCY SETTINGS
    # ========================================================================
    # Controls how many search results to fetch and how much parallel processing to use
    "MAX_SEARCH_RESULTS": 50,  # Maximum number of results to fetch per search query from DuckDuckGo
    # Higher = more candidates but slower. Raised from default to improve
    # recall on sparse queries (rare tracks, remixes)
    "CANDIDATE_WORKERS": 15,  # Number of parallel threads for fetching candidate
    # track data from Beatport
    # Each thread processes one candidate URL at a time
    # Higher = faster but more load on Beatport servers
    # Optimized for fast candidate fetching (was 8)
    "TRACK_WORKERS": 12,  # Number of parallel threads for processing tracks
    # in the playlist
    # Each thread processes one track's queries and matching
    # Higher = faster overall but more memory usage
    # Optimized for parallel track processing (was 1)
    "PER_TRACK_TIME_BUDGET_SEC": 45,  # Maximum time (in seconds) to spend
    # searching for matches per track
    # After this time, the best match found so far is accepted
    # None = no time limit (run all queries)
    # Increased to allow priority queries to complete (was 25)
    # ========================================================================
    # SIMILARITY & SCORING SETTINGS
    # ========================================================================
    # Controls how similarity scores are calculated and what minimum scores are accepted
    "TITLE_WEIGHT": 0.55,  # Weight for title similarity in final score (55% of total)
    # Higher = title matches are more important than artist matches
    "ARTIST_WEIGHT": 0.45,  # Weight for artist similarity in final score (45% of total)
    # Lower = artist mismatches are less penalized
    "MIN_ACCEPT_SCORE": 70,  # Minimum total score required to accept a match
    # Scores range from 0-200+ (title + artist + bonuses)
    # Optimized to catch more valid matches while maintaining quality (was 55)
    # ========================================================================
    # LOGGING SETTINGS
    # ========================================================================
    "VERBOSE": True,  # Enable verbose logging (detailed progress information)
    "TRACE": True,  # Enable trace-level logging (shows every candidate evaluated)
    # ========================================================================
    # NETWORK & CACHING SETTINGS
    # ========================================================================
    "CONNECT_TIMEOUT": 3,  # HTTP connection timeout in seconds
    # How long to wait when establishing connection to Beatport
    # Reduced for faster failures (was 5)
    "READ_TIMEOUT": 8,  # HTTP read timeout in seconds
    # How long to wait for response data after connection established
    # Reduced for faster failures (was 10)
    "ENABLE_CACHE": True,  # Enable HTTP response caching (requires requests-cache package)
    # Speeds up repeated runs by caching Beatport page responses
    # Enabled by default for better performance (was False)
    # ========================================================================
    # SEARCH STRATEGY SETTINGS
    # ========================================================================
    # Controls which search methods are used and in what order
    "USE_DIRECT_SEARCH_FOR_REMIXES": True,  # Use direct Beatport website search for remix queries
    # More reliable than DuckDuckGo for finding remix variants
    # Direct search queries Beatport's own search API
    "PREFER_DIRECT_SEARCH": False,  # If True, prefer direct Beatport search over DuckDuckGo
    # for ALL queries (not just remixes)
    # Direct search is slower but more accurate
    "USE_BROWSER_AUTOMATION": True,  # Use browser automation (Playwright/Selenium) as fallback
    # Slower but most reliable - can find JavaScript-rendered content
    # Enabled by default for maximum reliability (was False)
    "BROWSER_TIMEOUT_SEC": 30,  # Timeout for browser automation operations in seconds
    # How long to wait for page to load in browser
    # ========================================================================
    # DUCKDUCKGO (DDGS) SETTINGS
    # ========================================================================
    # DuckDuckGo search is used to discover Beatport URLs. On some networks
    # (VPN/corporate firewall), DuckDuckGo can be blocked or very slow, causing
    # TLS handshake/connect timeouts. These settings allow tuning or disabling.
    "DDG_ENABLED": True,  # If False, skip DDG entirely and rely on direct search/browser
    "DDG_TIMEOUT_SEC": 6,  # ddgs "overall" timeout in seconds (lower = fail fast on blocked networks)
    "DDG_PREFLIGHT_TIMEOUT_SEC": 1.5,  # quick TCP preflight timeout to avoid long DDG hangs when blocked
    "DDG_REGION": "us-en",  # ddgs region string
    "DDG_PROXY": None,  # Optional proxy URL for ddgs (otherwise ddgs uses env var DDGS_PROXY)
    "DDG_VERIFY_SSL": True,  # bool or path to PEM file for ddgs verify
    # ========================================================================
    # EARLY EXIT SETTINGS (Performance Optimization)
    # ========================================================================
    # Early exit stops searching once a very good match is found, saving time
    # These settings control when early exit is allowed
    "EARLY_EXIT_SCORE": 90,  # Stop searching if a candidate reaches this score or higher
    # Score must pass all guard checks (not rejected)
    # Optimized for faster exits on very good matches (was 95)
    "EARLY_EXIT_MIN_QUERIES": 8,  # Minimum number of queries to run before allowing early exit
    # Prevents premature exit on lucky first-query matches
    # Allows more remix queries before exit (was 12)
    "EARLY_EXIT_REQUIRE_MIX_OK": False,  # Require mix-type compatibility for early exit
    # e.g., don't exit early if searching for "remix" but found "original mix"
    # Disabled for faster exits (was True)
    # ========================================================================
    # EARLY EXIT (FAMILY CONSENSUS) SETTINGS
    # ========================================================================
    # Alternative early exit rules for "family" queries (full title + subset of artists)
    # These are more lenient than the main early exit to allow faster exits on
    # strong partial matches
    "EARLY_EXIT_FAMILY_SCORE": 88,  # Allow early exit on strong full-title + one-artist match
    # Lower than main EARLY_EXIT_SCORE (88 vs 90) for faster exits
    # Optimized for faster exits on strong partial matches (was 93)
    "EARLY_EXIT_FAMILY_AFTER": 5,  # Minimum queries before family consensus early exit is allowed
    # Ensures enough queries have been tried before accepting partial match
    # Reduced for faster exits (was 8)
    "EARLY_EXIT_FAMILY_AFTER_ORIGINAL": 6,  # For original mix tracks,
    # allow family exit after fewer queries
    # Original mixes are easier to match, so less validation needed
    "EARLY_EXIT_MIN_QUERIES_ORIGINAL": 8,  # Minimum queries for original mix tracks overall
    # Lower than standard because original mixes are more common
    # ========================================================================
    # ADAPTIVE MAX RESULTS SETTINGS
    # ========================================================================
    # Dynamically adjust how many search results to fetch based on query type
    # More specific queries (full title + artists) get more results, generic queries get fewer
    "ADAPTIVE_MAX_RESULTS": True,  # Enable adaptive max results per query type
    # True = use MR_LOW/MED/HIGH based on query specificity
    # False = always use MAX_SEARCH_RESULTS
    "MR_LOW": 10,  # Max results for low-specificity queries (title-only, short queries)
    # Fewer results because generic queries return many irrelevant matches
    # Reduced for speed (was 15)
    "MR_MED": 25,  # Max results for medium-specificity queries (partial title + artist)
    # Moderate results for balanced precision/recall
    # Reduced for speed (was 40)
    "MR_HIGH": 50,  # Max results for high-specificity queries (full title + full artists)
    # Many results because specific queries are more likely to be relevant
    # Reduced for speed (was 100)
    # ========================================================================
    # CANDIDATE LIMITS
    # ========================================================================
    "PER_QUERY_CANDIDATE_CAP": None,  # Hard cap on candidate URLs to consider
    # per query (after deduplication)
    # None = no cap, process all candidates found
    # Useful for limiting memory/processing when queries return many results
    # ========================================================================
    # REMIX/SPECIAL VARIANT SETTINGS
    # ========================================================================
    # Settings specific to tracks with explicit remix or special variant indicators in title
    # Allow earlier exit for remix tracks (fewer queries needed)
    "EARLY_EXIT_MIN_QUERIES_REMIX": 12,
    # Increased to ensure multi-artist+remixer queries complete (was 5)
    # These queries are typically in the first 10-12 queries
    "EARLY_EXIT_SCORE_REMIX": 93,  # Lower threshold for remix early exit (93 vs 90)
    # Remix matches are often harder to find, so slightly lower bar
    "REMIX_MAX_QUERIES": 30,  # Hard cap on queries when remix intent is explicit in title
    # Prevents excessive queries for remix-specific searches
    # Increased to allow more remix-specific queries (was 24)
    "ALLOW_GENERIC_ARTIST_REMIX_HINTS": False,  # Don't add generic
    # "<artist> remix" queries unless enabled
    # Generic remix hints can generate too many queries
    # ========================================================================
    # DETERMINISM SETTINGS
    # ========================================================================
    "SEED": 0,  # Random seed for deterministic behavior (ordering, tie-breaking)
    # Same seed + same input = same output (reproducible results)
    # ========================================================================
    # QUERY GENERATION CONTROLS
    # ========================================================================
    # Controls how search queries are generated from track title and artist information
    "TITLE_GRAM_MAX": 2,  # Maximum N-gram size to extract from title (up to bigrams)
    # N-grams: 1-word, 2-word sequences from title
    # Reduced for speed (was 3) - higher = more queries but exponentially slower
    "CROSS_TITLE_GRAMS_WITH_ARTISTS": False,  # Cross title N-grams with artist name variants
    # Creates queries like "title words" + "artist1", "title words" + "artist2"
    # Disabled for speed (was True) - False = fewer but faster queries
    "CROSS_SMALL_ONLY": True,  # Only cross small N-grams (uni/bi-grams) with artists
    # Prevents explosion: "1 word" + artist, "2 words" + artist
    # But NOT "10 words" + artist (too many combinations)
    # Generate queries with reversed order ("artist title" vs "title artist")
    "REVERSE_ORDER_QUERIES": False,
    # False = don't reverse by default (title first)
    # Reversed queries can find different results but add overhead
    "PRIORITY_REVERSE_STAGE": True,  # Allow reversed order queries only in priority query stage
    # Priority queries are the most important ones (full title + artist)
    # Limits reverse queries to most promising searches
    "REVERSE_REMIX_HINTS": True,  # Always allow reversed order for remixer-hint queries
    # Remix queries often work better reversed: "Artist Remix Title"
    # ========================================================================
    # ARTIST WORD SUBSET SETTINGS
    # ========================================================================
    # Generate queries using subsets of artist names (first name, last name, etc.)
    "CROSS_TITLE_WITH_ARTIST_WORD_SUBSETS": False,  # Cross title with
    # individual words from artist names
    # e.g., "John Smith" → "Title John", "Title Smith"
    # Disabled by default (too many queries, rarely helpful)
    "ARTIST_WORD_SUBSET_MAX": 3,  # Maximum words to use from multi-word artist names
    # Prevents explosion with long artist names
    # ========================================================================
    # QUERY EXHAUSTIVENESS SETTINGS
    # ========================================================================
    "RUN_ALL_QUERIES": False,  # Run ALL query variants regardless of time budget or early exit
    # False = stop early when good match found, True = exhaustive search
    # Significantly slower but finds more matches
    # ========================================================================
    # QUERY QUALITY FILTERS
    # ========================================================================
    # Restrict query generation to only high-quality queries
    "FULL_TITLE_WITH_ARTIST_ONLY": True,  # When artists are provided,
    # only generate queries with full title
    # + at least one artist (no title-only queries)
    # Ensures queries are specific enough to be useful
    "FULL_ARTIST_ENTITY_ONLY": True,  # Only use complete artist entities
    # in queries (not word fragments)
    # "John Smith" not "John" or "Smith" individually
    # Ensures artist matching is accurate
    "ENABLE_FORCED_SHORT_PAIRS": False,  # Don't generate short forced word pairs like "never gorje"
    # These are usually low-quality queries that rarely match
    # ========================================================================
    # EXHAUSTIVE TITLE COMBINATION SETTINGS (Advanced)
    # ========================================================================
    # Generate queries from all possible word combinations in the title
    # WARNING: Can generate thousands of queries if enabled!
    "RUN_EXHAUSTIVE_COMBOS": False,  # Enable order-preserving title word combinations
    # "Never Sleep Again" → "Never Sleep", "Sleep Again", "Never Sleep Again", etc.
    # Disabled by default (exponentially many queries)
    "TITLE_COMBO_MIN_LEN": 2,  # Minimum word count for title combinations (start at 2-word combos)
    # Skip single words (too generic)
    "TITLE_COMBO_MAX_LEN": 4,  # Maximum word count for title combinations
    # Cap prevents explosion with long titles
    # Reduced for speed (was 6)
    "INCLUDE_PERMUTATIONS": False,  # Also generate permuted word orders (not just order-preserving)
    # "Never Sleep" → also "Sleep Never"
    # Disabled by default (too many queries, rarely helpful)
    "PERMUTATION_K_CAP": 3,  # Only permute when word count <= this number
    # Permutations of 3+ words generate too many queries
    # Reduced for speed (was 5)
    "MAX_COMBO_QUERIES": 15,  # Optional hard cap on combination queries
    # Safety valve to prevent accidental query explosion
    # Added cap instead of None for speed (was None)
    "QUOTED_TITLE_VARIANT": False,  # Generate quoted title variants ("Title" vs Title)
    # Disabled globally - quotes rarely affect Beatport search results
    # ========================================================================
    # PREFIX & ORDERING SETTINGS
    # ========================================================================
    "LINEAR_PREFIX_ONLY": True,  # Use only left-anchored contiguous prefixes for N-grams
    # "Never Sleep Again" → "Never", "Never Sleep", "Never Sleep Again"
    # NOT: "Sleep", "Sleep Again", "Again" (middle/end fragments)
    # True = fewer queries, faster, but may miss some matches
    # ========================================================================
    # QUERY LIMITS
    # ========================================================================
    "MAX_QUERIES_PER_TRACK": 40,  # Hard cap on total queries generated per track
    # Prevents runaway query generation
    # Optimized to allow remix queries while maintaining speed (was 200)
    # ========================================================================
    # GENERIC PARENTHETICAL PHRASE SCORING (e.g., "Ivory Re-fire", "Club Mix")
    # ========================================================================
    # Scoring adjustments for tracks with special parenthetical phrases in title
    # These phrases indicate specific remix/variant types beyond standard "Remix" or "Extended Mix"
    "GENERIC_PHRASE_MATCH_BONUS": 24,  # Bonus score when candidate matches
    # a special parenthetical phrase
    # e.g., searching for "Burn For You (Ivory Re-fire)" finds "Ivory Re-fire" version
    # Higher bonus = more preference for phrase matches
    "GENERIC_PHRASE_PLAIN_PENALTY": 14,  # Penalty when searching for
    # special phrase but only plain/original found
    # Mild penalty to slightly prefer phrase matches when available
    # "Burn For You (Ivory Re-fire)" should prefer "Ivory Re-fire" over plain version
    "GENERIC_PHRASE_ORIG_PENALTY": 18,  # Extra penalty for Original Mix
    # when special phrase exists and phrase-match seen
    # If we find both "Ivory Re-fire" AND "Original Mix", strongly prefer "Ivory Re-fire"
    # Higher penalty than EXT_PENALTY because Original is more generic
    "GENERIC_PHRASE_EXT_PENALTY": 8,  # Extra penalty for Extended Mix
    # when special phrase exists and phrase-match seen
    # Similar to ORIG_PENALTY but smaller (Extended is closer to special phrases)
    "GENERIC_PHRASE_STRICT_REJECT_TSIM": 96,  # Strict rejection threshold
    # for title similarity when phrase mismatch
    # If title similarity >= 96 but phrase doesn't match, reject candidate
    # Prevents high-similarity false positives that lack the special phrase
}

# ========================================================================
# HTTP CONFIGURATION
# ========================================================================

# User-Agent string to identify our requests to Beatport
# Using Safari user-agent to appear as legitimate browser traffic
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"
)

# HTTP headers for all requests
HEADERS = {
    "User-Agent": USER_AGENT,  # Browser identification
    "Accept-Language": "en-US,en;q=0.9",  # Preferred languages
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",  # Content types
}

# Base URL for Beatport website
BASE_URL = "https://www.beatport.com"

# Persistent HTTP session (reuses connections for better performance)
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

# Check if requests-cache is available for HTTP response caching
# If available, responses are cached to speed up repeated runs
try:
    import requests_cache  # noqa: F401

    HAVE_CACHE = True
except Exception:
    HAVE_CACHE = False

# ========================================================================
# MUSICAL KEY EQUIVALENTS
# ========================================================================
# These are equivalent key notations (e.g., C# = Db, D# = Eb)
# Used for key matching bonuses - candidates in equivalent keys get partial credit
NEAR_KEYS = {
    "c#": {"db"},
    "db": {"c#"},  # C-sharp = D-flat
    "d#": {"eb"},
    "eb": {"d#"},  # D-sharp = E-flat
    "f#": {"gb"},
    "gb": {"f#"},  # F-sharp = G-flat
    "g#": {"ab"},
    "ab": {"g#"},  # G-sharp = A-flat
    "a#": {"bb"},
    "bb": {"a#"},  # A-sharp = B-flat
}

# ========================================================================
# YAML CONFIGURATION FILE SUPPORT
# ========================================================================


def _flatten_yaml_dict(nested_dict: dict, parent_key: str = "", sep: str = "_") -> dict:
    """
    Flatten a nested dictionary structure to match SETTINGS keys

    Converts nested YAML structure to flat dictionary keys:
    {"performance": {"candidate_workers": 15}} -> {"CANDIDATE_WORKERS": 15}

    Args:
        nested_dict: Nested dictionary from YAML file
        parent_key: Parent key prefix for nested items
        sep: Separator to use between nested keys

    Returns:
        Flattened dictionary with uppercase keys matching SETTINGS format
    """
    from typing import Any, List

    items: list[tuple[str, Any]] = []
    for key, value in nested_dict.items():
        # Convert key to uppercase to match SETTINGS convention
        new_key = key.upper()
        if parent_key:
            new_key = f"{parent_key}{sep}{new_key}"

        if isinstance(value, dict):
            # Recursively flatten nested dictionaries
            items.extend(_flatten_yaml_dict(value, new_key, sep=sep).items())
        else:
            items.append((new_key, value))
    return dict(items)


def _map_yaml_keys_to_settings(yaml_dict: dict) -> dict:
    """
    Map YAML file keys to SETTINGS dictionary keys

    This function handles the mapping from user-friendly YAML structure to
    the internal SETTINGS dictionary keys. It supports both nested structures
    and direct key mappings.

    Args:
        yaml_dict: Flattened dictionary from YAML file (already processed by _flatten_yaml_dict)

    Returns:
        Dictionary with keys matching SETTINGS format
    """
    # Mapping from common YAML keys to SETTINGS keys
    # This handles user-friendly nested key names (e.g., "performance.candidate_workers")
    key_mapping = {
        "PERFORMANCE_CANDIDATE_WORKERS": "CANDIDATE_WORKERS",
        "PERFORMANCE_TRACK_WORKERS": "TRACK_WORKERS",
        "PERFORMANCE_TIME_BUDGET_SEC": "PER_TRACK_TIME_BUDGET_SEC",
        "PERFORMANCE_MAX_SEARCH_RESULTS": "MAX_SEARCH_RESULTS",
        "MATCHING_MIN_ACCEPT_SCORE": "MIN_ACCEPT_SCORE",
        "MATCHING_EARLY_EXIT_SCORE": "EARLY_EXIT_SCORE",
        "MATCHING_EARLY_EXIT_MIN_QUERIES": "EARLY_EXIT_MIN_QUERIES",
        "QUERY_GENERATION_TITLE_GRAM_MAX": "TITLE_GRAM_MAX",
        "QUERY_GENERATION_MAX_QUERIES_PER_TRACK": "MAX_QUERIES_PER_TRACK",
        "QUERY_GENERATION_CROSS_TITLE_GRAMS_WITH_ARTISTS": "CROSS_TITLE_GRAMS_WITH_ARTISTS",
        "NETWORK_CONNECT_TIMEOUT": "CONNECT_TIMEOUT",
        "NETWORK_READ_TIMEOUT": "READ_TIMEOUT",
        "NETWORK_ENABLE_CACHE": "ENABLE_CACHE",
        "SEARCH_USE_BROWSER_AUTOMATION": "USE_BROWSER_AUTOMATION",
        "SEARCH_BROWSER_TIMEOUT_SEC": "BROWSER_TIMEOUT_SEC",
        "LOGGING_VERBOSE": "VERBOSE",
        "LOGGING_TRACE": "TRACE",
        "DETERMINISM_SEED": "SEED",
    }

    # Also allow direct SETTINGS key names (uppercase, no nesting)
    # This allows users to directly specify SETTINGS keys if they prefer
    result = {}
    for key, value in yaml_dict.items():
        # Try mapping first, then use key directly if it matches SETTINGS
        mapped_key = key_mapping.get(key, key)
        # Only include keys that exist in SETTINGS
        if mapped_key in SETTINGS:
            result[mapped_key] = value
        elif key in SETTINGS:
            # Allow direct SETTINGS keys
            result[key] = value
        # Silently ignore unknown keys (allows YAML files with extra comments/sections)

    return result


def load_config_from_yaml(yaml_path: str) -> dict:
    """
    Load configuration settings from a YAML file

    The YAML file can use a nested structure for organization. Nested keys are
    automatically flattened and mapped to SETTINGS dictionary keys.

    Example YAML structure:
        performance:
          candidate_workers: 15
          track_workers: 12
          time_budget_sec: 45

        matching:
          min_accept_score: 70

    Settings from YAML are merged with defaults. CLI flags still override YAML settings.

    Args:
        yaml_path: Path to YAML configuration file

    Returns:
        Dictionary of settings to merge into SETTINGS

    Raises:
        FileNotFoundError: If YAML file doesn't exist
        yaml.YAMLError: If YAML file is invalid
        ValueError: If YAML contains invalid setting values
    """
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        raise ImportError("YAML support requires pyyaml. Install with: pip install pyyaml>=6.0")

    if not os.path.exists(yaml_path):
        raise FileNotFoundError(f"Configuration file not found: {yaml_path}")

    with open(yaml_path, "r", encoding="utf-8") as f:
        yaml_content = yaml.safe_load(f)

    if not isinstance(yaml_content, dict):
        raise ValueError(f"YAML file must contain a dictionary at root level: {yaml_path}")

    # Flatten nested structure
    flattened = _flatten_yaml_dict(yaml_content)

    # Map to SETTINGS keys
    settings_dict = _map_yaml_keys_to_settings(flattened)

    # Validate setting types
    for key, value in settings_dict.items():
        default_value = SETTINGS.get(key)
        if default_value is not None:
            # Type check: ensure YAML value matches default type
            if not isinstance(value, type(default_value)):
                # Allow int/float conversion for numeric types
                if isinstance(default_value, (int, float)) and isinstance(value, (int, float)):
                    pass  # OK - both numeric
                elif isinstance(default_value, bool) and isinstance(value, bool):
                    pass  # OK - both boolean
                elif isinstance(default_value, bool) and isinstance(value, (str, int)):
                    # Allow string/int to bool conversion
                    if isinstance(value, str):
                        settings_dict[key] = value.lower() in ("true", "1", "yes", "on")
                    else:
                        settings_dict[key] = bool(value)
                elif isinstance(default_value, (int, float)) and isinstance(value, str):
                    # Try to convert string to number
                    try:
                        if isinstance(default_value, int):
                            settings_dict[key] = int(value)
                        else:
                            settings_dict[key] = float(value)
                    except ValueError:
                        raise ValueError(
                            f"Setting {key} expects {type(default_value).__name__}, "
                            f"got {type(value).__name__} ({value})"
                        )
                else:
                    raise ValueError(
                        f"Setting {key} expects {type(default_value).__name__}, "
                        f"got {type(value).__name__} ({value})"
                    )

    return settings_dict
